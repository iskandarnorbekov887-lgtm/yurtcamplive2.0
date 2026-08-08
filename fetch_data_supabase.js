require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/^"|"$/g, '');
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.replace(/^"|"$/g, '');

const supabase = createClient(supabaseUrl, supabaseAnonKey);

(async () => {
  const { data: finances, error: errFin } = await supabase
    .from('camp_finances')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20);
  console.log('camp_finances rows:');
  console.log(JSON.stringify(finances, null, 2));
  if (errFin) console.error('Finances error:', errFin);

  const { data: payments, error: errPay } = await supabase
    .from('payments')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20);
  console.log('payments rows:');
  console.log(JSON.stringify(payments, null, 2));
  if (errPay) console.error('Payments error:', errPay);
})();
