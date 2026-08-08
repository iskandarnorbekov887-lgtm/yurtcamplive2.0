'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { Key, ShieldCheck, CheckCircle2, AlertTriangle, Loader2, Save, Trash2, Eye, EyeOff } from 'lucide-react';

type SaveStatus = 'idle' | 'loading' | 'success' | 'error';

interface ApiKeySlot {
  keyName: string;
  label: string;
  description: string;
}

const API_KEY_SLOTS: ApiKeySlot[] = [
  {
    keyName: 'google_vision',
    label: 'Google Vision API Key',
    description: 'Used for receipt OCR scanning (primary)',
  },
  {
    keyName: 'ocr_space',
    label: 'OCR.space API Key',
    description: 'Used for receipt OCR scanning (fallback)',
  },
  {
    keyName: 'groq',
    label: 'Groq API Key',
    description: 'Used for AI-powered receipt parsing',
  },
  {
    keyName: 'anthropic',
    label: 'Anthropic API Key',
    description: 'Used for AI-powered features',
  },
];

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
      label: message ?? 'API key saved successfully.',
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

export function ApiKeyVaultSettings() {
  const { user } = useAuth();
  const [teamId, setTeamId] = useState<string | null>(null);
  const [keyStatus, setKeyStatus] = useState<Record<string, boolean>>({});
  const [keyValues, setKeyValues] = useState<Record<string, string>>({});
  const [showKey, setShowKey] = useState<Record<string, boolean>>({});
  
  const [fetchLoading, setFetchLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [saveMessage, setSaveMessage] = useState<string | undefined>(undefined);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const resolveTeamId = useCallback(async (): Promise<string | null> => {
    if (!user?.id) return null;
    
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('team_id, id')
      .eq('id', user.id)
      .single();

    if (error) {
      console.warn('[ApiKeyVaultSettings] Could not read team_id from profile:', error.message);
      return user.id; // graceful fallback: user IS the team
    }

    return profile?.team_id ?? profile?.id ?? user.id;
  }, [user?.id]);

  const fetchKeyStatus = useCallback(async () => {
    if (!teamId) return;

    setFetchLoading(true);
    try {
      const response = await fetch(`/api/team-settings/api-keys?teamId=${teamId}`);
      if (!response.ok) throw new Error('Failed to fetch key status');
      
      const data = await response.json();
      setKeyStatus(data.keys || {});
    } catch (error) {
      console.error('Error fetching API key status:', error);
    } finally {
      setFetchLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    const init = async () => {
      const resolvedTeamId = await resolveTeamId();
      if (resolvedTeamId) {
        setTeamId(resolvedTeamId);
      }
    };
    init();
  }, [resolveTeamId]);

  useEffect(() => {
    if (teamId) {
      fetchKeyStatus();
    }
  }, [teamId, fetchKeyStatus]);

  const handleSaveKey = async (keyName: string) => {
    const value = keyValues[keyName];
    if (!value?.trim() || !teamId) return;

    setSavingKey(keyName);
    setSaveStatus('loading');
    setSaveMessage(undefined);

    try {
      const response = await fetch('/api/team-settings/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamId,
          keyName,
          value: value.trim(),
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save API key');
      }

      setSaveStatus('success');
      setSaveMessage(`${API_KEY_SLOTS.find(k => k.keyName === keyName)?.label} saved successfully.`);
      setKeyValues(prev => ({ ...prev, [keyName]: '' }));
      setShowKey(prev => ({ ...prev, [keyName]: false }));
      
      // Optimistic update: mark key as set immediately
      setKeyStatus(prev => ({ ...prev, [keyName]: true }));
      
      // Refresh key status in background for consistency
      fetchKeyStatus();
    } catch (error) {
      console.error('Error saving API key:', error);
      setSaveStatus('error');
      setSaveMessage(error instanceof Error ? error.message : 'Failed to save API key');
    } finally {
      setSavingKey(null);
      setTimeout(() => {
        setSaveStatus('idle');
        setSaveMessage(undefined);
      }, 4000);
    }
  };

  const handleDeleteKey = async (keyName: string) => {
    if (!teamId) return;

    if (!confirm(`Are you sure you want to remove the ${API_KEY_SLOTS.find(k => k.keyName === keyName)?.label}?`)) {
      return;
    }

    setSavingKey(keyName);
    setSaveStatus('loading');
    setSaveMessage(undefined);

    try {
      const response = await fetch(`/api/team-settings/api-keys?teamId=${teamId}&keyName=${keyName}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete API key');
      }

      setSaveStatus('success');
      setSaveMessage(`${API_KEY_SLOTS.find(k => k.keyName === keyName)?.label} removed successfully.`);
      
      // Optimistic update: mark key as not set immediately
      setKeyStatus(prev => ({ ...prev, [keyName]: false }));
      
      // Refresh key status in background for consistency
      fetchKeyStatus();
    } catch (error) {
      console.error('Error deleting API key:', error);
      setSaveStatus('error');
      setSaveMessage(error instanceof Error ? error.message : 'Failed to delete API key');
    } finally {
      setSavingKey(null);
      setTimeout(() => {
        setSaveStatus('idle');
        setSaveMessage(undefined);
      }, 4000);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-[#C9A227]/20 rounded-xl">
          <Key size={20} className="text-[#C9A227]" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-[#EDE6D6]">API Key Vault</h2>
          <p className="text-xs text-[#9C9384] font-medium uppercase tracking-widest mt-0.5">
            Secure storage for third-party API keys
          </p>
        </div>
      </div>

      {saveStatus !== 'idle' && <StatusBanner status={saveStatus} message={saveMessage} />}

      <div className="bg-[#1C232E] rounded-2xl shadow-xl border border-[#5C4A2E]/30 p-6">
        <div className="flex items-center gap-2 mb-4">
          <ShieldCheck size={16} className="text-[#0B6E4F]" />
          <p className="text-xs text-[#9C9384]">
            Keys are stored securely in Supabase Vault and never returned to the browser.
          </p>
        </div>

        {fetchLoading ? (
          <div className="space-y-4">
            {API_KEY_SLOTS.map((slot) => (
              <div key={slot.keyName} className="space-y-2 animate-pulse">
                <div className="h-3 w-40 bg-[#5C4A2E]/30 rounded-full" />
                <div className="h-[52px] w-full bg-[#0F1419]/60 rounded-[18px] border-2 border-[#5C4A2E]/20" />
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-6">
            {API_KEY_SLOTS.map((slot) => {
              const isSet = keyStatus[slot.keyName];
              const currentValue = keyValues[slot.keyName] || '';
              const isSaving = savingKey === slot.keyName;

              return (
                <div key={slot.keyName} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="block text-sm font-bold text-[#EDE6D6] mb-1">
                        {slot.label}
                      </label>
                      <p className="text-[10px] text-[#9C9384]">{slot.description}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {isSet ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest bg-[#0B6E4F]/20 text-[#0B6E4F] px-2 py-0.5 rounded-full">
                          <CheckCircle2 size={10} />
                          Set
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest bg-[#5C4A2E]/20 text-[#9C9384] px-2 py-0.5 rounded-full">
                          Not set
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <div className="flex-1 relative">
                      <input
                        type={showKey[slot.keyName] ? 'text' : 'password'}
                        value={currentValue}
                        onChange={(e) => setKeyValues(prev => ({ ...prev, [slot.keyName]: e.target.value }))}
                        placeholder={isSet ? 'Enter new value to update' : 'Enter API key'}
                        disabled={isSaving}
                        className="w-full h-[52px] px-5 py-[14px] bg-[#0F1419]/60 border-2 border-[#5C4A2E]/30 rounded-[18px] text-sm font-semibold text-[#EDE6D6] placeholder-[#5C4A2E]/60 focus:border-[#C9A227] focus:ring-2 focus:ring-[#C9A227]/15 outline-none transition-all duration-200 font-mono tracking-wider disabled:opacity-50 disabled:cursor-not-allowed pr-12"
                      />
                      <button
                        type="button"
                        onClick={() => setShowKey(prev => ({ ...prev, [slot.keyName]: !prev[slot.keyName] }))}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9C9384] hover:text-[#EDE6D6] transition-colors"
                      >
                        {showKey[slot.keyName] ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    
                    {currentValue ? (
                      <button
                        type="button"
                        onClick={() => handleSaveKey(slot.keyName)}
                        disabled={isSaving || !currentValue.trim()}
                        className="h-[52px] px-4 bg-[#0B6E4F] text-[#C9A227] rounded-[18px] font-bold uppercase hover:bg-[#0B6E4F]/80 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-xs flex items-center gap-2"
                      >
                        {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                        Save
                      </button>
                    ) : isSet ? (
                      <button
                        type="button"
                        onClick={() => handleDeleteKey(slot.keyName)}
                        disabled={isSaving}
                        className="h-[52px] px-4 bg-[#722F37] text-[#EDE6D6] rounded-[18px] font-bold uppercase hover:bg-[#722F37]/80 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-xs flex items-center gap-2"
                      >
                        {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                        Remove
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
