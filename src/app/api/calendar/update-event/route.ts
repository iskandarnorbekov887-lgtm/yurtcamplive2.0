import { NextRequest, NextResponse } from 'next/server';
import { updateEvent } from '@/utils/calendar-sync';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { eventId, start, end, summary, description } = body;
    
    if (!eventId) {
      return NextResponse.json({ error: 'eventId is required' }, { status: 400 });
    }
    
    // We use PATCH to only update provided fields
    const updated = await updateEvent(eventId, { start, end, summary, description });
    
    return NextResponse.json({ success: true, event: updated });
  } catch (err: any) {
    console.error('Google Calendar Update Error:', err);
    return NextResponse.json({ 
      success: false, 
      error: err.message || 'Failed to sync with Google Calendar' 
    }, { status: 500 });
  }
}
