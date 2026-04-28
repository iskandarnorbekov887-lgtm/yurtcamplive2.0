'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { supabase, type Profile, type UserRole } from './supabase';

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
  const [user, setUser] = useState<Profile | null>(null);
  const [session, setSession] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);
  useEffect(() => {
    let mounted = true;

    const initAuth = async () => {
      try {
        // 1. Get the initial session
        const { data: { session: initialSession } } = await supabase.auth.getSession();
        
        if (!mounted) return;

        if (initialSession?.user) {
          setSession(initialSession);
          const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', initialSession.user.id)
            .single();
          
          if (mounted && profile) {
            setUser(profile);
          }
        }
      } catch (err) {
        console.error('Auth initialization error:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    initAuth();

    // 2. Set up the listener for future changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event: string, newSession: any) => {
      if (event === 'SIGNED_OUT') {
        setUser(null);
        setSession(null);
        setLoading(false);
        return;
      }

      if (newSession?.user) {
        setSession(newSession);
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', newSession.user.id)
          .single();
        
        if (mounted && profile) setUser(profile);
        if (mounted) setLoading(false);
      } else {
        if (mounted) setLoading(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

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
      setLoading(false); // Make sure we stop loading!
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
