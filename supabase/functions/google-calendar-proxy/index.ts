/**
 * Edge Function: google-calendar-proxy
 *
 * Secure server-side proxy that:
 *  1. Validates the caller's JWT (Supabase Auth)
 *  2. Resolves the caller's team_id from `profiles`
 *  3. Loads google_api_key + google_calendar_id from `team_settings`
 *  4. Forwards a read-only GET request to the Google Calendar Events API
 *  5. Returns the calendar payload — never exposes credentials to the client
 *
 * Deployment:
 *   supabase functions deploy google-calendar-proxy --no-verify-jwt=false
 *
 * Query params accepted (all optional, forwarded to Google):
 *   timeMin, timeMax, maxResults, singleEvents, orderBy, pageToken
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ─── Constants ────────────────────────────────────────────────────────────────

const GOOGLE_CALENDAR_BASE =
  'https://www.googleapis.com/calendar/v3/calendars';

/** Only these params are forwarded to Google to prevent open-proxy abuse. */
const ALLOWED_FORWARD_PARAMS = new Set([
  'timeMin',
  'timeMax',
  'maxResults',
  'singleEvents',
  'orderBy',
  'pageToken',
  'q',
  'showDeleted',
]);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      // Allow the Next.js frontend (same Supabase project) to call this function
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers':
        'authorization, x-client-info, apikey, content-type',
    },
  });
}

