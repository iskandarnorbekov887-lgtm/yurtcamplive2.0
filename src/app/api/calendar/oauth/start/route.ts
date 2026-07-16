import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('team_id')
      .eq('id', user.id)
      .single();
    
    if (!profile?.team_id) {
      return NextResponse.redirect(new URL('/unauthorized', request.url));
    }

    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    const redirectUri = process.env.NODE_ENV === 'production' 
      ? process.env.GOOGLE_OAUTH_REDIRECT_URI_PROD 
      : process.env.GOOGLE_OAUTH_REDIRECT_URI_DEV;

    console.log('[oauth/start] DEBUG: CLIENT_ID exists:', !!clientId);
    console.log('[oauth/start] DEBUG: CLIENT_ID value:', clientId?.substring(0, 20) + '...');
    console.log('[oauth/start] DEBUG: NODE_ENV:', process.env.NODE_ENV);
    console.log('[oauth/start] DEBUG: REDIRECT_URI exists:', !!redirectUri);
    console.log('[oauth/start] DEBUG: REDIRECT_URI value:', redirectUri);

    if (!clientId || !redirectUri) {
      throw new Error('OAuth credentials not configured');
    }

    // Generate state parameter for CSRF protection
    const state = Buffer.from(JSON.stringify({
      team_id: profile.team_id,
      user_id: user.id,
      timestamp: Date.now()
    })).toString('base64');

    const oauthUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    oauthUrl.searchParams.set('client_id', clientId);
    oauthUrl.searchParams.set('redirect_uri', redirectUri);
    oauthUrl.searchParams.set('response_type', 'code');
    oauthUrl.searchParams.set('scope', 'https://www.googleapis.com/auth/calendar.readonly');
    oauthUrl.searchParams.set('access_type', 'offline'); // Get refresh token
    oauthUrl.searchParams.set('state', state);
    oauthUrl.searchParams.set('prompt', 'consent'); // Force consent to get refresh token

    return NextResponse.redirect(oauthUrl.toString());
  } catch (error: any) {
    console.error('OAuth start error:', error);
    return NextResponse.redirect(new URL('/ceo/team-settings?error=oauth_start_failed', request.url));
  }
}
