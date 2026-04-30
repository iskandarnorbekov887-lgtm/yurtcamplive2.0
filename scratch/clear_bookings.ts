
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function clearData() {
  console.log('🚀 Starting database cleanup...');

  try {
    // 1. Delete booking receipts
    console.log('🗑 Clearing booking_receipts...');
    const { error: err1 } = await supabase.from('booking_receipts').delete().neq('id', 0);
    if (err1) console.warn('Note: booking_receipts table error:', err1.message);

    // 2. Delete payments
    console.log('🗑 Clearing payments...');
    const { error: err2 } = await supabase.from('payments').delete().neq('id', 0);
    if (err2) console.error('Error clearing payments:', err2.message);

    // 3. Delete notifications
    console.log('🗑 Clearing notifications...');
    const { error: err3 } = await supabase.from('notifications').delete().neq('id', 0);
    if (err3) console.error('Error clearing notifications:', err3.message);

    // 4. Delete camp_finances (Income/Expense)
    console.log('🗑 Clearing camp_finances...');
    const { error: err4 } = await supabase.from('camp_finances').delete().neq('id', 0);
    if (err4) console.error('Error clearing camp_finances:', err4.message);

    // 5. Delete bookings
    console.log('🗑 Clearing bookings...');
    const { error: err5 } = await supabase.from('bookings').delete().neq('id', 0);
    if (err5) console.error('Error clearing bookings:', err5.message);

    console.log('✅ Database cleanup complete!');
  } catch (err) {
    console.error('Unexpected error:', err);
  }
}

clearData();