function errorResponse(
  code: string,
  message: string,
  status: number,
): Response {
  // Never include credential values in error responses
  return json({ error: { code, message } }, status);
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // ── CORS pre-flight ──────────────────────────────────────────────────────
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers':
          'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  // ── Only allow GET ───────────────────────────────────────────────────────
  if (req.method !== 'GET') {
    return errorResponse(
      'METHOD_NOT_ALLOWED',
      'Only GET requests are accepted.',
      405,
    );
  }

  // ── Validate environment variables ───────────────────────────────────────
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    console.error(
      '[google-calendar-proxy] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY',
    );
    return errorResponse(
      'SERVER_MISCONFIGURED',
      'Server configuration error. Contact the administrator.',
      500,
    );
  }

  // ── Extract and verify the caller's JWT ──────────────────────────────────
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return errorResponse(
      'UNAUTHORIZED',
      'Missing or malformed Authorization header.',
      401,
    );
  }
  const callerJwt = authHeader.replace('Bearer ', '').trim();

  // Use anon key client scoped to the caller's JWT to resolve their identity
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!anonKey) {
    return errorResponse(
      'SERVER_MISCONFIGURED',
      'Server configuration error. Contact the administrator.',
      500,
    );
  }

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${callerJwt}` } },
    auth: { persistSession: false },
  });

  const {
    data: { user },
    error: authError,
  } = await callerClient.auth.getUser();

  if (authError || !user) {
    return errorResponse(
      'UNAUTHORIZED',
      'Your session is invalid or has expired. Please sign in again.',
      401,
    );
  }

  // ── Create service-role client for privileged DB access ──────────────────
  // This client bypasses RLS so it can read team_settings.
  // It is NEVER exposed to the frontend.
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
    console.error('[google-calendar-proxy] Profile lookup failed:', profileError.message);
    return errorResponse(
      'PROFILE_ERROR',
      'Could not retrieve your profile. Please try again.',
      500,
    );
  }

  if (!profile) {
    return errorResponse(
      'PROFILE_NOT_FOUND',
      'No profile found for the authenticated user.',
      404,
    );
  }

  // team_id: prefer explicit column, fall back to user.id (single-team setup)
  const teamId: string = (profile as any).team_id ?? profile.id;

  // ── Step 2: Fetch credentials from team_settings ─────────────────────────
  const { data: settings, error: settingsError } = await adminClient
    .from('team_settings')
    .select('google_api_key, google_calendar_id')
    .eq('team_id', teamId)
    .maybeSingle();

  if (settingsError) {
    console.error(
      '[google-calendar-proxy] team_settings lookup failed:',
      settingsError.message,
    );
    return errorResponse(
      'SETTINGS_ERROR',
      'Failed to load team settings. Please try again.',
      500,
    );
  }

  if (!settings) {
    return errorResponse(
      'SETTINGS_NOT_CONFIGURED',
      'Google Calendar integration is not configured for your team. Please add your credentials in the Team Integration Settings page.',
      422,
    );
  }

  const { google_api_key: apiKey, google_calendar_id: calendarId } = settings;

  if (!apiKey || !calendarId) {
    return errorResponse(
      'CREDENTIALS_INCOMPLETE',
      'Your team\'s Google Calendar credentials are incomplete. Please update them in the Team Integration Settings page.',
      422,
    );
  }

  // ── Step 3: Build the Google Calendar API request ────────────────────────
  const incomingUrl = new URL(req.url);
  const googleParams = new URLSearchParams();

  // Forward only whitelisted query parameters
  for (const [key, value] of incomingUrl.searchParams.entries()) {
    if (ALLOWED_FORWARD_PARAMS.has(key)) {
      googleParams.set(key, value);
    }
  }

  // Append the secret API key server-side — never sent to or from the client
  googleParams.set('key', apiKey);

  // Encode the calendar ID (it often contains @ which must be percent-encoded)
  const encodedCalendarId = encodeURIComponent(calendarId);
  const googleUrl = `${GOOGLE_CALENDAR_BASE}/${encodedCalendarId}/events?${googleParams.toString()}`;

  // ── Step 4: Call the Google Calendar API ────────────────────────────────
  let googleResponse: Response;
  try {
    googleResponse = await fetch(googleUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'YurtCamp-CalendarProxy/1.0',
      },
    });
  } catch (networkError: unknown) {
    const msg = networkError instanceof Error ? networkError.message : String(networkError);
    console.error('[google-calendar-proxy] Network error calling Google API:', msg);
    return errorResponse(
      'GOOGLE_NETWORK_ERROR',
      'Could not reach the Google Calendar API. Please check your network and try again.',
      502,
    );
  }

  // ── Step 5: Handle Google API errors without leaking the API key ─────────
  if (!googleResponse.ok) {
    let googleErrorBody: Record<string, unknown> = {};
    try {
      googleErrorBody = await googleResponse.json();
    } catch {
      // ignore parse errors
    }

    // Extract only the safe error message from Google's response
    const googleMessage =
      (googleErrorBody?.error as any)?.message ?? 'Unknown Google API error';
    const googleStatus = googleResponse.status;

    console.error(
      `[google-calendar-proxy] Google API returned ${googleStatus}: ${googleMessage}`,
    );

    // Map Google status codes to meaningful client messages
    const clientMessage = (() => {
      switch (googleStatus) {
        case 400:
          return `Invalid request to Google Calendar API: ${googleMessage}`;
        case 401:
        case 403:
          return 'The stored Google API key is invalid or has insufficient permissions. Please update it in Team Integration Settings.';
        case 404:
          return 'The configured Google Calendar ID was not found. Please verify it in Team Integration Settings.';
        case 429:
          return 'Google Calendar API rate limit exceeded. Please try again in a moment.';
        default:
          return `Google Calendar API error (${googleStatus}). Please try again.`;
      }
    })();

    return errorResponse('GOOGLE_API_ERROR', clientMessage, googleStatus >= 500 ? 502 : googleStatus);
  }

  // ── Step 6: Parse and return calendar data ───────────────────────────────
  let calendarData: unknown;
  try {
    calendarData = await googleResponse.json();
  } catch {
    return errorResponse(
      'PARSE_ERROR',
      'Received an unexpected response from Google Calendar API.',
      502,
    );
  }

  // Inject metadata for the client (team_id, calendar_id — safe to expose)
  const responsePayload = {
    ok: true,
    meta: {
      team_id: teamId,
      calendar_id: calendarId,
      fetched_at: new Date().toISOString(),
      fetched_by_role: profile.role ?? 'unknown',
    },
    data: calendarData,
  };

  console.info(
    `[google-calendar-proxy] Successfully fetched calendar for team=${teamId} user=${user.id}`,
  );

  return json(responsePayload, 200);
});
