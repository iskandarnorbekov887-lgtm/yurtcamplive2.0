import { createClient } from '@supabase/supabase-js';

/**
 * Lazy proxy that delays Supabase client creation until first use.
 * This prevents "supabaseUrl is required" errors during `next build`
 * when env vars are not yet available at module-evaluation time.
 */
function createLazyClient() {
  let client: ReturnType<typeof createClient> | null = null;

  return new Proxy({} as ReturnType<typeof createClient>, {
    get(_, prop) {
      if (!client) {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!supabaseUrl || !supabaseServiceKey) {
          throw new Error(
            'Missing Supabase Environment Variables: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'
          );
        }

        client = createClient(supabaseUrl, supabaseServiceKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        });
      }
      return (client as any)[prop];
    },
  });
}

export const supabase: any = createLazyClient();
