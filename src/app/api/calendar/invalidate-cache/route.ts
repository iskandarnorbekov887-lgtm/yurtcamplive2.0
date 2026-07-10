import { NextRequest, NextResponse } from 'next/server';
import { invalidateCalendarCache } from '@/utils/calendar-sync';
import { createClient } from '@/utils/supabase/server';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('team_id')
    .eq('id', user.id)
    .single();

  if (!profile?.team_id) return NextResponse.json({ error: 'No team' }, { status: 403 });

  invalidateCalendarCache(profile.team_id);
  return NextResponse.json({ success: true });
}
