import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createServiceRoleClient } from '@/utils/supabase/service-role';

export const dynamic = 'force-dynamic';

// GET: List which API keys are set for a team (never returns values)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get('teamId');

    if (!teamId) {
      return NextResponse.json(
        { error: 'Missing required parameter: teamId' },
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
        { error: 'Forbidden: Only CEO can view API key settings' },
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

    // Check which known keys are set (without returning values)
    const knownKeys = ['google_vision', 'anthropic'];
    const keyStatus: Record<string, boolean> = {};

    const adminClient = createServiceRoleClient();

    for (const keyName of knownKeys) {
      const { data, error } = await adminClient.rpc('get_team_api_key', {
        p_team_id: teamId,
        p_key_name: keyName,
      });
      keyStatus[keyName] = !error && data !== null;
    }

    return NextResponse.json({ keys: keyStatus });
  } catch (error) {
    console.error('[team-settings/api-keys] GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

// POST: Save an API key to the vault
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { teamId, keyName, value } = body;

    if (!teamId || !keyName || !value || typeof value !== 'string' || !value.trim()) {
      return NextResponse.json(
        { error: 'Missing required fields: teamId, keyName, value' },
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
        { error: 'Forbidden: Only CEO can update API keys' },
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
    const { error: vaultError } = await adminClient.rpc('set_team_api_key', {
      p_team_id: teamId,
      p_key_name: keyName,
      p_value: value.trim(),
      p_updated_by: session.user.id,
    });

    if (vaultError) {
      console.error('[team-settings/api-keys] Vault write failed:', vaultError);
      return NextResponse.json(
        { error: `Failed to save API key: ${vaultError.message}` },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[team-settings/api-keys] POST error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

// DELETE: Remove an API key from the vault
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get('teamId');
    const keyName = searchParams.get('keyName');

    if (!teamId || !keyName) {
      return NextResponse.json(
        { error: 'Missing required parameters: teamId, keyName' },
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
        { error: 'Forbidden: Only CEO can delete API keys' },
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
    const { error: vaultError } = await adminClient.rpc('delete_team_api_key', {
      p_team_id: teamId,
      p_key_name: keyName,
    });

    if (vaultError) {
      console.error('[team-settings/api-keys] Vault delete failed:', vaultError);
      return NextResponse.json(
        { error: `Failed to delete API key: ${vaultError.message}` },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[team-settings/api-keys] DELETE error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
