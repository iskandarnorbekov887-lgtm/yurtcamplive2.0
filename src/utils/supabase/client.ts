'use client';

import { createBrowserClient } from '@supabase/ssr';

/**
 * Creates a Supabase client for use in Client Components.
 *
 * `createBrowserClient` from `@supabase/ssr` automatically syncs the
 * Supabase session to **browser cookies** (not just localStorage).
 * This is critical so the Vercel server can read the session token
 * on every request and avoid the redirect tug-of-war.
 *
 * By default, `isSingleton: true` is implied — multiple calls return
 * the same instance, preventing navigator.locks contention.
 */
export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase Environment Variables: NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }

  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
