'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { supabase, isUsingLocalStorage, type Profile, type UserRole } from './supabase';

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
    // Show local storage mode info (this is NOT an error, just info)
    if (isUsingLocalStorage) {
      setConfigError('Using local storage mode. All data is saved to your browser.');
    }

    const fetchUser = async () => {
      try {
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        setSession(currentSession);
        
        if (currentSession?.user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', currentSession.user.id)
            .single();
          
          setUser(profile);
        }
      } catch (err) {
        console.error('Auth error:', err);
        setConfigError('Error connecting to database. Please check your configuration.');
      } finally {
        setLoading(false);
      }
    };

    fetchUser();

    // Add timeout to prevent infinite loading
    const timeout = setTimeout(() => {
      setLoading(false);
    }, 5000);

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event: string, newSession: { user: { id: string } } | null) => {
      setSession(newSession);
      if (newSession?.user) {
        try {
          const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', newSession.user.id)
            .single();
          
          setUser(profile);
        } catch (err) {
          console.error('Profile fetch error:', err);
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
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    
    // Fetch profile after successful login
    if (data.session?.user) {
      setSession(data.session);
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', data.session.user.id)
        .single();
      setUser(profile);
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
    'Observer': '/observer',
  };
  
  return { redirecting: false, path: rolePaths[user.role] || '/login' };
}
