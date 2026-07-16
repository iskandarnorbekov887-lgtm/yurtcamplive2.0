/**
 * Edge Function: ical-calendar-proxy
 *
 * Server-side proxy for fetching and parsing public iCal feeds.
 * Used when integration method is set to 'ical' instead of service account API.
 *
 * Steps:
 *  1. Validate the caller's JWT
 *  2. Resolve team_id from profiles
 *  3. Load google_ical_url from team_settings (when integration_method is 'ical')
 *  4. Fetch the .ics file server-side (avoids CORS issues)
 *  5. Parse using ical.js
 *  6. Convert to Google Calendar API event shape for compatibility
 *  7. Return events in the same format as google-calendar-proxy
 *
 * Deployment:
 *   supabase functions deploy ical-calendar-proxy --no-verify-jwt=false
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ─── Simple iCal Parser (Deno-compatible, no external dependencies) ─────────────

interface ICSEvent {
  uid: string;
  summary: string;
  description: string;
  location: string;
  startDate: Date;
  endDate: Date;
}

function parseICSText(icsText: string): ICSEvent[] {
  const events: ICSEvent[] = [];
  const lines = icsText.split('\n');
  let currentEvent: Partial<ICSEvent> | null = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Handle line continuations (lines starting with space)
    if (line.startsWith(' ') && currentEvent) {
      const prevLine = lines[i - 1].trim();
      if (prevLine.startsWith('SUMMARY:')) {
        currentEvent.summary = (currentEvent.summary || '') + line.substring(1);
      } else if (prevLine.startsWith('DESCRIPTION:')) {
        currentEvent.description = (currentEvent.description || '') + line.substring(1);
      } else if (prevLine.startsWith('LOCATION:')) {
        currentEvent.location = (currentEvent.location || '') + line.substring(1);
      }
      continue;
    }
    
    if (line === 'BEGIN:VEVENT') {
      currentEvent = {};
    } else if (line === 'END:VEVENT' && currentEvent) {
      if (currentEvent.uid && currentEvent.startDate) {
        events.push(currentEvent as ICSEvent);
      }
      currentEvent = null;
    } else if (currentEvent) {
      if (line.startsWith('UID:')) {
        currentEvent.uid = line.substring(4);
      } else if (line.startsWith('SUMMARY:')) {
        currentEvent.summary = line.substring(8);
      } else if (line.startsWith('DESCRIPTION:')) {
        currentEvent.description = line.substring(12);
      } else if (line.startsWith('LOCATION:')) {
        currentEvent.location = line.substring(9);
      } else if (line.startsWith('DTSTART:') || line.startsWith('DTSTART;')) {
        const dateStr = line.split(':')[1];
        currentEvent.startDate = parseICSDate(dateStr);
      } else if (line.startsWith('DTEND:') || line.startsWith('DTEND;')) {
        const dateStr = line.split(':')[1];
        currentEvent.endDate = parseICSDate(dateStr);
      }
    }
  }
  
  return events;
}

function parseICSDate(dateStr: string): Date {
  // Handle both DATE (20240115) and DATE-TIME (20240115T100000Z) formats
  const cleanStr = dateStr.replace(/[ZT]/g, '');
  
  if (cleanStr.length === 8) {
    // DATE format: YYYYMMDD
    const year = parseInt(cleanStr.substring(0, 4));
    const month = parseInt(cleanStr.substring(4, 6)) - 1;
    const day = parseInt(cleanStr.substring(6, 8));
    return new Date(year, month, day);
  } else if (cleanStr.length === 14) {
    // DATE-TIME format: YYYYMMDDHHMMSS
    const year = parseInt(cleanStr.substring(0, 4));
    const month = parseInt(cleanStr.substring(4, 6)) - 1;
    const day = parseInt(cleanStr.substring(6, 8));
    const hours = parseInt(cleanStr.substring(8, 10));
    const minutes = parseInt(cleanStr.substring(10, 12));
    const seconds = parseInt(cleanStr.substring(12, 14));
    return new Date(year, month, day, hours, minutes, seconds);
  }
  
  // Fallback
  return new Date(dateStr);
}

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
  return json({ ok: false, error: { code, message } }, status);
}

// ─── Convert iCal event to Google Calendar API shape ─────────────────────────────

function icalToGoogleEvent(icalEvent: ICSEvent): any {
  const startDate = icalEvent.startDate;
  const endDate = icalEvent.endDate;
  
  // Handle both date-only and datetime events
  const isDateOnly = startDate.getHours() === 0 && startDate.getMinutes() === 0 && startDate.getSeconds() === 0;
  
  const start = isDateOnly 
    ? { date: startDate.toISOString().split('T')[0] }
    : { dateTime: startDate.toISOString() };
  
  const end = isDateOnly
    ? { date: endDate.toISOString().split('T')[0] }
    : { dateTime: endDate.toISOString() };

  return {
    id: icalEvent.uid || crypto.randomUUID(),
    summary: icalEvent.summary || '(No title)',
    description: icalEvent.description || '',
    start,
    end,
    location: icalEvent.location || '',
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
  };
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

  if (req.method !== 'GET') {
    return errorResponse('METHOD_NOT_ALLOWED', 'Only GET requests are accepted.', 405);
  }

  // ── Environment validation ───────────────────────────────────────────────
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');

  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    console.error('[ical-calendar-proxy] Missing required env vars');
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
    console.error('[ical-calendar-proxy] Profile lookup failed:', profileError.message);
    return errorResponse('PROFILE_ERROR', 'Could not retrieve your profile.', 500);
  }

  if (!profile) {
    return errorResponse('PROFILE_NOT_FOUND', 'No profile found for the authenticated user.', 404);
  }

  const teamId: string = (profile as any).team_id ?? profile.id;

  // ── Step 2: Fetch iCal URL from team_settings ────────────────────────────
  const { data: settings, error: settingsError } = await adminClient
    .from('team_settings')
    .select('google_calendar_integration_method, google_ical_url, google_calendar_id')
    .eq('team_id', teamId)
    .maybeSingle();

  if (settingsError) {
    console.error('[ical-calendar-proxy] team_settings lookup failed:', settingsError.message);
    return errorResponse('SETTINGS_ERROR', 'Failed to load team settings.', 500);
  }

  if (!settings) {
    return errorResponse(
      'SETTINGS_NOT_CONFIGURED',
      'Google Calendar integration is not configured for your team.',
      422,
    );
  }

  const integrationMethod = (settings as any).google_calendar_integration_method;
  const icalUrl = (settings as any).google_ical_url;
  const calendarId = (settings as any).google_calendar_id;

  if (integrationMethod !== 'ical') {
    return errorResponse(
      'WRONG_INTEGRATION_METHOD',
      'This endpoint is only for iCal integration. Your team is configured to use the Service Account API.',
      400,
    );
  }

  if (!icalUrl) {
    return errorResponse(
      'ICAL_URL_MISSING',
      'iCal Feed URL is not configured. Please add it in Team Integration Settings.',
      422,
    );
  }

  // ── Step 3: Fetch the .ics file server-side ────────────────────────────────
  let icsResponse: Response;
  let icsText: string;
  try {
    icsResponse = await fetch(icalUrl, {
      method: 'GET',
      headers: {
        Accept: 'text/calendar',
        'User-Agent': 'YurtCamp-ICalProxy/1.0',
      },
    });

    if (!icsResponse.ok) {
      console.error(`[ical-calendar-proxy] Failed to fetch iCal: HTTP ${icsResponse.status}`);
      return errorResponse(
        'ICAL_FETCH_ERROR',
        `Failed to fetch iCal feed (HTTP ${icsResponse.status}). Please verify the URL is correct and publicly accessible.`,
        502,
      );
    }

    icsText = await icsResponse.text();
  } catch (networkErr: unknown) {
    const msg = networkErr instanceof Error ? networkErr.message : String(networkErr);
    const stack = networkErr instanceof Error ? networkErr.stack : '';
    console.error('[ical-calendar-proxy] Network error fetching iCal:', msg);
    console.error('[ical-calendar-proxy] Network error stack:', stack);
    console.error('[ical-calendar-proxy] Full error object:', JSON.stringify(networkErr, null, 2));
    return errorResponse(
      'ICAL_NETWORK_ERROR',
      `Could not reach the iCal feed URL: ${msg}`,
      502,
    );
  }

  // ── Step 4: Parse the iCal data ─────────────────────────────────────────────
  let icsEvents: ICSEvent[];
  try {
    icsEvents = parseICSText(icsText);
  } catch (parseErr: unknown) {
    const msg = parseErr instanceof Error ? parseErr.message : String(parseErr);
    const stack = parseErr instanceof Error ? parseErr.stack : '';
    console.error('[ical-calendar-proxy] Failed to parse iCal:', msg);
    console.error('[ical-calendar-proxy] Parse error stack:', stack);
    console.error('[ical-calendar-proxy] Full error object:', JSON.stringify(parseErr, null, 2));
    console.error('[ical-calendar-proxy] First 500 chars of icsText:', icsText.substring(0, 500));
    return errorResponse(
      'ICAL_PARSE_ERROR',
      `Failed to parse the iCal feed: ${msg}`,
      502,
    );
  }

  // ── Step 5: Convert to Google Calendar API shape ────────────────────────────
  const events = icsEvents.map(icalToGoogleEvent);

  console.log('[ical-calendar-proxy] DEBUG: Raw iCal events count:', icsEvents.length);
  console.log('[ical-calendar-proxy] DEBUG: Parsed events count:', events.length);
  console.log('[ical-calendar-proxy] DEBUG: First event sample:', events[0] || 'No events');

  // ── Step 6: Return in Google Calendar API format ───────────────────────────
  const responsePayload = {
    ok: true,
    meta: {
      team_id: teamId,
      calendar_id: calendarId,
      integration_method: 'ical',
      fetched_at: new Date().toISOString(),
      fetched_by_role: profile.role ?? 'unknown',
      event_count: events.length,
    },
    data: {
      items: events,
      kind: 'calendar#events',
    },
  };

  console.info(
    `[ical-calendar-proxy] Successfully fetched iCal for team=${teamId} user=${user.id} events=${events.length}`,
  );

  return json(responsePayload, 200);
});
