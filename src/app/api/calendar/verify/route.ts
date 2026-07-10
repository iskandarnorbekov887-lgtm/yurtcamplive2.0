import { NextRequest, NextResponse } from 'next/server';
import { verifyConnection } from '@/utils/calendar-sync';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          set(name: string, value: string, options: CookieOptions) {
            cookieStore.set({ name, value, ...options });
          },
          remove(name: string, options: CookieOptions) {
            cookieStore.set({ name, value: '', ...options });
          },
        },
      }
    );

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { ok: false, error: { message: 'Unauthorized' } },
        { status: 401 }
      );
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('team_id, role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'CEO') {
      return NextResponse.json(
        { ok: false, error: { message: 'Forbidden' } },
        { status: 403 }
      );
    }

    const teamId = profile?.team_id || user.id;

    const calendarMeta = await verifyConnection(teamId);

    return NextResponse.json({
      ok: true,
      meta: {
        calendar_id: calendarMeta.id,
        calendar_name: calendarMeta.summary,
      },
    });
  } catch (error: any) {
    console.error('Calendar Verify Error:', error);
    return NextResponse.json(
      { ok: false, error: { message: error.message || 'Verification failed' } },
      { status: 500 }
    );
  }
}
