import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createServiceRoleClient } from '@/utils/supabase/service-role';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { targetUserId, newPassword } = body;

    if (!targetUserId || !newPassword) {
      return NextResponse.json(
        { error: 'Missing required fields: targetUserId, newPassword' },
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
        { error: 'Forbidden: Only CEO can reset passwords' },
        { status: 403 }
      );
    }

    // Get target user's profile to verify they're on the same team
    const { data: targetProfile, error: targetError } = await supabase
      .from('profiles')
      .select('id, team_id')
      .eq('id', targetUserId)
      .single();

    if (targetError || !targetProfile) {
      return NextResponse.json(
        { error: 'Target user not found' },
        { status: 404 }
      );
    }

    // Verify target user belongs to same team as caller
    if (targetProfile.team_id !== callerProfile.team_id) {
      return NextResponse.json(
        { error: 'Forbidden: Cannot reset password for user from another team' },
        { status: 403 }
      );
    }

    // Use service role client to perform admin action
    const adminClient = createServiceRoleClient();
    const { error: updateError } = await adminClient.auth.admin.updateUserById(
      targetUserId,
      { password: newPassword }
    );

    if (updateError) {
      return NextResponse.json(
        { error: `Failed to reset password: ${updateError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in reset-password route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
