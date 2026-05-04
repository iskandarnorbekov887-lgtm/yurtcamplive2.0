import { calendar_v3, auth as googleAuth } from '@googleapis/calendar';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_PRIVATE_KEY;
  const calendarId = process.env.GOOGLE_CALENDAR_ID;

  if (!email || !rawKey || !calendarId) {
    return NextResponse.json(
      { error: 'Missing Google credentials. Set GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY, and GOOGLE_CALENDAR_ID.' },
      { status: 500 }
    );
  }

  try {
    const auth = new googleAuth.JWT({
      email,
      key: rawKey.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
    });

    const calendar = new calendar_v3.Calendar({ auth });

    const now = new Date();
    const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const response = await calendar.events.list({
      calendarId,
      timeMin: now.toISOString(),
      timeMax: thirtyDaysLater.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      timeZone: 'Asia/Tashkent',
      maxResults: 100,
    });

    const items = (response.data.items || []).map(event => {
      const start = event.start?.date || event.start?.dateTime?.split('T')[0] || '';
      const rawEnd = event.end?.date || event.end?.dateTime?.split('T')[0] || '';
      const end = rawEnd && rawEnd >= start ? rawEnd : (() => {
        if (!start) return '';
        const d = new Date(start + 'T12:00:00'); d.setDate(d.getDate() + 1);
        return d.toISOString().split('T')[0];
      })();
      return ({
      id: event.id,
      summary: event.summary || '(No title)',
      start, end,
      description: event.description || null,
      location: event.location || null,
      colorId: event.colorId || null,
      status: event.status || null,
    });
    });

    return NextResponse.json(items, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate', 'Pragma': 'no-cache' },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Google Calendar API error:', message);
    return NextResponse.json({ error: message }, {
      status: 500,
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate', 'Pragma': 'no-cache' },
    });
  }
}
export async function PATCH(request: Request) {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_PRIVATE_KEY;
  const calendarId = process.env.GOOGLE_CALENDAR_ID;

  if (!email || !rawKey || !calendarId) {
    return NextResponse.json({ error: 'Missing credentials' }, { status: 500 });
  }

  try {
    const { eventId, start, end } = await request.json();
    if (!eventId || !start || !end) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    const auth = new googleAuth.JWT({
      email,
      key: rawKey.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/calendar'],
    });

    const calendar = new calendar_v3.Calendar({ auth });
    
    // Google Calendar API expects 'end' to be exclusive for all-day events.
    // If 'start' and 'end' are date strings like 'YYYY-MM-DD', we use 'date' field.
    await calendar.events.patch({
      calendarId,
      eventId,
      requestBody: {
        start: { date: start },
        end: { date: end },
      },
    });

    return NextResponse.json({ success: true }, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate', 'Pragma': 'no-cache' },
    });
  } catch (err: any) {
    console.error('GC Patch Error:', err.message);
    return NextResponse.json({ error: err.message }, {
      status: 500,
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate', 'Pragma': 'no-cache' },
    });
  }
}
