import { auth, calendar } from '@googleapis/calendar';

// Defer initialization to avoid top-level crashes if env vars are missing
let calendarClient: any = null;

function getCalendarClient() {
  if (calendarClient) return calendarClient;

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  let key = process.env.GOOGLE_PRIVATE_KEY;

  if (key) {
    key = key.replace(/\\n/g, '\n');
    // Handle double quotes if they were included in the env value
    if (key.startsWith('"') && key.endsWith('"')) {
      key = key.slice(1, -1).replace(/\\n/g, '\n');
    }
  }

  if (!email || !key) {
    console.warn('Google Calendar credentials missing.');
    throw new Error('Google Calendar credentials missing in environment.');
  }

  const authClient = new auth.GoogleAuth({
    credentials: {
      client_email: email,
      private_key: key,
    },
    scopes: ['https://www.googleapis.com/auth/calendar'],
  });

  calendarClient = calendar({ version: 'v3', auth: authClient });
  return calendarClient;
}

export async function listEvents(timeMin?: string, timeMax?: string) {
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  if (!calendarId) throw new Error('GOOGLE_CALENDAR_ID is missing');

  const calendar = getCalendarClient();
  const res = await calendar.events.list({
    calendarId,
    timeMin: timeMin || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString(),
    timeMax: timeMax || new Date(new Date().getFullYear(), new Date().getMonth() + 2, 0).toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
  });
  return res.data.items || [];
}

export async function updateEvent(eventId: string, updates: { start: string; end: string; summary?: string; description?: string }) {
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  if (!calendarId) throw new Error('GOOGLE_CALENDAR_ID is missing');

  const calendar = getCalendarClient();
  const res = await calendar.events.patch({
    calendarId,
    eventId,
    requestBody: {
      summary: updates.summary,
      description: updates.description,
      start: { date: updates.start, dateTime: null },
      end: { date: updates.end, dateTime: null },
    },
  });
  return res.data;
}

export async function createEvent(event: { start: string; end: string; summary: string; description?: string }) {
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  if (!calendarId) throw new Error('GOOGLE_CALENDAR_ID is missing');

  const calendar = getCalendarClient();
  const res = await calendar.events.insert({
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
