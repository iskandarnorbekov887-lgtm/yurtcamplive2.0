// Node.js script to create default users via Supabase Auth API
// Run with: node supabase/seeds/create-default-users.js
// Requires: npm install @supabase/supabase-js

const { createClient } = require('@supabase/supabase-js');

// Your Supabase credentials from .env.local
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // Use service role key for admin operations

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Error: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in environment');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

const defaultUsers = [
  {
    email: 'ceo@yurtcamp.com',
    password: 'CEOadmin123',
    fullName: 'CEO Admin',
    role: 'CEO'
  },
  {
    email: 'manager@yurtcamp.com',
    password: 'Manager123',
    fullName: 'Camp Manager',
    role: 'Manager'
  },
  {
    email: 'reserver@yurtcamp.com',
    password: 'Reserver123',
    fullName: 'Booking Reserver',
    role: 'Reserver'
  },
  {
    email: 'cook@yurtcamp.com',
    password: 'Cook123',
    fullName: 'Camp Cook',
    role: 'Cook'
  }
];

async function createDefaultUsers() {
  console.log('Creating default users...\n');

  for (const user of defaultUsers) {
    try {
      // Check if user already exists
      const { data: existingUser, error: checkError } = await supabase
        .from('profiles')
        .select('id, email')
        .eq('email', user.email)
        .single();

      if (existingUser) {
        console.log(`✓ User already exists: ${user.email} (${user.role})`);
        continue;
      }

      // Create auth user
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: user.email,
        password: user.password,
        email_confirm: true,
        user_metadata: {
          full_name: user.fullName
        }
      });

      if (authError) {
        console.error(`✗ Failed to create auth user for ${user.email}:`, authError.message);
        continue;
      }

      // Create profile
      const { error: profileError } = await supabase
        .from('profiles')
        .insert({
          id: authData.user.id,
          email: user.email,
          full_name: user.fullName,
          role: user.role
        });

      if (profileError) {
        console.error(`✗ Failed to create profile for ${user.email}:`, profileError.message);
        continue;
      }

      console.log(`✓ Created user: ${user.email} (${user.role}) - Password: ${user.password}`);
    } catch (error) {
      console.error(`✗ Error processing ${user.email}:`, error.message);
    }
  }

  console.log('\n✅ Default user creation complete!');
  console.log('\n⚠️  IMPORTANT: Change these default passwords immediately after first login!');
}

createDefaultUsers().catch(console.error);
