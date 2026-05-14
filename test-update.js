require('dotenv').config({ path: '.env.local' });
const { auth, calendar } = require('@googleapis/calendar');

async function test() {
  try {
    const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    let key = process.env.GOOGLE_PRIVATE_KEY;
    if (key) {
      key = key.replace(/\\n/g, '\n');
      if (key.startsWith('"') && key.endsWith('"')) {
        key = key.slice(1, -1).replace(/\\n/g, '\n');
      }
    }
    
    const authClient = new auth.GoogleAuth({
      credentials: { client_email: email, private_key: key },
      scopes: ['https://www.googleapis.com/auth/calendar'],
    });

    const cal = calendar({ version: 'v3', auth: authClient });
    const res = await cal.events.list({
      calendarId: process.env.GOOGLE_CALENDAR_ID,
      timeMin: new Date().toISOString(),
      maxResults: 1,
    });
    const event = res.data.items[0];

    // Try to update it by clearing dateTime
    console.log("Attempting to update event to all-day...");
    const updated = await cal.events.patch({
      calendarId: process.env.GOOGLE_CALENDAR_ID,
      eventId: event.id,
      requestBody: {
        start: { date: '2026-05-15', dateTime: null },
        end: { date: '2026-05-16', dateTime: null }
      }
    });
    console.log("Update successful!", updated.data.start, updated.data.end);

    // Revert it
    console.log("Reverting event...");
    await cal.events.patch({
      calendarId: process.env.GOOGLE_CALENDAR_ID,
      eventId: event.id,
      requestBody: {
        start: event.start,
        end: event.end
      }
    });
    console.log("Reverted successfully!");

  } catch (err) {
    console.error("Error:", err.message);
  }
}

test();
