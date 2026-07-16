import { auth, calendar } from '@googleapis/calendar';
import { supabase as supabaseAdmin } from '@/app/api/_supabase';

// Cache client instances by teamId to avoid re-initializing GoogleAuth repeatedly
const clientCache = new Map<string, { calClient: any; calendarId: string; integrationMethod: 'api' | 'ical'; icalUrl?: string }>();

export function invalidateCalendarCache(teamId: string) {
  clientCache.delete(teamId);
}

export function invalidateAllCalendarCache() {
  clientCache.clear();
}

async function getCalendarClient(teamId: string) {
  if (clientCache.has(teamId)) return clientCache.get(teamId)!;

  // 1. Query team_settings securely via the service role client
  const { data: settings, error } = await supabaseAdmin
    .from('team_settings')
    .select('google_service_account_email, google_private_key, google_calendar_id, google_calendar_integration_method, google_ical_url')
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

  // Original API mode
  const { calClient, calendarId } = clientInfo;

  const res = await calClient.events.list({
    calendarId,
    timeMin: timeMin || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString(),
    timeMax: timeMax || new Date(new Date().getFullYear(), new Date().getMonth() + 2, 0).toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
  });
  return res.data.items || [];
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

  const { calClient, calendarId } = clientInfo;
  const res = await calClient.calendars.get({ calendarId });
  return res.data;
}
