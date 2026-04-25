import { google } from 'googleapis';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

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
    const auth = new google.auth.JWT({
      email,
      key: rawKey.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
    });

    const calendar = google.calendar({ version: 'v3', auth });

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
      const end = rawEnd && rawEnd > start ? rawEnd : (() => {
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

    return NextResponse.json(items);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Google Calendar API error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
