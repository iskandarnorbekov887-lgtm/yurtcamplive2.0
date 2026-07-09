import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '../_supabase';

export const dynamic = 'force-dynamic';

// Verifies the request is from a logged-in CEO, returns their profile or null
async function requireCEO(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return null;

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, team_id')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'CEO') return null;
  return profile;
}

export async function POST(request: NextRequest) {
  const callerProfile = await requireCEO(request);
  if (!callerProfile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { email, password, fullName, role } = body;

    if (!email || !password || !fullName || !role) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Prevent creating another CEO through this route (optional, worth considering)
    if (role === 'CEO') {
      return NextResponse.json({ error: 'Cannot create additional CEO accounts' }, { status: 400 });
    }

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, role }
    });

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 400 });
    }

    // Force the new staff member into the CEO's own team
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ email, full_name: fullName, role, team_id: callerProfile.team_id })
      .eq('id', authData.user.id);

    if (profileError) {
      await supabase.auth.admin.deleteUser(authData.user.id);
      return NextResponse.json({ error: profileError.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, user: authData.user });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const callerProfile = await requireCEO(request);
  if (!callerProfile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { id, fullName, role } = body;

    if (!id) {
      return NextResponse.json({ error: 'Missing user ID' }, { status: 400 });
    }

    // Confirm target user belongs to the same team before allowing edit
    const { data: targetProfile } = await supabase
      .from('profiles')
      .select('team_id')
      .eq('id', id)
      .single();

    if (!targetProfile || targetProfile.team_id !== callerProfile.team_id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    if (role === 'CEO') {
      return NextResponse.json({ error: 'Cannot assign CEO role' }, { status: 400 });
    }

    const { error } = await supabase
      .from('profiles')
      .update({ full_name: fullName, role })
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const callerProfile = await requireCEO(request);
  if (!callerProfile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Missing user ID' }, { status: 400 });
    }

    // Prevent CEO deleting themselves and prevent cross-team deletes
    const { data: targetProfile } = await supabase
      .from('profiles')
      .select('team_id, role')
      .eq('id', id)
      .single();

    if (!targetProfile || targetProfile.team_id !== callerProfile.team_id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    if (targetProfile.role === 'CEO') {
      return NextResponse.json({ error: 'Cannot delete a CEO account' }, { status: 400 });
    }

    await supabase.from('profiles').delete().eq('id', id);

    const { error } = await supabase.auth.admin.deleteUser(id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
