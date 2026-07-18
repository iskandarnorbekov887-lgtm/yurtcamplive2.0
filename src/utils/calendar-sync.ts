import { auth, calendar } from '@googleapis/calendar';
import { supabase as supabaseAdmin } from '@/app/api/_supabase';

// Cache client instances by teamId to avoid re-initializing GoogleAuth repeatedly
const clientCache = new Map<string, { calClient: any; calendarId: string; integrationMethod: 'api' | 'ical' | 'oauth'; icalUrl?: string; accessToken?: string; tokenExpiry?: string }>();

export function invalidateCalendarCache(teamId: string) {
  clientCache.delete(teamId);
}

export function invalidateAllCalendarCache() {
  clientCache.clear();
}

// ─── OAuth Token Refresh ───────────────────────────────────────────────────────

async function refreshOAuthToken(teamId: string): Promise<string | null> {
  try {
    // Get current refresh token
    const { data: settings, error } = await supabaseAdmin
      .from('team_settings')
      .select('google_oauth_refresh_token')
      .eq('team_id', teamId)
      .single();

    if (error || !settings?.google_oauth_refresh_token) {
      console.error('[calendar-sync] Failed to get refresh token:', error);
      return null;
    }

    // Simple decryption (upgrade to proper encryption in production)
    const refreshToken = Buffer.from(settings.google_oauth_refresh_token, 'base64').toString('utf8');

    // Call Google's token endpoint to refresh
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      console.error('[calendar-sync] OAuth credentials not configured');
      return null;
    }

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[calendar-sync] Token refresh failed:', errorText);
      return null;
    }

    const tokenData = await response.json();
    const { access_token, expires_in } = tokenData;

    // Calculate new expiry time
    const expiresAt = new Date(Date.now() + (expires_in || 3600) * 1000).toISOString();

    // Encrypt new access token
    const encryptedAccessToken = Buffer.from(access_token).toString('base64');

    // Update stored tokens
    const { error: updateError } = await supabaseAdmin
      .from('team_settings')
      .update({
        google_oauth_access_token: encryptedAccessToken,
        google_oauth_token_expiry: expiresAt,
      })
      .eq('team_id', teamId);

    if (updateError) {
      console.error('[calendar-sync] Failed to update OAuth tokens:', updateError);
      return null;
    }

    return encryptedAccessToken;
  } catch (error) {
    console.error('[calendar-sync] OAuth token refresh error:', error);
    return null;
  }
}

async function getCalendarClient(teamId: string) {
  if (clientCache.has(teamId)) return clientCache.get(teamId)!;

  // 1. Query team_settings securely via the service role client
  const { data: settings, error } = await supabaseAdmin
    .from('team_settings')
    .select('google_service_account_email, google_private_key, google_calendar_id, google_calendar_integration_method, google_ical_url, google_oauth_access_token, google_oauth_refresh_token, google_oauth_token_expiry')
    .eq('team_id', teamId)
    .single();

  if (error || !settings) {
    throw new Error('Google Calendar not configured for this team');
  }

  const email = settings.google_service_account_email;
  let key = settings.google_private_key;
  const calendarId = settings.google_calendar_id;
  const integrationMethod = settings.google_calendar_integration_method || 'api';
  const icalUrl = settings.google_ical_url;
  const accessToken = settings.google_oauth_access_token;
  const refreshToken = settings.google_oauth_refresh_token;
  const tokenExpiry = settings.google_oauth_token_expiry;

  if (integrationMethod === 'api') {
    if (key) {
      key = key.replace(/\\n/g, '\n');
      if (key.startsWith('"') && key.endsWith('"')) {
        key = key.slice(1, -1).replace(/\\n/g, '\n');
      }
    }

    if (!email || !key || !calendarId) {
      throw new Error('Google Calendar not configured for this team (API mode requires service account credentials)');
    }

    const authClient = new auth.GoogleAuth({
      credentials: {
        client_email: email,
        private_key: key,
      },
      scopes: ['https://www.googleapis.com/auth/calendar'],
    });

    const calClient = calendar({ version: 'v3', auth: authClient });
    const result = { calClient, calendarId, integrationMethod: 'api' as const };
    
    clientCache.set(teamId, result);
    return result;
  } else if (integrationMethod === 'ical') {
    if (!icalUrl || !calendarId) {
      throw new Error('Google Calendar not configured for this team (iCal mode requires iCal URL)');
    }

    const result = { calClient: null, calendarId, integrationMethod: 'ical' as const, icalUrl };
    
    clientCache.set(teamId, result);
    return result;
  } else if (integrationMethod === 'oauth') {
    if (!accessToken || !refreshToken || !calendarId) {
      throw new Error('Google Calendar not configured for this team (OAuth mode requires tokens)');
    }

    const result = { calClient: null, calendarId, integrationMethod: 'oauth' as const, accessToken, tokenExpiry };
    
    clientCache.set(teamId, result);
    return result;
  } else {
    throw new Error(`Unknown integration method: ${integrationMethod}`);
  }
}

