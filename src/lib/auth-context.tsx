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

    // Safety timeout: never stay loading longer than 5 seconds
    const timeoutId = setTimeout(() => {
      if (mounted) {
        console.error('⏰ Auth timeout after 5s — forcing loading to false');
        setAuthError('Authentication took too long. Please refresh if the page is blank.');
        setLoading(false);
      }
    }, 5000);

    const handleSession = async (newSession: any) => {
      if (!mounted) return;

      if (newSession?.user) {
        setSession(newSession);
        if (newSession.user.id !== lastUserId.current) {
          lastUserId.current = newSession.user.id;

          try {
            const { data: profile, error: profileErr } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', newSession.user.id)
              .single();

            if (profileErr) {
              console.error('Profile fetch failed:', profileErr.message);
            }

            if (mounted && profile) {
              const userProfile = { ...profile };
              if (userProfile.role === 'Reserver' || !userProfile.role) {
                userProfile.role = 'Manager';
              }
              setUser(userProfile);
            }
          } catch (err: any) {
            console.error('Profile fetch exception:', err?.message || err);
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
    const { data: { user: newUser }, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    if (newUser) {
      await supabase.from('profiles').insert({ id: newUser.id, email, full_name: fullName, role: 'Manager' });
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    lastUserId.current = null;
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
