import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

/**
 * Auth callback route — the "Missing Link".
 *
 * When Supabase redirects the user back after OAuth (Google sign-in)
 * or email confirmation, it appends a `?code=...` parameter.
 *
 * This route:
 * 1. Reads the code from the URL.
 * 2. Exchanges it for a real session using the Server Client.
 * 3. The Server Client's `setAll` handler writes the session cookies.
 * 4. Redirects the user to their dashboard.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  // Allow the caller to specify a redirect target (e.g., `/ceo`, `/manager`)
  const next = searchParams.get('next') ?? '/';

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Determine where to redirect based on the user's role
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        // Fetch the user's profile to determine their role
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single();

        const rolePaths: Record<string, string> = {
          'CEO': '/ceo',
          'Manager': '/manager',
          'Cook': '/cook',
        };

        const redirectPath = profile?.role
          ? (rolePaths[profile.role] || next)
          : next;

        return NextResponse.redirect(`${origin}${redirectPath}`);
      }

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // If code exchange failed, redirect to login with an error
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
