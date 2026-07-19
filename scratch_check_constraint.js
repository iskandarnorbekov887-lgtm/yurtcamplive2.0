const { createClient } = require('@supabase/supabase-js');
const s = createClient(
  'https://blcgjsnorpxsvaxohzxl.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJsY2dqc25vcnB4c3ZheG9oenhsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODAwMzk2MiwiZXhwIjoyMDkzNTc5OTYyfQ.gqSdc2G4PtAnCoQwyjEfWCel_zvgSkcRKD7q6Oe3_DI'
);

async function main() {
  // Try direct SQL via rpc if available
  const { data, error } = await s.rpc('exec_sql', {
    query: "select conname, pg_get_constraintdef(oid) as def from pg_constraint where conrelid = 'booking_services'::regclass and contype = 'c'"
  });
  if (error) {
    console.log('RPC not available, trying insert test...');
    // Try inserting a test row with service_type='extra' to see if it's accepted
    const { data: testData, error: testErr } = await s
      .from('booking_services')
      .insert({
        booking_id: 999999,
        service_type: 'extra',
        unit_price: 0,
        quantity: 1,
        currency: 'USD',
        is_paid: false,
        details: { name: 'constraint_test' }
      })
      .select();
    if (testErr) {
      console.log('Insert test with extra failed:', JSON.stringify(testErr));
      // Check if it's a constraint violation vs FK error
      if (testErr.message && testErr.message.includes('service_type')) {
        console.log('CONSTRAINT DOES NOT INCLUDE extra - MIGRATION NEEDS TO RUN');
      } else {
        console.log('Error is not constraint-related (probably FK), so constraint might already include extra');
      }
    } else {
      console.log('Insert with extra succeeded, cleaning up...');
      if (testData && testData[0]) {
        await s.from('booking_services').delete().eq('id', testData[0].id);
      }
      console.log('CONSTRAINT INCLUDES extra - MIGRATION HAS BEEN APPLIED');
    }
    
    // Also try listing existing service_types
    const { data: existing } = await s
      .from('booking_services')
      .select('service_type')
      .limit(50);
    if (existing) {
      const types = [...new Set(existing.map(r => r.service_type))];
      console.log('Existing service_types in table:', types);
    }
  } else {
    console.log('Constraint check result:', JSON.stringify(data, null, 2));
  }
}

main().catch(console.error);
