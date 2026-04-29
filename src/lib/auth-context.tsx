'use client';

import { createContext, useContext, useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
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
  
  // CRITICAL: Initialize Supabase client in state to prevent infinite loops!
  // This ensures the client is created exactly once during the component lifecycle.
  const [supabase] = useState(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
    }
    return createBrowserClient(url, key);
  });

  const [user, setUser] = useState<Profile | null>(null);
  const [session, setSession] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [configError] = useState<string | null>(null);
  const lastUserId = useRef<string | null>(null);
  useEffect(() => {
    // Skip auth init on server/SSR - only run in browser
    if (typeof window === 'undefined') {
      setLoading(false);
      return;
    }

    let mounted = true;
    // Track the subscription in a mutable ref so cleanup can always reach it,
    // even if the async `initAuth` hasn't finished when React Strict Mode
    // tears the component down on the first mount.
    let subscription: { unsubscribe: () => void } | null = null;

    // Safety timeout: ensure loading is always resolved within 6 seconds
    const safetyTimeout = setTimeout(() => {
      if (mounted) {
        console.warn('⚠️ Auth init safety timeout triggered');
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

        if (error) {
          console.warn('Profile fetch error, using fallback:', error.message);
          return { id: userId, email: email || '', role: 'Manager' as UserRole, full_name: email || 'User' };
        }
        return profile;
      } catch (err) {
        console.warn('Profile fetch crashed, using fallback:', err);
        return { id: userId, email: email || '', role: 'Manager' as UserRole, full_name: email || 'User' };
      }
    };

    // The ONLY source of truth for initial session is the `INITIAL_SESSION`
    // event fired by `onAuthStateChange`. We do NOT call `getSession()`
    // separately — doing so acquires a second navigator.lock that races
    // with the listener's lock and causes deadlocks in React Strict Mode.
    const { data: { subscription: sub } } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        if (!mounted) return;

        const currentUserId = newSession?.user?.id || null;

        // Throttle updates: only proceed if the user or session actually changed
        if (currentUserId === lastUserId.current && event !== 'SIGNED_OUT') {
          return;
        }
        
        lastUserId.current = currentUserId;
        console.log('🔔 Auth state change:', event, newSession?.user?.email);

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
          console.log('🔍 No initial session found');
          setLoading(false);
          clearTimeout(safetyTimeout);
        }
      }
    );

    // Store subscription immediately (synchronous — no race).
    subscription = sub;

    // Cleanup: React Strict Mode will call this on the first mount's teardown.
    // The subscription MUST be unsubscribed to release the navigator.lock.
    return () => {
      mounted = false;
      clearTimeout(safetyTimeout);
      subscription?.unsubscribe();
    };
  }, [supabase, router]);

  const signIn = async (email: string, password: string) => {
    console.log('Step 1: Starting Sign In for', email);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      
      if (error) {
        console.error('Step 2 Error: Sign In failed', error);
        throw new Error(error.message);
      }
      
      console.log('Step 2: Sign In successful, fetching session...');
      
      if (data.session?.user) {
        setSession(data.session);
        console.log('Step 3: Fetching profile for UID:', data.session.user.id);
        
        try {
          const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', data.session.user.id)
            .single();
          
          if (profileError) {
            console.error('Step 3 Error: Profile fetch failed', profileError);
            setUser({ id: data.session.user.id, email: data.session.user.email, role: 'Manager' } as any);
          } else {
            console.log('Step 4: Profile loaded successfully:', profile.role);
            setUser(profile);
          }
        } catch (profileCatch) {
          console.error('Step 3 Catch: Profile fetch crashed', profileCatch);
          setUser({ id: data.session.user.id, email: data.session.user.email, role: 'Manager' } as any);
        }
      } else {
        console.warn('Step 2 Warning: No session returned');
      }
    } catch (err: any) {
      console.error('Sign In Crash:', err);
      setLoading(false);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    const { data: { user: newUser }, error } = await supabase.auth.signUp({
      email,
      password,
    });
    
    if (error) throw new Error(error.message);
    
    if (newUser) {
      const { error: insertError } = await supabase.from('profiles').insert({
        id: newUser.id,
        email,
        full_name: fullName,
        role: 'Manager',
      });
      
      if (insertError) throw new Error(insertError.message);
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

export function useRoleRedirect() {
  const { user, loading } = useAuth();
  
  if (loading) return { redirecting: true, path: null };
  if (!user) return { redirecting: false, path: '/login' };
  
  const rolePaths: Record<UserRole, string> = {
    'CEO': '/ceo',
    'Manager': '/manager',
    'Cook': '/cook',
    'Reserver': '/bookings',
  };
  
  return { redirecting: false, path: rolePaths[user.role] || '/login' };
}
