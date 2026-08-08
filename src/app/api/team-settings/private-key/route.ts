import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createServiceRoleClient } from '@/utils/supabase/service-role';

export const dynamic = 'force-dynamic';

// Writes the Google service-account private key into Supabase Vault.
// The key is never stored in plaintext and never round-tripped back to
// the browser — only google_private_key_secret_id (a Vault reference) lives
// on team_settings.
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { teamId, privateKey } = body;

    if (!teamId || !privateKey || typeof privateKey !== 'string' || !privateKey.trim()) {
      return NextResponse.json(
        { error: 'Missing required fields: teamId, privateKey' },
        { status: 400 },
      );
    }

    const supabase = await createClient();
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized: No valid session' },
        { status: 401 },
      );
    }

    const { data: callerProfile, error: callerError } = await supabase
      .from('profiles')
      .select('id, role, team_id')
      .eq('id', session.user.id)
      .single();

    if (callerError || !callerProfile) {
      return NextResponse.json(
        { error: 'Could not verify caller profile' },
        { status: 500 },
      );
    }

    if (callerProfile.role !== 'CEO') {
      return NextResponse.json(
        { error: 'Forbidden: Only CEO can update Google Calendar credentials' },
        { status: 403 },
      );
    }

    const resolvedTeamId = callerProfile.team_id ?? callerProfile.id;
    if (resolvedTeamId !== teamId) {
      return NextResponse.json(
        { error: 'Forbidden: teamId does not match caller' },
        { status: 403 },
      );
    }

    const adminClient = createServiceRoleClient();
    const { error: vaultError } = await adminClient.rpc('set_team_google_private_key', {
      p_team_id: teamId,
      p_key: privateKey.trim(),
    });

    if (vaultError) {
      console.error('[team-settings/private-key] Vault write failed:', vaultError);
      return NextResponse.json(
        { error: `Failed to save private key: ${vaultError.message}` },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[team-settings/private-key] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