export async function listEvents(teamId: string, timeMin?: string, timeMax?: string, userJwt?: string) {
  const clientInfo = await getCalendarClient(teamId);

  if (clientInfo.integrationMethod === 'ical') {
    // Call the iCal Edge Function
    const { calClient, calendarId, icalUrl } = clientInfo;
    const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const token = userJwt || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
    
    // Build query params for the Edge Function
    const params = new URLSearchParams();
    if (timeMin) params.set('timeMin', timeMin);
    if (timeMax) params.set('timeMax', timeMax);
    
    const response = await fetch(`${baseUrl}/functions/v1/ical-calendar-proxy?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      console.error('[calendar-sync] iCal Edge Function error response:', JSON.stringify(error, null, 2));
      throw new Error(error?.error?.message || 'Failed to fetch iCal events');
    }
    
    const data = await response.json();
    console.log('[calendar-sync] DEBUG: iCal Edge Function response:', JSON.stringify(data, null, 2));
    console.log('[calendar-sync] DEBUG: Extracted events count:', data?.data?.items?.length || 0);
    console.log('[calendar-sync] DEBUG: First event sample:', data?.data?.items?.[0] || 'No events');
    return data?.data?.items || [];
  }

  if (clientInfo.integrationMethod === 'oauth') {
    // OAuth mode - use access token to call Google Calendar API
    const { calendarId, accessToken, tokenExpiry } = clientInfo;
    
    // Check if token is expired or will expire soon (within 5 minutes)
    let currentAccessToken = accessToken;
    const now = new Date();
    const expiryDate = tokenExpiry ? new Date(tokenExpiry) : null;
    const isExpired = expiryDate && now >= new Date(expiryDate.getTime() - 5 * 60 * 1000);
    
    if (isExpired) {
      // Refresh the token
      const refreshedToken = await refreshOAuthToken(teamId);
      if (refreshedToken) {
        currentAccessToken = refreshedToken;
        // Update cache with new token
        clientCache.set(teamId, { ...clientInfo, accessToken: refreshedToken, tokenExpiry: new Date(Date.now() + 3600 * 1000).toISOString() });
      }
    }
    
    // Simple decryption (upgrade to proper encryption in production)
    const decryptedToken = Buffer.from(currentAccessToken, 'base64').toString('utf8');
    
    // Call Google Calendar API with OAuth token and pagination
    let allItems: any[] = [];
    let pageToken: string | undefined = undefined;
    do {
      const params = new URLSearchParams({
        timeMin: timeMin || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString(),
        timeMax: timeMax || new Date(new Date().getFullYear(), new Date().getMonth() + 2, 0).toISOString(),
        singleEvents: 'true',
        orderBy: 'startTime',
        maxResults: '2500',
      });
      if (pageToken) params.set('pageToken', pageToken);

      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
        { headers: { Authorization: `Bearer ${decryptedToken}` } }
      );
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('[calendar-sync] OAuth API error:', errorText);
        throw new Error('Failed to fetch calendar events via OAuth');
      }
      
      const data = await response.json();
      allItems = allItems.concat(data.items || []);
      pageToken = data.nextPageToken;
    } while (pageToken);
    
    return allItems;
  }

  // Original API mode with pagination
  const { calClient, calendarId } = clientInfo;

  let allItems: any[] = [];
  let pageToken: string | undefined = undefined;
  do {
    const res: any = await calClient.events.list({
      calendarId,
      timeMin: timeMin || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString(),
      timeMax: timeMax || new Date(new Date().getFullYear(), new Date().getMonth() + 2, 0).toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 2500,
      pageToken: pageToken,
    });
    allItems = allItems.concat(res.data.items || []);
    pageToken = res.data.nextPageToken;
  } while (pageToken);
  
  return allItems;
}

export async function updateEvent(teamId: string, eventId: string, updates: { start?: string; end?: string; summary?: string; description?: string }) {
  const clientInfo = await getCalendarClient(teamId);

  if (clientInfo.integrationMethod === 'ical') {
    throw new Error('Cannot update events in iCal mode - iCal feeds are read-only');
  }

  const { calClient, calendarId } = clientInfo;

  const requestBody: any = {};
  if (updates.summary !== undefined) requestBody.summary = updates.summary;
  if (updates.description !== undefined) requestBody.description = updates.description;
  if (updates.start !== undefined) requestBody.start = { date: updates.start, dateTime: null };
  if (updates.end !== undefined) requestBody.end = { date: updates.end, dateTime: null };

  const res = await calClient.events.patch({
    calendarId,
    eventId,
    requestBody,
  });
  return res.data;
}

export async function createEvent(teamId: string, event: { start: string; end: string; summary: string; description?: string }) {
  const clientInfo = await getCalendarClient(teamId);

  if (clientInfo.integrationMethod === 'ical') {
    throw new Error('Cannot create events in iCal mode - iCal feeds are read-only');
  }

  const { calClient, calendarId } = clientInfo;

  const res = await calClient.events.insert({
    calendarId,
    requestBody: {
      summary: event.summary,
      description: event.description,
      start: { date: event.start, dateTime: null },
      end: { date: event.end, dateTime: null },
    },
  });
  return res.data;
}

export async function verifyConnection(teamId: string) {
  const clientInfo = await getCalendarClient(teamId);

  if (clientInfo.integrationMethod === 'ical') {
    // For iCal, just verify the URL is accessible
    const { icalUrl } = clientInfo;
    try {
      const response = await fetch(icalUrl, { method: 'HEAD' });
      if (!response.ok) {
        throw new Error(`iCal URL returned HTTP ${response.status}`);
      }
      return { calendarId: clientInfo.calendarId, integrationMethod: 'ical' };
    } catch (err) {
      throw new Error(`Failed to reach iCal URL: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (clientInfo.integrationMethod === 'oauth') {
    // OAuth mode - use access token to verify calendar access
    const { calendarId, accessToken, tokenExpiry } = clientInfo;
    
    // Check if token is expired or will expire soon (within 5 minutes)
    let currentAccessToken = accessToken;
    const now = new Date();
    const expiryDate = tokenExpiry ? new Date(tokenExpiry) : null;
    const isExpired = expiryDate && now >= new Date(expiryDate.getTime() - 5 * 60 * 1000);
    
    if (isExpired) {
      // Refresh the token
      const refreshedToken = await refreshOAuthToken(teamId);
      if (refreshedToken) {
        currentAccessToken = refreshedToken;
        // Update cache with new token
        clientCache.set(teamId, { ...clientInfo, accessToken: refreshedToken, tokenExpiry: new Date(Date.now() + 3600 * 1000).toISOString() });
      }
    }
    
    // Simple decryption (upgrade to proper encryption in production)
    const decryptedToken = Buffer.from(currentAccessToken, 'base64').toString('utf8');
    
    // Call Google Calendar API to verify access
    const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}`, {
      headers: {
        Authorization: `Bearer ${decryptedToken}`,
      },
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('[verifyConnection] OAuth API error:', errorText);
      throw new Error(`Failed to verify calendar via OAuth: ${response.status}`);
    }
    
    const data = await response.json();
    return { calendarId: data.id, summary: data.summary, integrationMethod: 'oauth' };
  }

  const { calClient, calendarId } = clientInfo;
  const res = await calClient.calendars.get({ calendarId });
  return res.data;
}
