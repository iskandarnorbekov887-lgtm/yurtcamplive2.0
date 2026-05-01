import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://bmfcpicdswekgrpjrigk.supabase.co';
const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJtZmNwaWNkc3dla2dycGpyaWdrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzM5MjIyOCwiZXhwIjoyMDkyOTY4MjI4fQ.jKB994QAkRT87h2VpQ1fO5xhOnZ8BTf7qcF9gBfxtzA';

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false }
});

async function run() {
  // First: preview what will be deleted
  const { data: preview, error: previewErr } = await supabase
    .from('bookings')
    .select('id, guest_name, status, check_in, check_out')
    .eq('status', 'checked_in');

  if (previewErr) {
    console.error('❌ Preview failed:', previewErr.message);
    process.exit(1);
  }

  console.log(`\n📋 Found ${preview.length} checked_in booking(s) to delete:`);
  preview.forEach(b => {
    console.log(`  - [#${b.id}] ${b.guest_name} (${b.check_in} → ${b.check_out})`);
  });

  if (preview.length === 0) {
    console.log('✅ No checked_in bookings found. Nothing to delete.');
    process.exit(0);
  }

  // Execute the delete
  const { error: deleteErr, count } = await supabase
    .from('bookings')
    .delete({ count: 'exact' })
    .eq('status', 'checked_in');

  if (deleteErr) {
    console.error('❌ Delete failed:', deleteErr.message);
    process.exit(1);
  }

  console.log(`\n✅ Successfully deleted ${count} checked_in booking(s) from the database.`);
}

run();
