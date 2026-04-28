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

    const fetchUser = async () => {
      try {
        const { data, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) {
          console.error('Session error:', sessionError);
          setConfigError(`Database connection error: ${sessionError.message}`);
          setLoading(false);
          return;
        }

        const currentSession = data?.session;
        setSession(currentSession);
        
        if (currentSession?.user) {
          const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', currentSession.user.id)
            .single();
          
          if (profileError) {
            console.error('Profile fetch error:', profileError);
          } else {
            setUser(profile);
          }
        }
      } catch (err: any) {
        console.error('Auth crash:', err);
        setConfigError(err.message || 'Error connecting to database.');
      } finally {
        setLoading(false);
      }
    };

    fetchUser();

    // Add timeout to prevent infinite loading
    const timeout = setTimeout(() => {
      setLoading(false);
    }, 5000);

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event: string, newSession: any) => {
      setSession(newSession);
      if (newSession?.user) {
        try {
          const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', newSession.user.id)
            .single();
          
          if (profileError) {
            console.error('Auth state profile error:', profileError);
          } else {
            setUser(profile);
          }
        } catch (err) {
          console.error('Auth state change crash:', err);
        }
      } else {
        setUser(null);
      }
    });

    return () => {
      clearTimeout(timeout);
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
        
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', data.session.user.id)
          .single();
        
        if (profileError) {
          console.error('Step 3 Error: Profile fetch failed', profileError);
          // Don't hang the app, just set the user with minimal info if profile fails
          setUser({ id: data.session.user.id, email: data.session.user.email, role: 'Manager' } as any);
        } else {
          console.log('Step 4: Profile loaded successfully:', profile.role);
          setUser(profile);
        }
      } else {
        console.warn('Step 2 Warning: No session returned');
      }
    } catch (err: any) {
      console.error('Sign In Crash:', err);
      throw err;
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
