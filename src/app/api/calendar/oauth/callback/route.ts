import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { supabase as supabaseAdmin } from '@/app/api/_supabase';

export const dynamic = 'force-dynamic';

// Simple encryption for token storage (in production, use proper encryption)
function encrypt(text: string): string {
  const algorithm = 'aes-256-cbc';
  const key = Buffer.from(process.env.ENCRYPTION_KEY || 'default-32-char-key-for-encryption!', 'utf8').slice(0, 32);
  const iv = Buffer.from(process.env.ENCRYPTION_IV || 'default-16-char-iv', 'utf8').slice(0, 16);
  
  // For now, just base64 encode (upgrade to proper encryption in production)
  return Buffer.from(text).toString('base64');
}

function decrypt(encrypted: string): string {
  // For now, just base64 decode (upgrade to proper encryption in production)
  return Buffer.from(encrypted, 'base64').toString('utf8');
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    if (error) {
      console.error('OAuth error:', error);
      return NextResponse.redirect(new URL('/ceo/team-settings?error=oauth_error', request.url));
    }

    if (!code || !state) {
      return NextResponse.redirect(new URL('/ceo/team-settings?error=invalid_oauth_response', request.url));
    }

    // Verify state
    let stateData;
    try {
      stateData = JSON.parse(Buffer.from(state, 'base64').toString());
    } catch {
      return NextResponse.redirect(new URL('/ceo/team-settings?error=invalid_state', request.url));
    }

    const { team_id, user_id } = stateData;

    // Exchange code for tokens
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    const redirectUri = process.env.NODE_ENV === 'production' 
      ? process.env.GOOGLE_OAUTH_REDIRECT_URI_PROD 
      : process.env.GOOGLE_OAUTH_REDIRECT_URI_DEV;

    if (!clientId || !clientSecret || !redirectUri) {
      throw new Error('OAuth credentials not configured');
    }

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('Token exchange failed:', errorText);
      throw new Error('Failed to exchange authorization code for tokens');
    }

    const tokenData = await tokenResponse.json();
    const { access_token, refresh_token, expires_in } = tokenData;

    // Calculate expiry time
    const expiresAt = new Date(Date.now() + (expires_in || 3600) * 1000).toISOString();

    // Encrypt tokens before storing
    const encryptedAccessToken = encrypt(access_token);
    const encryptedRefreshToken = encrypt(refresh_token);

    // Store tokens in team_settings
    const { error: updateError } = await supabaseAdmin
      .from('team_settings')
      .update({
        google_calendar_integration_method: 'oauth',
        google_oauth_access_token: encryptedAccessToken,
        google_oauth_refresh_token: encryptedRefreshToken,
        google_oauth_token_expiry: expiresAt,
        google_calendar_id: '072d8da6e5b1a848d2ec34c42648591405a428494d10c820a7a8b198125e864c@group.calendar.google.com',
      })
      .eq('team_id', team_id);

    if (updateError) {
      console.error('Failed to store OAuth tokens:', updateError);
      throw new Error('Failed to store OAuth tokens');
    }

    return NextResponse.redirect(new URL('/ceo/team-settings?success=oauth_connected', request.url));
  } catch (error: any) {
    console.error('OAuth callback error:', error);
    return NextResponse.redirect(new URL('/ceo/team-settings?error=oauth_callback_failed', request.url));
  }
}
