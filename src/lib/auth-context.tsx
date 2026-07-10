'use client';

import { createContext, useContext, useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/utils/supabase/client'; 
import type { Profile } from './supabase';

interface AuthContextType {
  user: Profile | null;
  session: any | null;
  loading: boolean;
  authError: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  // supabase is imported directly and handles session persistence automatically
  const [user, setUser] = useState<Profile | null>(null);
  const [session, setSession] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const lastUserId = useRef<string | null>(null);

  useEffect(() => {
    let mounted = true;

    // Safety timeout: never stay loading longer than 15 seconds
    // This prevents accidental redirects to login on slow connections or heavy pages
    const timeoutId = setTimeout(() => {
      if (mounted) {
        console.warn('⏰ Auth took > 15s — checking if session still pending...');
        // If we still have no session but are not yet 'logged out', give it more time
        // but set loading to false to at least render the attempt
        setLoading(false);
      }
    }, 15000);

    const handleSession = async (newSession: any) => {
      if (!mounted) return;

      if (newSession?.user) {
        setSession(newSession);
        if (newSession.user.id !== lastUserId.current) {
          lastUserId.current = newSession.user.id;

          try {
            const { data, error: profileErr } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', newSession.user.id)
              .limit(1);
            
            const profile = Array.isArray(data) ? data[0] : data;

            if (profileErr) {
              console.error('Profile fetch failed:', profileErr.message);
            }

            if (mounted) {
              if (profile) {
                // Check if account is banned
                if (profile.account_status === 'banned') {
                  console.error('Account is banned:', profile.email);
                  await supabase.auth.signOut();
                  setUser(null);
                  setSession(null);
                  lastUserId.current = null;
                  setAuthError('This account has been deactivated. Contact your administrator.');
                  router.push('/login');
                  return;
                }

                const userProfile = { ...profile };
                // Strictly preserve the role from the profiles table — no silent fallback to Manager
                const rawRole = (userProfile.role || '').toString().trim();
                const normalizedRole = rawRole.toLowerCase();
                if (normalizedRole === 'cook') {
                  userProfile.role = 'Cook';
                } else if (normalizedRole === 'ceo') {
                  userProfile.role = 'CEO';
                } else if (normalizedRole === 'manager') {
                  userProfile.role = 'Manager';
                } else {
                  // If DB has an empty / unknown role, keep it as-is (ProtectedRoute will reject)
                  userProfile.role = rawRole || 'UNKNOWN';
                }
                console.log('AuthContext loaded role:', userProfile.role, '| raw from DB:', profile.role);
                setUser(userProfile);
              } else {
                console.warn('AuthContext: User is authenticated but NO profile found in "profiles" table.');
                // DO NOT set to null, which would cause an infinite redirect loop to /login.
                // Instead, provide a partial state with an UNKNOWN role so they go to /unauthorized 
                // or stay logged in instead of looping.
                setUser({
                  id: newSession.user.id,
                  email: newSession.user.email || '',
                  full_name: newSession.user.user_metadata?.full_name || '',
                  role: 'UNKNOWN' as any
                });
              }
            }
          } catch (err: any) {
            console.error('Profile fetch exception:', err?.message || err);
            if (mounted) setUser(null);
          }
        }
      } else {
        setUser(null);
        setSession(null);
        lastUserId.current = null;
      }

      if (mounted) {
        setLoading(false);
        clearTimeout(timeoutId);
      }
    };

    // 1. Get existing session on mount (handles browser refresh)
    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      if (initialSession) {
        handleSession(initialSession);
      }
    });

    // 2. Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event: any, newSession: any) => {
        console.log("Auth Event Triggered:", event); // Check if it fires at all
        if (newSession) {
          console.log("Session detected, checking profile...");
          // If it freezes here, your issue is the database query to public.profiles
        }
        setLoading(false); // Safety release

        if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'USER_UPDATED') {
          handleSession(newSession);
        } else if (event === 'SIGNED_OUT') {
          handleSession(null);
        }
      }
    );

    return () => {
      mounted = false;
      clearTimeout(timeoutId);
      subscription?.unsubscribe();
    };
  }, [supabase]);

  const signIn = async (email: string, password: string) => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      alert(error.message);
      setLoading(false);
    } else {
      router.refresh();
    }
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    const { error } = await supabase.auth.signUp({ 
      email, 
      password,
      options: { data: { full_name: fullName } }
    });
    if (error) throw error;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    lastUserId.current = null;
    localStorage.removeItem('impersonation_state'); // Clear impersonation on logout
    router.push('/login');
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, authError, signIn, signUp, signOut }}>
      {/* Safety: If loading takes too long, we still need to render to avoid permanent black screen */}
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
