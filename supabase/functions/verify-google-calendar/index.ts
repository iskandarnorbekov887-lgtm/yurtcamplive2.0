/**
 * Edge Function: verify-google-calendar
 *
 * Lightweight connection test for the Google Calendar integration.
 * Called by the "Test Connection" button on the Team Settings page.
 *
 * Steps:
 *  1. Validate the caller's JWT
 *  2. Resolve team_id from profiles (same logic as google-calendar-proxy)
 *  3. Load credentials from team_settings
 *  4. Call Google Calendar's calendarList.get endpoint (metadata only — cheap)
 *  5. Return { ok: true, meta } on success, { ok: false, error } on failure
 *
 * This function never echoes the API key back to the client.
 *
 * Deployment:
 *   supabase functions deploy verify-google-calendar --no-verify-jwt=false
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers':
        'authorization, x-client-info, apikey, content-type',
    },
  });
}

function errorResponse(code: string, message: string, status = 400): Response {
  // Never echo credential values
  return json({ ok: false, error: { code, message } }, status);
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {

  // ── CORS pre-flight ──────────────────────────────────────────────────────
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers':
          'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  if (req.method !== 'POST') {
    return errorResponse('METHOD_NOT_ALLOWED', 'Only POST requests are accepted.', 405);
  }

  // ── Environment validation ───────────────────────────────────────────────
  const supabaseUrl    = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey        = Deno.env.get('SUPABASE_ANON_KEY');

  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    console.error('[verify-google-calendar] Missing required env vars');
    return errorResponse('SERVER_MISCONFIGURED', 'Server configuration error. Contact the administrator.', 500);
  }

  // ── Authenticate the caller ──────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return errorResponse('UNAUTHORIZED', 'Missing or malformed Authorization header.', 401);
  }

  const callerJwt = authHeader.replace('Bearer ', '').trim();

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${callerJwt}` } },
    auth: { persistSession: false },
  });

  const { data: { user }, error: authError } = await callerClient.auth.getUser();

  if (authError || !user) {
    return errorResponse('UNAUTHORIZED', 'Your session is invalid or has expired. Please sign in again.', 401);
  }

  // ── Service-role client for privileged DB reads ──────────────────────────
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // ── Step 1: Resolve team_id from the caller's profile ────────────────────
  const { data: profile, error: profileError } = await adminClient
    .from('profiles')
    .select('id, role, team_id')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError) {
    console.error('[verify-google-calendar] Profile lookup failed:', profileError.message);
    return errorResponse('PROFILE_ERROR', 'Could not retrieve your profile.', 500);
  }

  if (!profile) {
    return errorResponse('PROFILE_NOT_FOUND', 'No profile found for the authenticated user.', 404);
  }

  // Only CEO role may use this function
  const role: string = (profile as any).role ?? '';
  if (role.toLowerCase() !== 'ceo') {
    return errorResponse(
      'FORBIDDEN',
      'Only users with the CEO role can verify Google Calendar credentials.',
      403,
    );
  }

  const teamId: string = (profile as any).team_id ?? profile.id;

  // ── Step 2: Fetch credentials from team_settings ─────────────────────────
  const { data: settings, error: settingsError } = await adminClient
    .from('team_settings')
    .select('google_api_key, google_calendar_id, google_calendar_integration_method, google_ical_url, google_oauth_access_token, google_oauth_refresh_token, google_oauth_token_expiry')
    .eq('team_id', teamId)
    .maybeSingle();

  if (settingsError) {
    console.error('[verify-google-calendar] team_settings lookup failed:', settingsError.message);
    return errorResponse('SETTINGS_ERROR', 'Failed to load team settings.', 500);
  }

  if (!settings) {
    return errorResponse(
      'SETTINGS_NOT_CONFIGURED',
      'No Google Calendar credentials found for your team. Please save them first on the Team Settings page.',
      422,
    );
  }

  const integrationMethod = (settings as any).google_calendar_integration_method || 'api';
  const icalUrl = (settings as any).google_ical_url;
  const apiKey = (settings as any).google_api_key;
  const calendarId = (settings as any).google_calendar_id;
  const accessToken = (settings as any).google_oauth_access_token;
  const refreshToken = (settings as any).google_oauth_refresh_token;
  const tokenExpiry = (settings as any).google_oauth_token_expiry;

  // ── Step 3: Branch based on integration method ───────────────────────────
  if (integrationMethod === 'ical') {
    // iCal mode: validate the iCal URL is accessible and returns valid iCal data
    if (!icalUrl || !calendarId) {
      return errorResponse(
        'CREDENTIALS_INCOMPLETE',
        'iCal Feed URL and Calendar ID are required for iCal mode.',
        422,
      );
    }

    let icsResponse: Response;
    let icsText: string;
    try {
      icsResponse = await fetch(icalUrl, {
        method: 'GET',
        headers: {
          Accept: 'text/calendar',
          'User-Agent': 'YurtCamp-ICalVerify/1.0',
        },
      });

      if (!icsResponse.ok) {
        console.error(`[verify-google-calendar] Failed to fetch iCal: HTTP ${icsResponse.status}`);
        return errorResponse(
          'ICAL_FETCH_ERROR',
          `Failed to fetch iCal feed (HTTP ${icsResponse.status}). Please verify the URL is correct and publicly accessible.`,
          502,
        );
      }

      icsText = await icsResponse.text();
    } catch (networkErr: unknown) {
      const msg = networkErr instanceof Error ? networkErr.message : String(networkErr);
      console.error('[verify-google-calendar] Network error fetching iCal:', msg);
      return errorResponse(
        'ICAL_NETWORK_ERROR',
        'Could not reach the iCal feed URL. Please check the URL and your network.',
        502,
      );
    }

    // Validate it's a valid iCal file
    if (!icsText.trim().startsWith('BEGIN:VCALENDAR')) {
      return errorResponse(
        'ICAL_INVALID_FORMAT',
        'The URL does not return valid iCal data. Please verify the URL points to a valid .ics file.',
        422,
      );
    }

    console.info(
      `[verify-google-calendar] ✅ iCal verification OK. team=${teamId} user=${user.id} calendar="${calendarId}"`,
    );

    return json({
      ok: true,
      meta: {
        team_id: teamId,
        calendar_id: calendarId,
        calendar_name: 'iCal Feed',
        integration_method: 'ical',
        verified_at: new Date().toISOString(),
        verified_by_role: role,
      },
    }, 200);
  }

  // OAuth mode: validate OAuth tokens and test access to Google Calendar
  if (integrationMethod === 'oauth') {
    if (!accessToken || !refreshToken || !calendarId) {
      return errorResponse(
        'CREDENTIALS_INCOMPLETE',
        'OAuth tokens are missing. Please complete the OAuth flow by clicking "Connect with Google".',
        422,
      );
    }

    // Check if token is expired or will expire soon (within 5 minutes)
    let currentAccessToken = accessToken;
    const now = new Date();
    const expiryDate = tokenExpiry ? new Date(tokenExpiry) : null;
    const isExpired = expiryDate && now >= new Date(expiryDate.getTime() - 5 * 60 * 1000);

    if (isExpired) {
      // Refresh the token
      const clientId = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID');
      const clientSecret = Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET');

      if (!clientId || !clientSecret) {
        return errorResponse(
          'SERVER_MISCONFIGURED',
          'OAuth credentials not configured on the server.',
          500,
        );
      }

      // Simple decryption (upgrade to proper encryption in production)
      const decryptedRefreshToken = atob(refreshToken);

      try {
        const refreshResponse = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            refresh_token: decryptedRefreshToken,
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: 'refresh_token',
          }),
        });

        if (!refreshResponse.ok) {
          const errorText = await refreshResponse.text();
          console.error('[verify-google-calendar] Token refresh failed:', errorText);
          return errorResponse(
            'OAUTH_REFRESH_FAILED',
            'Failed to refresh OAuth token. Please re-authorize by clicking "Connect with Google".',
            401,
          );
        }

        const tokenData = await refreshResponse.json();
        const { access_token, expires_in } = tokenData;

        // Calculate new expiry time
        const expiresAt = new Date(Date.now() + (expires_in || 3600) * 1000).toISOString();

        // Encrypt new access token
        const encryptedAccessToken = btoa(access_token);

        // Update stored tokens
        const { error: updateError } = await adminClient
          .from('team_settings')
          .update({
            google_oauth_access_token: encryptedAccessToken,
            google_oauth_token_expiry: expiresAt,
          })
          .eq('team_id', teamId);

        if (updateError) {
          console.error('[verify-google-calendar] Failed to update OAuth tokens:', updateError);
          // Continue with the new token anyway
        }

        currentAccessToken = encryptedAccessToken;
      } catch (refreshErr: unknown) {
        const msg = refreshErr instanceof Error ? refreshErr.message : String(refreshErr);
        console.error('[verify-google-calendar] Token refresh error:', msg);
        return errorResponse(
          'OAUTH_REFRESH_ERROR',
          'Error refreshing OAuth token. Please re-authorize by clicking "Connect with Google".',
          500,
        );
      }
    }

    // Simple decryption (upgrade to proper encryption in production)
    const decryptedAccessToken = atob(currentAccessToken);

    // Call Google Calendar API with OAuth token
    const encodedCalendarId = encodeURIComponent(calendarId);
    const verifyUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodedCalendarId}`;

    let googleResponse: Response;
    try {
      googleResponse = await fetch(verifyUrl, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${decryptedAccessToken}`,
          Accept: 'application/json',
          'User-Agent': 'YurtCamp-CalendarVerify/1.0',
        },
      });
    } catch (networkErr: unknown) {
      const msg = networkErr instanceof Error ? networkErr.message : String(networkErr);
      console.error('[verify-google-calendar] Network error:', msg);
      return errorResponse(
        'GOOGLE_NETWORK_ERROR',
        'Could not reach the Google Calendar API. Please check your network.',
        502,
      );
    }

    // Evaluate the Google response
    if (!googleResponse.ok) {
      const status = googleResponse.status;

      console.error(`[verify-google-calendar] Google returned ${status}`);

      const clientMessage = (() => {
        switch (status) {
          case 401:
            return 'OAuth token is invalid or expired. Please re-authorize by clicking "Connect with Google".';
          case 404:
            return 'Calendar not found. Verify the Calendar ID is correct.';
          case 403:
            return 'Access denied. Ensure your Google account has access to this calendar.';
          default:
            return `Google Calendar returned an error (${status}). Please verify your OAuth setup.`;
        }
      })();

      return errorResponse('GOOGLE_API_ERROR', clientMessage, status >= 500 ? 502 : status);
    }

    // Parse the calendar metadata and return
    let calendarMeta: Record<string, unknown> = {};
    try {
      calendarMeta = await googleResponse.json();
    } catch {
      return errorResponse('PARSE_ERROR', 'Received an unexpected response from Google.', 502);
    }

    const calendarSummary: string = (calendarMeta?.summary as string) ?? '';

    console.info(
      `[verify-google-calendar] ✅ OAuth verification OK. team=${teamId} user=${user.id} calendar="${calendarSummary}"`,
    );

    return json({
      ok: true,
      meta: {
        team_id: teamId,
        calendar_id: calendarId,
        calendar_name: calendarSummary,
        integration_method: 'oauth',
        verified_at: new Date().toISOString(),
        verified_by_role: role,
      },
    }, 200);
  }

  // API mode: existing Google Calendar API validation
  if (!apiKey || !calendarId) {
    return errorResponse(
      'CREDENTIALS_INCOMPLETE',
      'Your team\'s Google Calendar credentials are incomplete. Please fill in both fields.',
      422,
    );
  }

  // ── Step 3: Ping Google Calendar API ─────────────────────────────────────
  // We use the Calendars.get endpoint — it returns calendar metadata without
  // fetching events. This is the cheapest possible validity check.
  const encodedCalendarId = encodeURIComponent(calendarId);
  const verifyUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodedCalendarId}?key=${apiKey}`;

  let googleResponse: Response;
  try {
    googleResponse = await fetch(verifyUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'YurtCamp-CalendarVerify/1.0',
      },
    });
  } catch (networkErr: unknown) {
    const msg = networkErr instanceof Error ? networkErr.message : String(networkErr);
    console.error('[verify-google-calendar] Network error:', msg);
    return errorResponse(
      'GOOGLE_NETWORK_ERROR',
      'Could not reach the Google Calendar API. Please check your network.',
      502,
    );
  }

  // ── Step 4: Evaluate the Google response ─────────────────────────────────
  if (!googleResponse.ok) {
    let googleBody: Record<string, unknown> = {};
    try { googleBody = await googleResponse.json(); } catch { /* ignore */ }

    const googleMessage = (googleBody?.error as any)?.message ?? 'Unknown error';
    const status = googleResponse.status;

    console.error(`[verify-google-calendar] Google returned ${status}: ${googleMessage}`);

    // Map to safe, informative client messages — no key in the message
    const clientMessage = (() => {
      switch (status) {
        case 400:
          return `Invalid Calendar ID format. Please double-check the Calendar ID in your settings.`;
        case 401:
        case 403:
          return 'The API key is invalid, expired, or missing the Calendar API permission. Please update it in Team Settings.';
        case 404:
          return 'Calendar not found. Verify the Calendar ID is correct and that the calendar is publicly accessible or shared with the API key.';
        case 429:
          return 'Google API rate limit exceeded. Please wait a moment and try again.';
        default:
          return `Google Calendar returned an error (${status}). Please verify your credentials.`;
      }
    })();

    return errorResponse('GOOGLE_API_ERROR', clientMessage, status >= 500 ? 502 : status);
  }

  // ── Step 5: Parse the calendar metadata and return ────────────────────────
  let calendarMeta: Record<string, unknown> = {};
  try {
    calendarMeta = await googleResponse.json();
  } catch {
    return errorResponse('PARSE_ERROR', 'Received an unexpected response from Google.', 502);
  }

  const calendarSummary: string = (calendarMeta?.summary as string) ?? '';

  console.info(
    `[verify-google-calendar] ✅ Verification OK. team=${teamId} user=${user.id} calendar="${calendarSummary}"`,
  );

  return json({
    ok: true,
    meta: {
      team_id: teamId,
      calendar_id: calendarId,
      calendar_name: calendarSummary,
      verified_at: new Date().toISOString(),
      verified_by_role: role,
    },
  }, 200);
});
