'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ProtectedRoute } from '@/components/protected-route';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import {
  Settings,
  Calendar,
  Key,
  ShieldCheck,
  Save,
  RefreshCcw,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Plug,
  Eye,
  EyeOff,
  ArrowLeft,
  Wifi,
  WifiOff,
} from 'lucide-react';

// ─── Force dynamic — no SSR for auth-gated pages ─────────────────────────────
export const dynamic = 'force-dynamic';

// ─── Page shell: wraps in ProtectedRoute so non-CEOs are redirected ───────────
export default function TeamSettingsPage() {
  return (
    <ProtectedRoute allowedRoles={['CEO']}>
      <TeamSettingsContent />
    </ProtectedRoute>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

type AlertKind = 'success' | 'error' | 'info' | 'warning';

interface AlertState {
  kind: AlertKind;
  title: string;
  message: string;
}

// ─── Inline Alert component ───────────────────────────────────────────────────

function Alert({
  alert,
  onDismiss,
}: {
  alert: AlertState;
  onDismiss: () => void;
}) {
  const map: Record<AlertKind, { bg: string; border: string; icon: React.ReactNode; titleColor: string; textColor: string }> = {
    success: {
      bg: 'bg-[#0B6E4F]/10',
      border: 'border-[#0B6E4F]/40',
      icon: <CheckCircle2 size={18} className="text-[#34D399] flex-shrink-0" />,
      titleColor: 'text-[#34D399]',
      textColor: 'text-[#9C9384]',
    },
    error: {
      bg: 'bg-[#722F37]/10',
      border: 'border-[#722F37]/40',
      icon: <AlertTriangle size={18} className="text-[#F87171] flex-shrink-0" />,
      titleColor: 'text-[#F87171]',
      textColor: 'text-[#9C9384]',
    },
    warning: {
      bg: 'bg-[#C9A227]/10',
      border: 'border-[#C9A227]/30',
      icon: <AlertTriangle size={18} className="text-[#C9A227] flex-shrink-0" />,
      titleColor: 'text-[#C9A227]',
      textColor: 'text-[#9C9384]',
    },
    info: {
      bg: 'bg-[#1C232E]/80',
      border: 'border-[#5C4A2E]/40',
      icon: <Plug size={18} className="text-[#9C9384] flex-shrink-0" />,
      titleColor: 'text-[#EDE6D6]',
      textColor: 'text-[#9C9384]',
    },
  };

  const s = map[alert.kind];

  return (
    <div
      className={`flex items-start gap-3 p-4 rounded-2xl border animate-in fade-in slide-in-from-top-2 duration-300 ${s.bg} ${s.border}`}
    >
      {s.icon}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-bold leading-tight ${s.titleColor}`}>{alert.title}</p>
        {alert.message && (
          <p className={`text-xs mt-1 leading-relaxed ${s.textColor}`}>{alert.message}</p>
        )}
      </div>
      <button
        onClick={onDismiss}
        className="flex-shrink-0 text-[#5C4A2E] hover:text-[#9C9384] transition-colors text-lg leading-none"
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}

// ─── Skeleton field ───────────────────────────────────────────────────────────

function SkeletonField() {
  return (
    <div className="space-y-2 animate-pulse">
      <div className="h-3 w-36 bg-[#5C4A2E]/25 rounded-full" />
      <div className="h-[52px] w-full bg-[#0F1419]/50 rounded-[18px] border-2 border-[#5C4A2E]/15" />
    </div>
  );
}

// ─── Connection status badge ──────────────────────────────────────────────────

type ConnectionStatus = 'idle' | 'testing' | 'ok' | 'fail';

function ConnectionBadge({ status }: { status: ConnectionStatus }) {
  if (status === 'idle') return null;

  const map: Record<Exclude<ConnectionStatus, 'idle'>, { icon: React.ReactNode; label: string; cls: string }> = {
    testing: {
      icon: <Loader2 size={12} className="animate-spin" />,
      label: 'Testing connection…',
      cls: 'bg-[#1C232E] border-[#5C4A2E]/40 text-[#9C9384]',
    },
    ok: {
      icon: <Wifi size={12} className="text-[#34D399]" />,
      label: 'Connection verified',
      cls: 'bg-[#0B6E4F]/15 border-[#0B6E4F]/40 text-[#34D399]',
    },
    fail: {
      icon: <WifiOff size={12} className="text-[#F87171]" />,
      label: 'Connection failed',
      cls: 'bg-[#722F37]/15 border-[#722F37]/40 text-[#F87171]',
    },
  };

  const s = map[status as Exclude<ConnectionStatus, 'idle'>];

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[10px] font-bold uppercase tracking-widest transition-all animate-in fade-in duration-300 ${s.cls}`}
    >
      {s.icon}
      {s.label}
    </div>
  );
}

// ─── Main content (CEO-only) ──────────────────────────────────────────────────

function TeamSettingsContent() {
  const router = useRouter();
  const { user } = useAuth();

  // Form fields
  const [calendarId, setCalendarId] = useState('');
  const [serviceAccountEmail, setServiceAccountEmail] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [integrationMethod, setIntegrationMethod] = useState<'api' | 'ical'>('api');
  const [icalUrl, setIcalUrl] = useState('');

  // Resolved team_id (falls back to user.id if no team_id column exists)
  const [teamId, setTeamId] = useState<string | null>(null);

  // UI states
  const [fetchLoading, setFetchLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('idle');
  const [lastSaved, setLastSaved] = useState<string | null>(null);

  // Alert stack (one visible at a time)
  const [alert, setAlert] = useState<AlertState | null>(null);

  const showAlert = useCallback((a: AlertState) => {
    setAlert(a);
  }, []);

  const dismissAlert = useCallback(() => setAlert(null), []);

  // ── Resolve team_id from profiles ──────────────────────────────────────────
  const resolveTeamId = useCallback(async (): Promise<string | null> => {
    if (!user?.id) return null;

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('id, team_id')
      .eq('id', user.id)
      .single();

    if (error) {
      console.warn('[TeamSettings] Could not read team_id from profile:', error.message);
      return user.id; // graceful fallback: user IS the team
    }

    return (profile as any)?.team_id ?? profile?.id ?? user.id;
  }, [user?.id]);

  // ── Fetch existing settings ─────────────────────────────────────────────────
  const fetchSettings = useCallback(async () => {
    setFetchLoading(true);
    try {
      const resolved = await resolveTeamId();
      if (!resolved) return;
      setTeamId(resolved);

      const { data, error } = await supabase
        .from('team_settings')
        .select('google_calendar_id, google_service_account_email, google_private_key, google_calendar_integration_method, google_ical_url, updated_at')
        .eq('team_id', resolved)
        .maybeSingle();

      if (error) {
        console.error('[TeamSettings] Fetch error:', error.message);
        showAlert({
          kind: 'error',
          title: 'Could not load settings',
          message: error.message,
        });
        return;
      }

      if (data) {
        setCalendarId((data as any).google_calendar_id ?? '');
        setServiceAccountEmail((data as any).google_service_account_email ?? '');
        setPrivateKey((data as any).google_private_key ?? '');
        setIntegrationMethod((data as any).google_calendar_integration_method ?? 'api');
        setIcalUrl((data as any).google_ical_url ?? '');
        setLastSaved((data as any).updated_at ?? null);
      }
    } finally {
      setFetchLoading(false);
    }
  }, [resolveTeamId, showAlert]);

  useEffect(() => {
    if (user?.id) fetchSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // ── Save handler — upsert ───────────────────────────────────────────────────
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamId) return;

    if (!calendarId.trim()) {
      showAlert({ kind: 'warning', title: 'Validation', message: 'Google Calendar ID is required.' });
      return;
    }

    if (integrationMethod === 'api' && (!serviceAccountEmail.trim() || !privateKey.trim())) {
      showAlert({ kind: 'warning', title: 'Validation', message: 'Service Account credentials are required for API mode.' });
      return;
    }

    if (integrationMethod === 'ical' && !icalUrl.trim()) {
      showAlert({ kind: 'warning', title: 'Validation', message: 'iCal Feed URL is required for iCal mode.' });
      return;
    }

    setSaving(true);
    dismissAlert();

    try {
      const { error } = await supabase.from('team_settings').upsert(
        {
          team_id: teamId,
          google_calendar_id: calendarId.trim(),
          google_service_account_email: serviceAccountEmail.trim(),
          google_private_key: privateKey.trim(),
          google_calendar_integration_method: integrationMethod,
          google_ical_url: icalUrl.trim(),
        },
        { onConflict: 'team_id' },
      );

      if (error) throw error;

      fetch('/api/calendar/invalidate-cache', { method: 'POST' }).catch(() => {});

      const now = new Date().toISOString();
      setLastSaved(now);
      // Reset connection status on save so user retests with new credentials
      setConnectionStatus('idle');
      showAlert({
        kind: 'success',
        title: 'Settings saved',
        message: 'Your Google Calendar credentials have been saved securely.',
      });
    } catch (err: any) {
      showAlert({
        kind: 'error',
        title: 'Save failed',
        message: err?.message ?? 'An unexpected error occurred.',
      });
    } finally {
      setSaving(false);
    }
  };

  // ── Test connection — calls the verify-google-calendar Edge Function ─────────
  const handleTestConnection = async () => {
    if (!teamId) return;

    // Prompt to save first if there are unsaved values
    setConnectionStatus('testing');
    dismissAlert();

    try {
      const {
        data: { session },
        error: sessionErr,
      } = await supabase.auth.getSession();

      if (sessionErr || !session?.access_token) {
        throw new Error('Your session has expired. Please sign in again.');
      }

      const response = await fetch('/api/calendar/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok || payload?.ok === false) {
        const msg = payload?.error?.message ?? `HTTP ${response.status}`;
        throw new Error(msg);
      }

      setConnectionStatus('ok');
      showAlert({
        kind: 'success',
        title: '✅ Connection successful',
        message: `Google Calendar is reachable. Calendar: ${payload?.meta?.calendar_id ?? calendarId}`,
      });
    } catch (err: any) {
      setConnectionStatus('fail');
      showAlert({
        kind: 'error',
        title: '❌ Connection failed',
        message: err?.message ?? 'Could not reach Google Calendar. Verify your credentials.',
      });
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#0F1419] text-[#EDE6D6]">

      {/* ── Top nav bar ─────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-[#0B6E4F] shadow-xl">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/ceo')}
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-[#1C232E]/20 hover:bg-[#1C232E]/40 transition-all"
              aria-label="Back to dashboard"
            >
              <ArrowLeft size={16} className="text-[#C9A227]" />
            </button>
            <div className="w-9 h-9 rounded-xl bg-[#1C232E]/20 flex items-center justify-center">
              <Settings size={16} className="text-[#C9A227]" />
            </div>
            <div>
              <h1 className="text-base font-black text-[#EDE6D6] uppercase tracking-tight leading-none">
                Team Settings
              </h1>
              <p className="text-[10px] text-[#C9A227]/70 font-semibold tracking-widest uppercase mt-0.5">
                CEO · Integrations
              </p>
            </div>
          </div>

          {/* Connection badge lives in the header so it's always visible */}
          <ConnectionBadge status={connectionStatus} />
        </div>
      </header>

      {/* ── Page body ───────────────────────────────────────────────────────── */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">

        {/* Alert */}
        {alert && <Alert alert={alert} onDismiss={dismissAlert} />}

        {/* ── Settings card ─────────────────────────────────────────────────── */}
        <div className="bg-[#1C232E] rounded-[28px] border border-[#5C4A2E]/30 shadow-2xl overflow-hidden">

          {/* Card header */}
          <div className="bg-gradient-to-r from-[#0B6E4F] to-[#0a5e43] px-6 sm:px-8 py-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-[#1C232E]/20 flex items-center justify-center flex-shrink-0">
                <Calendar size={18} className="text-[#C9A227]" />
              </div>
              <div>
                <h2 className="text-base font-black text-[#C9A227] uppercase tracking-widest">
                  Google Calendar Integration
                </h2>
                <p className="text-xs text-[#EDE6D6]/60 font-medium mt-0.5">
                  Connect your team calendar to sync booking events automatically.
                </p>
              </div>
            </div>
          </div>

          <form onSubmit={handleSave} className="p-6 sm:p-8 space-y-6">

            {/* ── Integration Method Toggle ─────────────────────────────────────── */}
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
              </div>
            </div>

            {/* ── Google Calendar ID ─────────────────────────────────────────── */}
            <div className="space-y-2">
              <label
                htmlFor="cal-id"
                className="flex items-center gap-2 text-[10px] font-black text-[#9C9384] uppercase tracking-widest"
              >
                <Calendar size={11} />
                Google Calendar ID
                <span className="text-[#722F37] font-black">*</span>
              </label>
              {fetchLoading ? (
                <SkeletonField />
              ) : (
                <input
                  id="cal-id"
                  type="text"
                  value={calendarId}
                  onChange={(e) => setCalendarId(e.target.value)}
                  placeholder="your-calendar@group.calendar.google.com"
                  autoComplete="off"
                  spellCheck={false}
                  className="w-full px-5 py-[15px] bg-[#0F1419]/70 border-2 border-[#5C4A2E]/30 rounded-[18px] text-sm font-semibold text-[#EDE6D6] placeholder-[#5C4A2E]/50 focus:border-[#0B6E4F] focus:ring-2 focus:ring-[#0B6E4F]/20 outline-none transition-all duration-200"
                />
              )}
              <p className="text-[10px] text-[#5C4A2E] font-medium px-1">
                Find this in Google Calendar → Settings → specific calendar → Calendar ID.
              </p>
            </div>

            {/* ── Conditional fields based on integration method ──────────────── */}
            {integrationMethod === 'api' ? (
              <>
                {/* ── Service Account Email ─────────────────────────────────────────────── */}
                <div className="space-y-2">
                  <label
                    htmlFor="service-account-email"
                    className="flex items-center gap-2 text-[10px] font-black text-[#9C9384] uppercase tracking-widest"
                  >
                    <Key size={11} />
                    Service Account Email
                    <span className="text-[#722F37] font-black">*</span>
                  </label>
                  {fetchLoading ? (
                    <SkeletonField />
                  ) : (
                    <div className="relative">
                      <input
                        id="service-account-email"
                        type="text"
                        value={serviceAccountEmail}
                        onChange={(e) => setServiceAccountEmail(e.target.value)}
                        placeholder="service-account@project.iam.gserviceaccount.com"
                        autoComplete="off"
                        className="w-full px-5 py-[15px] bg-[#0F1419]/70 border-2 border-[#5C4A2E]/30 rounded-[18px] text-sm font-semibold text-[#EDE6D6] placeholder-[#5C4A2E]/50 focus:border-[#C9A227] focus:ring-2 focus:ring-[#C9A227]/15 outline-none transition-all duration-200 font-mono tracking-wider"
                      />
                    </div>
                  )}
                </div>

                {/* ── Private Key ─────────────────────────────────────────────── */}
                <div className="space-y-2">
                  <label
                    htmlFor="private-key"
                    className="flex items-center gap-2 text-[10px] font-black text-[#9C9384] uppercase tracking-widest"
                  >
                    <Key size={11} />
                    Private Key
                    <span className="text-[#722F37] font-black">*</span>
                  </label>
                  {fetchLoading ? (
                    <SkeletonField />
                  ) : (
                    <div className="relative">
                      <textarea
                        id="private-key"
                        value={privateKey}
                        onChange={(e) => setPrivateKey(e.target.value)}
                        placeholder={"-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----"}
                        autoComplete="new-password"
                        className={`w-full ${showPrivateKey ? 'h-48' : 'h-14 truncate'} pl-5 pr-14 py-[15px] bg-[#0F1419]/70 border-2 border-[#5C4A2E]/30 rounded-[18px] text-sm font-semibold text-[#EDE6D6] placeholder-[#5C4A2E]/50 focus:border-[#C9A227] focus:ring-2 focus:ring-[#C9A227]/15 outline-none transition-all duration-200 font-mono tracking-wider resize-none`}
                      />
                      {/* Reveal/hide toggle */}
                      <button
                        type="button"
                        onClick={() => setShowPrivateKey((v) => !v)}
                        className="absolute right-4 top-[15px] text-[#5C4A2E] hover:text-[#9C9384] transition-colors"
                        aria-label={showPrivateKey ? 'Hide Private Key' : 'Show Private Key'}
                      >
                        {showPrivateKey ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  )}
                  <p className="text-[10px] text-[#5C4A2E] font-medium px-1">
                    Generate this in Google Cloud Console → IAM &amp; Admin → Service Accounts → Keys (JSON format).
                  </p>
                </div>
              </>
            ) : (
              /* ── iCal URL ─────────────────────────────────────────────────────── */
              <div className="space-y-2">
                <label
                  htmlFor="ical-url"
                  className="flex items-center gap-2 text-[10px] font-black text-[#9C9384] uppercase tracking-widest"
                >
                  <Calendar size={11} />
                  iCal Feed URL
                  <span className="text-[#722F37] font-black">*</span>
                </label>
                {fetchLoading ? (
                  <SkeletonField />
                ) : (
                  <input
                    id="ical-url"
                    type="text"
                    value={icalUrl}
                    onChange={(e) => setIcalUrl(e.target.value)}
                    placeholder="https://calendar.google.com/calendar/ical/.../public/basic.ics"
                    autoComplete="off"
                    spellCheck={false}
                    className="w-full px-5 py-[15px] bg-[#0F1419]/70 border-2 border-[#5C4A2E]/30 rounded-[18px] text-sm font-semibold text-[#EDE6D6] placeholder-[#5C4A2E]/50 focus:border-[#0B6E4F] focus:ring-2 focus:ring-[#0B6E4F]/20 outline-none transition-all duration-200 font-mono tracking-wider"
                  />
                )}
                <p className="text-[10px] text-[#5C4A2E] font-medium px-1">
                  Get this from Google Calendar → Settings → specific calendar → Integrate calendar → Public address in iCal format.
                </p>
              </div>
            )}

            {/* ── Security note ──────────────────────────────────────────────── */}
            <div className="flex gap-3 p-4 bg-[#C9A227]/8 border border-[#C9A227]/20 rounded-2xl">
              <ShieldCheck size={16} className="text-[#C9A227] flex-shrink-0 mt-px" />
              <div>
                <p className="text-xs font-bold text-[#C9A227]">Stored securely in Supabase</p>
                <p className="text-[10px] text-[#9C9384] leading-relaxed mt-0.5">
                  Your API key is encrypted at rest and never exposed in client-side logs or
                  error responses. Access is restricted to this CEO account via Row Level Security.
                  The key is only used server-side via a Supabase Edge Function.
                </p>
              </div>
            </div>

            {/* ── Last saved timestamp ───────────────────────────────────────── */}
            {lastSaved && !fetchLoading && (
              <p className="text-[10px] text-[#5C4A2E] font-medium text-center animate-in fade-in duration-300">
                Last saved: {new Date(lastSaved).toLocaleString()}
              </p>
            )}

            {/* ── Action buttons ─────────────────────────────────────────────── */}
            <div className="flex flex-col sm:flex-row gap-3 pt-1">

              {/* Reload */}
              <button
                type="button"
                onClick={fetchSettings}
                disabled={fetchLoading || saving}
                title="Reload from database"
                className="w-full sm:w-12 h-12 flex items-center justify-center gap-2 sm:gap-0 rounded-2xl bg-[#0F1419]/60 border-2 border-[#5C4A2E]/30 text-[#9C9384] hover:text-[#EDE6D6] hover:border-[#5C4A2E]/60 active:scale-95 transition-all duration-200 disabled:opacity-40 text-xs font-bold sm:text-base"
              >
                <RefreshCcw size={15} className={fetchLoading ? 'animate-spin' : ''} />
                <span className="sm:hidden">Reload</span>
              </button>

              {/* Test Connection */}
              <button
                id="test-connection-btn"
                type="button"
                onClick={handleTestConnection}
                disabled={fetchLoading || saving || connectionStatus === 'testing' || !calendarId.trim() || (integrationMethod === 'api' && (!serviceAccountEmail.trim() || !privateKey.trim())) || (integrationMethod === 'ical' && !icalUrl.trim())}
                className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-[#C9A227]/15 border-2 border-[#C9A227]/30 text-[#C9A227] text-xs font-black uppercase tracking-[0.15em] hover:bg-[#C9A227]/25 active:scale-[0.98] transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {connectionStatus === 'testing' ? (
                  <><Loader2 size={14} className="animate-spin" /> Testing…</>
                ) : (
                  <><Plug size={14} /> Test Connection</>
                )}
              </button>

              {/* Save */}
              <button
                id="save-settings-btn"
                type="submit"
                disabled={fetchLoading || saving}
                className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-[#0B6E4F] text-[#C9A227] text-xs font-black uppercase tracking-[0.18em] shadow-lg shadow-[#0B6E4F]/20 hover:bg-[#0d8560] active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? (
                  <><Loader2 size={14} className="animate-spin" /> Saving…</>
                ) : (
                  <><Save size={14} /> Save Settings</>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* ── How-to guide card ───────────────────────────────────────────────── */}
        <div className="bg-[#1C232E]/60 rounded-[24px] border border-[#5C4A2E]/20 p-6 space-y-4">
          <h3 className="text-xs font-black text-[#9C9384] uppercase tracking-widest flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-[#5C4A2E]/30 flex items-center justify-center text-[10px]">?</span>
            How to set this up
          </h3>
          <ol className="space-y-3">
            {[
              { step: '1', text: 'Go to console.cloud.google.com and create a project (or select an existing one).' },
              { step: '2', text: 'Enable the Google Calendar API for that project.' },
              { step: '3', text: 'Create a Service Account under IAM & Admin → Service Accounts, and download a JSON key.' },
              { step: '4', text: 'In Google Calendar, open your calendar\'s Settings, scroll to "Share with specific people or groups", and add the Service Account email with "Make changes to events" permissions. Also copy the Calendar ID.' },
              { step: '5', text: 'Paste the Calendar ID, Service Account Email, and Private Key (from the JSON file) above and click Save. Then use Test Connection to verify.' },
            ].map(({ step, text }) => (
              <li key={step} className="flex gap-3 items-start">
                <span className="w-6 h-6 rounded-full bg-[#0B6E4F]/20 border border-[#0B6E4F]/30 text-[#0B6E4F] text-[10px] font-black flex items-center justify-center flex-shrink-0 mt-0.5">
                  {step}
                </span>
                <p className="text-xs text-[#9C9384] leading-relaxed">{text}</p>
              </li>
            ))}
          </ol>
        </div>

        {/* ── Team context pill ────────────────────────────────────────────────── */}
        {teamId && !fetchLoading && (
          <div className="flex items-center justify-center gap-2 pb-4 animate-in fade-in duration-500">
            <div className="flex items-center gap-2 px-4 py-2 bg-[#1C232E]/60 border border-[#5C4A2E]/20 rounded-full">
              <div className="w-2 h-2 rounded-full bg-[#0B6E4F] animate-pulse" />
              <span className="text-[10px] font-bold text-[#9C9384] uppercase tracking-widest">
                Team ID:
              </span>
              <span className="text-[10px] font-mono font-semibold text-[#EDE6D6]/50 truncate max-w-[200px]">
                {teamId}
              </span>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
