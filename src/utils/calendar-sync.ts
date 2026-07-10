import { auth, calendar } from '@googleapis/calendar';
import { supabase as supabaseAdmin } from '@/app/api/_supabase';

// Cache client instances by teamId to avoid re-initializing GoogleAuth repeatedly
const clientCache = new Map<string, { calClient: any; calendarId: string }>();

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
    .select('google_service_account_email, google_private_key, google_calendar_id')
    .eq('team_id', teamId)
    .single();

  if (error || !settings) {
    throw new Error('Google Calendar not configured for this team');
  }

  const email = settings.google_service_account_email;
  let key = settings.google_private_key;
  const calendarId = settings.google_calendar_id;

  if (key) {
    key = key.replace(/\\n/g, '\n');
    if (key.startsWith('"') && key.endsWith('"')) {
      key = key.slice(1, -1).replace(/\\n/g, '\n');
    }
  }

  if (!email || !key || !calendarId) {
    throw new Error('Google Calendar not configured for this team');
  }

  const authClient = new auth.GoogleAuth({
    credentials: {
      client_email: email,
      private_key: key,
    },
    scopes: ['https://www.googleapis.com/auth/calendar'],
  });

  const calClient = calendar({ version: 'v3', auth: authClient });
  const result = { calClient, calendarId };
  
  clientCache.set(teamId, result);
  return result;
}

export async function listEvents(teamId: string, timeMin?: string, timeMax?: string) {
  const { calClient, calendarId } = await getCalendarClient(teamId);

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
  const { calClient, calendarId } = await getCalendarClient(teamId);

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
  const { calClient, calendarId } = await getCalendarClient(teamId);

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
  const { calClient, calendarId } = await getCalendarClient(teamId);
  const res = await calClient.calendars.get({ calendarId });
  return res.data;
}
