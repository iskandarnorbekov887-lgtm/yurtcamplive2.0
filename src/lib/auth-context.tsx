'use client';

import { createContext, useContext, useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client'; // Verify this path matches your project
import type { Profile, UserRole } from './supabase';

interface AuthContextType {
  user: Profile | null;
  session: any | null;
  loading: boolean;
  configError: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  
  // Use the singleton client
  const supabase = createClient();

  const [user, setUser] = useState<Profile | null>(null);
  const [session, setSession] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [configError] = useState<string | null>(null);
  const lastUserId = useRef<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') {
      setLoading(false);
      return;
    }

    let mounted = true;
    let subscription: { unsubscribe: () => void } | null = null;

    const safetyTimeout = setTimeout(() => {
      if (mounted) {
        console.warn('⚠️ Auth init safety timeout');
        setLoading(false);
      }
    }, 6000);

    const fetchProfile = async (userId: string, email?: string) => {
      try {
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .single();

        if (error) return { id: userId, email: email || '', role: 'Manager' as UserRole, full_name: email || 'User' };
        return profile;
      } catch (err) {
        return { id: userId, email: email || '', role: 'Manager' as UserRole, full_name: email || 'User' };
      }
    };

    const { data: { subscription: sub } } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        if (!mounted) return;

        const currentUserId = newSession?.user?.id || null;
        if (currentUserId === lastUserId.current && event !== 'SIGNED_OUT') return;
        
        lastUserId.current = currentUserId;

        if (event === 'SIGNED_OUT') {
          setUser(null);
          setSession(null);
          setLoading(false);
          clearTimeout(safetyTimeout);
          return;
        }

        if (newSession?.user) {
          setSession(newSession);
          const profile = await fetchProfile(newSession.user.id, newSession.user.email);
          if (mounted) {
            if (profile) setUser(profile as Profile);
            setLoading(false);
            clearTimeout(safetyTimeout);
          }
        } else if (event === 'INITIAL_SESSION' && !newSession) {
          setLoading(false);
          clearTimeout(safetyTimeout);
        }
      }
    );

    subscription = sub;

    return () => {
      mounted = false;
      clearTimeout(safetyTimeout);
      subscription?.unsubscribe();
    };
  }, [supabase, router]);

  const signIn = async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message);
      if (data.session?.user) {
        setSession(data.session);
        const { data: profile } = await supabase.from('profiles').select('*').eq('id', data.session.user.id).single();
        setUser(profile || { id: data.session.user.id, email: data.session.user.email, role: 'Manager' } as any);
      }
    } catch (err: any) {
      setLoading(false);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    const { data: { user: newUser }, error } = await supabase.auth.signUp({ email, password });
    if (error) throw new Error(error.message);
    if (newUser) {
      await supabase.from('profiles').insert({ id: newUser.id, email, full_name: fullName, role: 'Manager' });
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    lastUserId.current = null;
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, configError, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
