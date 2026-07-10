import { NextRequest, NextResponse } from 'next/server';
import { listEvents, updateEvent, createEvent } from '@/utils/calendar-sync';
import { createClient } from '@/utils/supabase/server';

export const dynamic = 'force-dynamic';

// Helper function to authenticate and get teamId
async function getTeamId() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');
  
  const { data: profile } = await supabase
    .from('profiles')
    .select('team_id')
    .eq('id', user.id)
    .single();
    
  if (!profile?.team_id) throw new Error('User does not belong to a team');
  return profile.team_id;
}

export async function GET(request: NextRequest) {
  try {
    const teamId = await getTeamId();
    
    const { searchParams } = new URL(request.url);
    const timeMin = searchParams.get('timeMin') || undefined;
    const timeMax = searchParams.get('timeMax') || undefined;
    
    const events = await listEvents(teamId, timeMin, timeMax);
    
    // Map to a cleaner format if needed, but here we return raw for compatibility
    const formatted = events.map((ev: any) => ({
      id: ev.id,
      summary: ev.summary,
      start: ev.start?.date || ev.start?.dateTime?.split('T')[0],
      end: ev.end?.date || ev.end?.dateTime?.split('T')[0],
      description: ev.description,
      location: ev.location,
      colorId: ev.colorId,
      status: ev.status
    }));

    return NextResponse.json(formatted);
  } catch (err: any) {
    console.error('GET Events Error:', err);
    const status = err.message === 'Unauthorized' ? 401 : (err.message === 'User does not belong to a team' ? 403 : 500);
    return NextResponse.json({ error: err.message }, { status });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const teamId = await getTeamId();
    const body = await request.json();
    const { eventId, start, end, summary, description } = body;
    
    if (!eventId) return NextResponse.json({ error: 'eventId is required' }, { status: 400 });
    
    const updated = await updateEvent(teamId, eventId, { start, end, summary, description });
    return NextResponse.json(updated);
  } catch (err: any) {
    console.error('PATCH Event Error:', err);
    const status = err.message === 'Unauthorized' ? 401 : (err.message === 'User does not belong to a team' ? 403 : 500);
    return NextResponse.json({ error: err.message }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const teamId = await getTeamId();
    const body = await request.json();
    const { start, end, summary, description } = body;
    
    if (!start || !end || !summary) return NextResponse.json({ error: 'start, end, and summary are required' }, { status: 400 });
    
    const created = await createEvent(teamId, { start, end, summary, description });
    return NextResponse.json(created);
  } catch (err: any) {
    console.error('POST Event Error:', err);
    const status = err.message === 'Unauthorized' ? 401 : (err.message === 'User does not belong to a team' ? 403 : 500);
    return NextResponse.json({ error: err.message }, { status });
  }
}
