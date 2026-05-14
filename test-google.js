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
    
    console.log("Key has actual newline?", key.includes('\n'));
    console.log("Key has literal string \\n?", key.includes('\\n'));
    
    // Instead of using JWT directly, try using GoogleAuth
    const authClient = new auth.GoogleAuth({
      credentials: {
        client_email: email,
        private_key: key,
      },
      scopes: ['https://www.googleapis.com/auth/calendar'],
    });

    const cal = calendar({ version: 'v3', auth: authClient });
    const res = await cal.events.list({
      calendarId: process.env.GOOGLE_CALENDAR_ID,
      timeMin: new Date().toISOString(),
      maxResults: 1,
    });
    console.log("Success! Events:", res.data.items.length);
  } catch (err) {
    console.error("Error:", err.message);
  }
}

test();
