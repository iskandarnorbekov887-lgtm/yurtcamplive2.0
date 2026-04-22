'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { isUsingLocalStorage } from '@/lib/supabase';
import { DEFAULT_CEO } from '@/lib/local-supabase';
import { useLanguage } from '@/lib/language-context';
import { LanguageSwitcher } from '@/components/language-switcher';

export default function LoginPage() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
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
