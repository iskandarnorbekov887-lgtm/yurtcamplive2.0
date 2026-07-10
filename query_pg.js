const { Client } = require('pg');
const client = new Client({ 
  connectionString: 'postgres://postgres:srWtnTWjcwutmIS6@db.blcgjsnorpxsvaxohzxl.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false }
});
async function run() {
  await client.connect();
  const res = await client.query("SELECT table_name FROM information_schema.columns WHERE table_schema = 'public' AND column_name = 'team_id';");
  console.log('Tables:', res.rows.map(r => r.table_name));
  await client.end();
}
run().catch(console.error);
