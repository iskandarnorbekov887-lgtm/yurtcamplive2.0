const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgres://postgres.blcgjsnorpxsvaxohzxl:srWtnTWjcwutmIS6@aws-1-eu-central-1.pooler.supabase.com:6543/postgres?sslmode=require&supa=base-pooler.x',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
    await client.connect();
    const res = await client.query("SELECT policyname, roles, cmd, qual, with_check FROM pg_policies WHERE schemaname = 'public' AND tablename = 'bookings';");
    console.log(JSON.stringify(res.rows, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

run();
