require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');

const client = new Client({
  host: process.env.POSTGRES_HOST.replace(/^"|"$/g, ''), // remove surrounding quotes if any
  user: process.env.POSTGRES_USER.replace(/^"|"$/g, ''),
  password: process.env.POSTGRES_PASSWORD.replace(/^"|"$/g, ''),
  database: process.env.POSTGRES_DATABASE.replace(/^"|"$/g, ''),
  port: 5432,
  ssl: { rejectUnauthorized: false },
});

async function run() {
  try {
    await client.connect();
    console.log('Fetching latest 20 camp_finances...');
    const financesRes = await client.query('SELECT * FROM camp_finances ORDER BY created_at DESC LIMIT 20;');
    console.log('camp_finances rows:');
    console.log(JSON.stringify(financesRes.rows, null, 2));
    console.log('Fetching latest 20 payments...');
    const paymentsRes = await client.query('SELECT * FROM payments ORDER BY created_at DESC LIMIT 20;');
    console.log('payments rows:');
    console.log(JSON.stringify(paymentsRes.rows, null, 2));
  } catch (err) {
    console.error('Error running queries:', err);
  } finally {
    await client.end();
  }
}

run();
