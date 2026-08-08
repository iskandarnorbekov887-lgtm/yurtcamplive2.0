import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createServiceRoleClient } from '@/utils/supabase/service-role';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { privateKey } = body;

    if (!privateKey || typeof privateKey !== 'string' || !privateKey.trim()) {
      return NextResponse.json(
        { error: 'Missing required field: privateKey' },
        { status: 400 }
      );
    }

    // Get caller's session using regular client (reads from cookies)
    const supabase = await createClient();
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized: No valid session' },
        { status: 401 }
      );
    }

    // Get caller's profile to verify role and team_id
    const { data: callerProfile, error: callerError } = await supabase
      .from('profiles')
      .select('id, role, team_id')
      .eq('id', session.user.id)
      .single();

    if (callerError || !callerProfile) {
      return NextResponse.json(
        { error: 'Could not verify caller profile' },
        { status: 500 }
      );
    }

    // Verify caller is CEO
    if (callerProfile.role !== 'CEO') {
      return NextResponse.json(
        { error: 'Forbidden: Only CEO can update calendar credentials' },
        { status: 403 }
      );
    }

    if (!callerProfile.team_id) {
      return NextResponse.json(
        { error: 'Caller has no associated team' },
        { status: 400 }
      );
    }

    // Write the key into Vault via the restricted service-role-only RPC
    const supabaseAdmin = createServiceRoleClient();
    const { error: rpcError } = await supabaseAdmin.rpc('set_team_google_private_key', {
      p_team_id: callerProfile.team_id,
      p_key: privateKey.trim(),
    });

    if (rpcError) {
      return NextResponse.json(
        { error: 'Failed to store credentials' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[set-google-key] Unexpected error:', err);
    return NextResponse.json(
      { error: 'Unexpected server error' },
      { status: 500 }
    );
  }
}
