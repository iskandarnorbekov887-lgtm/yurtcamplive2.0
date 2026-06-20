'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import type { UserRole } from '@/lib/supabase';
import { useLanguage } from '@/lib/language-context';
import { LanguageSwitcher } from '@/components/language-switcher';



export default function LoginPage() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { signIn, signUp, user, loading: authLoading } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();

  useEffect(() => {
    if (user && mounted) {
      const rolePaths: Record<string, string> = {
        'CEO': '/ceo',
        'Manager': '/manager',
        'Cook': '/cook'
      };
      const path = rolePaths[user.role] || '/';
      router.push(path);
    }
  }, [user, mounted, router]);

  // Mark component as mounted on client to avoid SSR/hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  // Show nothing during SSR/hydration to prevent mismatch
  if (!mounted) {
    return <div className="min-h-screen bg-[#0F1419]" />;
  }

  if (user) {
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isSignUp) {
        await signUp(email, password, fullName);
        setError('Account created! Please check your email to confirm.');
      } else {
        await signIn(email, password);
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0F1419] relative">
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#0B6E4F] via-[#0B6E4F]/80 to-[#C9A227]" />
      <div className="absolute top-6 right-6">
        <LanguageSwitcher />
      </div>
      <div className="bg-[#1C232E] p-8 rounded-xl shadow-sm w-full max-w-md border border-[#5C4A2E]/30">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-[#EDE6D6]">{t('login.title')}</h1>
          <p className="text-[#9C9384] mt-2 text-sm font-medium">{t('login.subtitle')}</p>
        </div>

        {error && (
          <div className={`mb-4 p-3 rounded-lg text-sm ${error.includes('created') ? 'bg-[#0B6E4F]/10 text-[#0B6E4F]' : 'bg-[#722F37]/10 text-[#722F37]'}`}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {isSignUp && (
            <div>
              <label className="block text-xs font-bold text-[#9C9384] uppercase tracking-widest mb-1">
                Full Name
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-4 py-2 border border-[#5C4A2E]/30 rounded-lg focus:ring-2 focus:ring-[#0B6E4F] focus:border-transparent text-[#EDE6D6] bg-[#1C232E]"
                required={isSignUp}
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-[#9C9384] uppercase tracking-widest mb-1">
              {t('login.email')}
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2 border border-[#5C4A2E]/30 rounded-lg focus:ring-2 focus:ring-[#0B6E4F] focus:border-transparent text-[#EDE6D6] bg-[#1C232E]"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[#9C9384] uppercase tracking-widest mb-1">
              {t('login.password')}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 border border-[#5C4A2E]/30 rounded-lg focus:ring-2 focus:ring-[#0B6E4F] focus:border-transparent text-[#EDE6D6] bg-[#1C232E]"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#0B6E4F] text-[#C9A227] py-2.5 px-4 rounded-lg hover:bg-[#0B6E4F]/80 disabled:opacity-50 disabled:cursor-not-allowed font-bold uppercase tracking-widest text-xs shadow-sm border border-[#0B6E4F]/40"
          >
            {loading ? 'Loading...' : isSignUp ? t('login.signup') : t('login.signin')}
          </button>
        </form>

        {/* Google Sign In */}
        {!isSignUp && (
          <div className="mt-4">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-[#5C4A2E]/30"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-[#1C232E] text-[#9C9384] text-sm font-medium">Or continue with</span>
              </div>
            </div>
            <button
              onClick={async () => {
                setLoading(true);
                try {
                  const { error } = await supabase.auth.signInWithOAuth({
                    provider: 'google',
                    options: {
                      redirectTo: `${window.location.origin}/auth/callback`,
                      scopes: 'https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events',
                    },
                  });
                  if (error) throw error;
                } catch (err: any) {
                  setError(err.message || 'Google sign in failed');
                  setLoading(false);
                }
              }}
              disabled={loading}
              className="mt-4 w-full flex items-center justify-center gap-3 bg-[#1C232E] border border-[#5C4A2E]/30 text-[#EDE6D6] py-2 px-4 rounded-lg hover:bg-[#2A1518] disabled:opacity-50 font-medium transition-all shadow-sm"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Sign in with Google
            </button>
          </div>
        )}

        <div className="mt-6 text-center">
          <button
            onClick={() => setIsSignUp(!isSignUp)}
            className="text-emerald-700 hover:text-emerald-800 text-sm font-medium"
          >
            {isSignUp ? t('login.has_account') : t('login.no_account')}
          </button>
        </div>
      </div>
    </div>
  );
}
