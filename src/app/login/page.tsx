'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { isUsingLocalStorage } from '@/lib/supabase';
import { DEFAULT_CEO } from '@/lib/local-supabase';
import { useLanguage } from '@/lib/language-context';
import { LanguageSwitcher } from '@/components/language-switcher';

export default function LoginPage() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn, signUp, user, configError } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();

  useEffect(() => {
    if (user) {
      const rolePaths: Record<string, string> = {
        'CEO': '/ceo',
        'Manager': '/manager',
        'Cook': '/cook',
        'Reserver': '/bookings',
      };
      router.push(rolePaths[user.role] || '/login');
    }
  }, [user, router]);

  if (user) {
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isSignUp) {
        await signUp(email, password, fullName, phone);
        setError('Account created! Please wait for CEO approval.');
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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-900 to-purple-900 relative">
      <div className="absolute top-6 right-6">
        <LanguageSwitcher />
      </div>
      <div className="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">{t('login.title')}</h1>
          <p className="text-gray-600 mt-2">{t('login.subtitle')}</p>
        </div>

        {configError && (
          <div className={`mb-4 p-4 rounded-lg ${configError.includes('local storage') ? 'bg-blue-100 border border-blue-300' : 'bg-yellow-100 border-2 border-yellow-400'}`}>
            <p className={`font-bold mb-1 ${configError.includes('local storage') ? 'text-blue-900' : 'text-yellow-900'}`}>
              {configError.includes('local storage') ? 'ℹ️ Offline Mode' : '⚠️ Setup Required'}
            </p>
            <p className={`text-sm ${configError.includes('local storage') ? 'text-blue-800' : 'text-yellow-800'}`}>
              {configError}
            </p>
          </div>
        )}

        {/* Quick CEO Login - One Click Access */}
        {isUsingLocalStorage && !isSignUp && (
          <div className="mb-6 p-4 bg-gradient-to-r from-purple-100 to-blue-100 rounded-xl border border-purple-200">
            <p className="text-sm font-semibold text-purple-900 mb-2">⚡ Quick Access (Testing)</p>
            <p className="text-xs text-purple-700 mb-3">
              Email: {DEFAULT_CEO.email}<br/>
              Password: {DEFAULT_CEO.password}
            </p>
            <button
              onClick={async () => {
                setLoading(true);
                try {
                  await signIn(DEFAULT_CEO.email, DEFAULT_CEO.password);
                } catch (err: any) {
                  setError(err.message);
                } finally {
                  setLoading(false);
                }
              }}
              disabled={loading}
              className="w-full bg-gradient-to-r from-purple-600 to-blue-600 text-white py-3 px-4 rounded-lg hover:from-purple-700 hover:to-blue-700 disabled:opacity-50 font-bold"
            >
              {loading ? 'Logging in...' : '🔑 Login as CEO (Instant Access)'}
            </button>
          </div>
        )}

        {error && !configError && (
          <div className={`mb-4 p-3 rounded-lg text-sm ${error.includes('created') ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {isSignUp && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white"
                  required={isSignUp}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Phone Number
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white"
                  required={isSignUp}
                  placeholder="+998 90 123 45 67"
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('login.email')}
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('login.password')}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            {loading ? 'Loading...' : isSignUp ? t('login.signup') : t('login.signin')}
          </button>
        </form>

        {/* Google Sign In */}
        {!isSignUp && (
          <div className="mt-4">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">Or continue with</span>
              </div>
            </div>
            <button
              onClick={async () => {
                setLoading(true);
                try {
                  const { error } = await supabase.auth.signInWithOAuth({
                    provider: 'google',
                    options: {
                      redirectTo: `${window.location.origin}/ceo`,
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
              className="mt-4 w-full flex items-center justify-center gap-3 bg-white border border-gray-300 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-50 disabled:opacity-50 font-medium transition-all"
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
            className="text-blue-600 hover:text-blue-800 text-sm font-medium"
          >
            {isSignUp ? t('login.has_account') : t('login.no_account')}
          </button>
        </div>

        <div className="mt-6 text-xs text-gray-500 text-center">
          <p>{t('login.manager_default')}</p>
          <p>Contact your CEO to change roles.</p>
        </div>

        {/* Quick Access - Local Testing Only */}
        {isUsingLocalStorage && !isSignUp && (
          <div className="mt-6 pt-6 border-t border-gray-200">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 text-center">Development Quick Access</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => { setEmail('ceo@camp.com'); setPassword('ceo123'); }}
                className="px-3 py-2 bg-indigo-50 text-indigo-700 rounded-xl hover:bg-indigo-100 text-[10px] font-black tracking-tight transition-all border border-indigo-100"
              >
                🔑 CEO ACCESS
              </button>
              <button
                onClick={() => { setEmail('manager@camp.com'); setPassword('manager123'); }}
                className="px-3 py-2 bg-blue-50 text-blue-700 rounded-xl hover:bg-blue-100 text-[10px] font-black tracking-tight transition-all border border-blue-100"
              >
                💼 MANAGER
              </button>
              <button
                onClick={() => { setEmail('cook@camp.com'); setPassword('cook123'); }}
                className="px-3 py-2 bg-orange-50 text-orange-700 rounded-xl hover:bg-orange-100 text-[10px] font-black tracking-tight transition-all border border-orange-100"
              >
                🍳 COOK
              </button>
              <button
                onClick={() => { setEmail('reserver@camp.com'); setPassword('reserver123'); }}
                className="px-3 py-2 bg-green-50 text-green-700 rounded-xl hover:bg-green-100 text-[10px] font-black tracking-tight transition-all border border-green-100"
              >
                📝 RESERVER
              </button>

            </div>
            
            <button
              onClick={() => {
                if (confirm('Clear all local data? This will reset everything including your custom bookings.')) {
                  Object.keys(localStorage).forEach(key => {
                    if (key.startsWith('camp_') || key.startsWith('storage_')) {
                      localStorage.removeItem(key);
                    }
                  });
                  window.location.reload();
                }
              }}
              className="w-full mt-4 px-4 py-2 bg-slate-100 text-slate-500 rounded-xl hover:bg-rose-50 hover:text-rose-600 text-[10px] font-black tracking-widest transition-all border border-slate-200 uppercase"
            >
              🗑️ {t('btn.reset_data')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
