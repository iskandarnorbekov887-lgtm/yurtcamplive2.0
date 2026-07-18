'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { Calendar, Key, ShieldCheck, CheckCircle2, AlertTriangle, Loader2, Save, RefreshCcw } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TeamSettings {
  id?: string;
  team_id: string;
  google_calendar_id: string;
  google_service_account_email: string;
  google_private_key: string;
  google_calendar_integration_method: 'api' | 'ical' | 'oauth';
  google_ical_url: string;
  google_oauth_access_token?: string;
  google_oauth_refresh_token?: string;
  google_oauth_token_expiry?: string;
  updated_at?: string;
}

type SaveStatus = 'idle' | 'loading' | 'success' | 'error';

// ─── Animated notification banner ─────────────────────────────────────────────

function StatusBanner({ status, message }: { status: SaveStatus; message?: string }) {
  if (status === 'idle') return null;

  const config = {
    loading: {
      bg: 'bg-[#1C232E] border-[#5C4A2E]/40',
      icon: <Loader2 size={16} className="animate-spin text-[#9C9384]" />,
      text: 'text-[#9C9384]',
      label: 'Saving changes…',
    },
    success: {
      bg: 'bg-[#0B6E4F]/15 border-[#0B6E4F]/40',
      icon: <CheckCircle2 size={16} className="text-[#0B6E4F]" />,
      text: 'text-[#34D399]',
      label: message ?? 'Settings saved successfully.',
    },
    error: {
      bg: 'bg-[#722F37]/15 border-[#722F37]/40',
      icon: <AlertTriangle size={16} className="text-[#F87171]" />,
      text: 'text-[#F87171]',
      label: message ?? 'Something went wrong. Please try again.',
    },
  }[status];

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 rounded-2xl border text-xs font-semibold animate-in fade-in slide-in-from-top-2 duration-300 ${config.bg} ${config.text}`}
    >
      {config.icon}
      <span>{config.label}</span>
    </div>
  );
}

// ─── Skeleton loader ──────────────────────────────────────────────────────────

function FieldSkeleton() {
  return (
    <div className="space-y-2 animate-pulse">
      <div className="h-3 w-32 bg-[#5C4A2E]/30 rounded-full" />
      <div className="h-[52px] w-full bg-[#1C232E]/60 rounded-[18px] border-2 border-[#5C4A2E]/20" />
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function TeamIntegrationSettings() {
  const { user } = useAuth();

  // Form state
  const [calendarId, setCalendarId] = useState('');
  const [serviceAccountEmail, setServiceAccountEmail] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [integrationMethod, setIntegrationMethod] = useState<'api' | 'ical' | 'oauth'>('api');
  const [icalUrl, setIcalUrl] = useState('');
  const [teamId, setTeamId] = useState<string | null>(null);

  // UI state
  const [fetchLoading, setFetchLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [saveMessage, setSaveMessage] = useState<string | undefined>(undefined);
  const [lastSaved, setLastSaved] = useState<string | null>(null);

  // ── Resolve team_id from authenticated user's profile ──────────────────────

  const resolveTeamId = useCallback(async (): Promise<string | null> => {
    if (!user?.id) return null;

    // Prefer a `team_id` column on profiles; fall back to the user's own id
    // as a single-user team identifier. Adjust this logic to match your schema.
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('id, team_id')
      .eq('id', user.id)
      .single();

    if (error) {
      console.warn('TeamIntegrationSettings: could not resolve team_id from profile', error.message);
      // Graceful degradation: use user id as the team identifier
      return user.id;
    }

    // `team_id` column exists → use it; otherwise fall back to user id
    return (profile as any)?.team_id ?? profile?.id ?? user.id;
  }, [user?.id]);

  // ── Fetch existing settings on mount ──────────────────────────────────────

  const fetchSettings = useCallback(async () => {
    setFetchLoading(true);
    try {
      const resolvedTeamId = await resolveTeamId();
      if (!resolvedTeamId) return;
      setTeamId(resolvedTeamId);

      const { data, error } = await supabase
        .from('team_settings')
        .select('*')
        .eq('team_id', resolvedTeamId)
        .maybeSingle();

      if (error) {
        console.error('TeamIntegrationSettings: fetch error', error.message);
        return;
      }

      if (data) {
        setCalendarId((data as TeamSettings).google_calendar_id ?? '');
        setServiceAccountEmail((data as TeamSettings).google_service_account_email ?? '');
        setPrivateKey((data as TeamSettings).google_private_key ?? '');
        setIntegrationMethod((data as TeamSettings).google_calendar_integration_method ?? 'api');
        setIcalUrl((data as TeamSettings).google_ical_url ?? '');
        setLastSaved((data as TeamSettings).updated_at ?? null);
      }
    } finally {
      setFetchLoading(false);
    }
  }, [resolveTeamId]);

  useEffect(() => {
    if (user?.id) {
      fetchSettings();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // ── Save handler (upsert) ─────────────────────────────────────────────────

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamId) return;

    if (!calendarId.trim()) {
      setSaveStatus('error');
      setSaveMessage('Google Calendar ID is required.');
      setTimeout(() => { setSaveStatus('idle'); setSaveMessage(undefined); }, 4000);
      return;
    }

    if (integrationMethod === 'api' && (!serviceAccountEmail.trim() || !privateKey.trim())) {
      setSaveStatus('error');
      setSaveMessage('Service Account credentials are required for API mode.');
      setTimeout(() => { setSaveStatus('idle'); setSaveMessage(undefined); }, 4000);
      return;
    }

    if (integrationMethod === 'ical' && !icalUrl.trim()) {
      setSaveStatus('error');
      setSaveMessage('iCal Feed URL is required for iCal mode.');
      setTimeout(() => { setSaveStatus('idle'); setSaveMessage(undefined); }, 4000);
      return;
    }

    if (integrationMethod === 'oauth') {
      // OAuth mode doesn't require manual input - credentials are stored via OAuth flow
      // Just save the integration method and calendar ID
    }

    setSaveStatus('loading');
    setSaveMessage(undefined);

    try {
      const payload: TeamSettings = {
        team_id: teamId,
        google_calendar_id: calendarId.trim(),
        google_service_account_email: serviceAccountEmail.trim(),
        google_private_key: privateKey.trim(),
        google_calendar_integration_method: integrationMethod,
        google_ical_url: icalUrl.trim(),
      };

      console.log('[TeamIntegrationSettings] Saving integration_method:', integrationMethod);

      const { error } = await supabase
        .from('team_settings')
        .upsert(payload, { onConflict: 'team_id' });

      if (error) throw error;

      fetch('/api/calendar/invalidate-cache', { method: 'POST' }).catch(() => {});

      const now = new Date().toISOString();
      setLastSaved(now);
      setSaveStatus('success');
      setSaveMessage('Integration settings saved successfully.');
    } catch (err: any) {
      console.error('TeamIntegrationSettings: save error', err?.message);
      setSaveStatus('error');
      setSaveMessage(err?.message ?? 'Failed to save settings.');
    } finally {
      // Reset status back to idle after 4 seconds
      setTimeout(() => {
        setSaveStatus('idle');
        setSaveMessage(undefined);
      }, 4000);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#0F1419] text-[#EDE6D6] p-4 sm:p-8 flex flex-col gap-6 items-center">
      {/* Page header */}
      <div className="w-full max-w-xl">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-2xl bg-[#0B6E4F]/20 border border-[#0B6E4F]/30 flex items-center justify-center">
            <Calendar size={18} className="text-[#C9A227]" />
          </div>
          <h1 className="text-2xl font-black text-[#EDE6D6] tracking-tight">
            Team Integration Settings
          </h1>
        </div>
        <p className="text-xs text-[#9C9384] font-medium ml-[52px]">
          Connect your team's Google Calendar to sync bookings automatically.
        </p>
      </div>

      {/* Main card */}
      <div className="w-full max-w-xl bg-[#1C232E] rounded-[28px] border border-[#5C4A2E]/30 shadow-2xl overflow-hidden">
        {/* Card header accent */}
        <div className="bg-[#0B6E4F] px-6 py-5">
          <h2 className="text-sm font-black text-[#C9A227] uppercase tracking-widest">
            Google Calendar Integration
          </h2>
          <p className="text-[#EDE6D6]/60 text-xs font-medium mt-0.5">
            These credentials are used to read and write events on your team calendar.
          </p>
        </div>

        <form onSubmit={handleSave} className="p-6 space-y-5">
          {/* Status banner */}
          <StatusBanner status={saveStatus} message={saveMessage} />

          {/* Integration Method Toggle */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-[10px] font-black text-[#9C9384] uppercase tracking-widest">
              <Calendar size={11} />
              Integration Method
            </label>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setIntegrationMethod('api')}
                className={`flex-1 px-4 py-3 rounded-xl border-2 text-xs font-bold uppercase tracking-wider transition-all ${
                  integrationMethod === 'api'
                    ? 'bg-[#0B6E4F]/20 border-[#0B6E4F] text-[#0B6E4F]'
                    : 'bg-[#0F1419]/60 border-[#5C4A2E]/30 text-[#9C9384] hover:border-[#5C4A2E]/60'
                }`}
              >
                Service Account (API)
              </button>
              <button
                type="button"
                onClick={() => setIntegrationMethod('ical')}
                className={`flex-1 px-4 py-3 rounded-xl border-2 text-xs font-bold uppercase tracking-wider transition-all ${
                  integrationMethod === 'ical'
                    ? 'bg-[#0B6E4F]/20 border-[#0B6E4F] text-[#0B6E4F]'
                    : 'bg-[#0F1419]/60 border-[#5C4A2E]/30 text-[#9C9384] hover:border-[#5C4A2E]/60'
                }`}
              >
                Public iCal Feed
              </button>
              <button
                type="button"
                onClick={() => setIntegrationMethod('oauth')}
                className={`flex-1 px-4 py-3 rounded-xl border-2 text-xs font-bold uppercase tracking-wider transition-all ${
                  integrationMethod === 'oauth'
                    ? 'bg-[#0B6E4F]/20 border-[#0B6E4F] text-[#0B6E4F]'
                    : 'bg-[#0F1419]/60 border-[#5C4A2E]/30 text-[#9C9384] hover:border-[#5C4A2E]/60'
                }`}
              >
                Personal OAuth Login
              </button>
            </div>
          </div>

          {/* Google Calendar ID */}
          <div className="space-y-2">
            <label
              htmlFor="google-calendar-id"
              className="flex items-center gap-2 text-[10px] font-black text-[#9C9384] uppercase tracking-widest"
            >
              <Calendar size={11} />
              Google Calendar ID
            </label>
            {fetchLoading ? (
              <FieldSkeleton />
            ) : (
              <input
                id="google-calendar-id"
                type="text"
                value={calendarId}
                onChange={(e) => setCalendarId(e.target.value)}
                placeholder="your-calendar@group.calendar.google.com"
                autoComplete="off"
                spellCheck={false}
                className="w-full px-5 py-[14px] bg-[#0F1419]/60 border-2 border-[#5C4A2E]/30 rounded-[18px] text-sm font-semibold text-[#EDE6D6] placeholder-[#5C4A2E]/60 focus:border-[#0B6E4F] focus:ring-2 focus:ring-[#0B6E4F]/20 outline-none transition-all duration-200"
              />
            )}
          </div>

          {/* Conditional fields based on integration method */}
          {integrationMethod === 'api' ? (
            <>
              {/* Google Service Account Email */}
              <div className="space-y-2">
                <label
                  htmlFor="service-account-email"
                  className="flex items-center gap-2 text-[10px] font-black text-[#9C9384] uppercase tracking-widest"
                >
                  <Key size={11} />
                  Service Account Email
                </label>
                {fetchLoading ? (
                  <FieldSkeleton />
                ) : (
                  <input
                    id="service-account-email"
                    type="text"
                    value={serviceAccountEmail}
                    onChange={(e) => setServiceAccountEmail(e.target.value)}
                    placeholder="service-account@project.iam.gserviceaccount.com"
                    autoComplete="off"
                    className="w-full px-5 py-[14px] bg-[#0F1419]/60 border-2 border-[#5C4A2E]/30 rounded-[18px] text-sm font-semibold text-[#EDE6D6] placeholder-[#5C4A2E]/60 focus:border-[#C9A227] focus:ring-2 focus:ring-[#C9A227]/15 outline-none transition-all duration-200 font-mono tracking-wider"
                  />
                )}
              </div>

              {/* Google Private Key */}
              <div className="space-y-2">
                <label
                  htmlFor="private-key"
                  className="flex items-center gap-2 text-[10px] font-black text-[#9C9384] uppercase tracking-widest"
                >
                  <Key size={11} />
                  Private Key
                </label>
                {fetchLoading ? (
                  <FieldSkeleton />
                ) : (
                  <textarea
                    id="private-key"
                    value={privateKey}
                    onChange={(e) => setPrivateKey(e.target.value)}
                    placeholder={"-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----"}
                    autoComplete="new-password"
                    className="w-full h-32 px-5 py-[14px] bg-[#0F1419]/60 border-2 border-[#5C4A2E]/30 rounded-[18px] text-sm font-semibold text-[#EDE6D6] placeholder-[#5C4A2E]/60 focus:border-[#C9A227] focus:ring-2 focus:ring-[#C9A227]/15 outline-none transition-all duration-200 font-mono tracking-wider resize-none"
                  />
                )}
              </div>
            </>
          ) : integrationMethod === 'ical' ? (
            /* iCal URL */
            <div className="space-y-2">
              <label
                htmlFor="ical-url"
                className="flex items-center gap-2 text-[10px] font-black text-[#9C9384] uppercase tracking-widest"
              >
                <Calendar size={11} />
                iCal Feed URL
              </label>
              {fetchLoading ? (
                <FieldSkeleton />
              ) : (
                <input
                  id="ical-url"
                  type="text"
                  value={icalUrl}
                  onChange={(e) => setIcalUrl(e.target.value)}
                  placeholder="https://calendar.google.com/calendar/ical/.../public/basic.ics"
                  autoComplete="off"
                  spellCheck={false}
                  className="w-full px-5 py-[14px] bg-[#0F1419]/60 border-2 border-[#5C4A2E]/30 rounded-[18px] text-sm font-semibold text-[#EDE6D6] placeholder-[#5C4A2E]/60 focus:border-[#0B6E4F] focus:ring-2 focus:ring-[#0B6E4F]/20 outline-none transition-all duration-200 font-mono tracking-wider"
                />
              )}
              <p className="text-[10px] text-[#5C4A2E] font-medium px-1">
                Get this from Google Calendar → Settings → specific calendar → Integrate calendar → Public address in iCal format.
              </p>
            </div>
          ) : (
            /* OAuth Login */
            <div className="space-y-3">
              <div className="p-4 bg-[#0B6E4F]/10 border border-[#0B6E4F]/30 rounded-2xl">
                <p className="text-xs font-bold text-[#0B6E4F] mb-2">Personal OAuth Login</p>
                <p className="text-[10px] font-medium text-[#9C9384] leading-relaxed mb-3">
                  Connect with your personal Google account to access calendars where you have viewer or collaborator permissions.
                </p>
                <a
                  href="/api/calendar/oauth/start"
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#0B6E4F] hover:bg-[#0B6E4F]/90 text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-all duration-200"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  Connect with Google
                </a>
              </div>
              <p className="text-[10px] text-[#5C4A2E] font-medium px-1">
                This will redirect you to Google's OAuth consent screen. After authorization, you'll be returned to this page.
              </p>
            </div>
          )}

          {/* Security warning */}
          <div className="flex gap-3 p-4 bg-[#C9A227]/8 border border-[#C9A227]/25 rounded-2xl">
            <ShieldCheck size={16} className="text-[#C9A227] flex-shrink-0 mt-[1px]" />
            <div className="space-y-1">
              <p className="text-xs font-bold text-[#C9A227]">Stored Securely</p>
              <p className="text-[10px] font-medium text-[#9C9384] leading-relaxed">
                Your API key is encrypted at rest in Supabase and is never exposed in client-side logs or error responses. Only team members with the <span className="text-[#EDE6D6] font-semibold">CEO</span> role can update these credentials.
              </p>
            </div>
          </div>

          {/* Last saved indicator */}
          {lastSaved && (
            <p className="text-[10px] text-[#5C4A2E] font-medium text-center">
              Last saved: {new Date(lastSaved).toLocaleString()}
            </p>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={fetchSettings}
              disabled={fetchLoading || saveStatus === 'loading'}
              title="Reload settings from database"
              className="w-12 h-12 flex items-center justify-center rounded-2xl bg-[#0F1419]/60 border-2 border-[#5C4A2E]/30 text-[#9C9384] hover:text-[#EDE6D6] hover:border-[#5C4A2E]/60 active:scale-95 transition-all duration-200 disabled:opacity-40 flex-shrink-0"
            >
              <RefreshCcw
                size={16}
                className={fetchLoading ? 'animate-spin' : ''}
              />
            </button>

            <button
              type="submit"
              disabled={fetchLoading || saveStatus === 'loading' || !teamId}
              className="flex-1 flex items-center justify-center gap-2 py-4 rounded-2xl bg-[#0B6E4F] text-[#C9A227] text-xs font-black uppercase tracking-[0.18em] shadow-lg shadow-[#0B6E4F]/20 hover:bg-[#0d8560] active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saveStatus === 'loading' ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  <Save size={14} />
                  Save Settings
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Team context pill */}
      {teamId && !fetchLoading && (
        <div className="flex items-center gap-2 px-4 py-2 bg-[#1C232E]/60 border border-[#5C4A2E]/20 rounded-full animate-in fade-in duration-500">
          <div className="w-2 h-2 rounded-full bg-[#0B6E4F] animate-pulse" />
          <span className="text-[10px] font-bold text-[#9C9384] uppercase tracking-widest">
            Team ID:
          </span>
          <span className="text-[10px] font-mono font-semibold text-[#EDE6D6]/60 truncate max-w-[200px]">
            {teamId}
          </span>
        </div>
      )}
    </div>
  );
}
