import { createClient } from '@supabase/supabase-js';

/**
 * Creates a Supabase client with the SERVICE ROLE key.
 * 
 * This client has admin privileges and can bypass RLS policies.
 * MUST ONLY be used in server-side code (API routes, server actions).
 * NEVER expose this to the client.
 */
export function createServiceRoleClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('Missing Supabase Environment Variables: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
