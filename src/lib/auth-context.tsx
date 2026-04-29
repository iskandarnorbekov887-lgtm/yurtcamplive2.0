'use client';

import { createContext, useContext, useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client'; 
import type { Profile } from './supabase';

interface AuthContextType {
  user: Profile | null;
  session: any | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [supabase] = useState(() => createClient()); // Initialize ONCE and hold in state
  const [user, setUser] = useState<Profile | null>(null);
  const [session, setSession] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const lastUserId = useRef<string | null>(null);

  useEffect(() => {
    let mounted = true;

    // Listen for Auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event: any, newSession: any) => {
        if (!mounted) return;

        if (newSession?.user) {
          setSession(newSession);
          if (newSession.user.id !== lastUserId.current) {
            lastUserId.current = newSession.user.id;
            
            // Fetch Profile
            // Fetch Profile
            const { data: profile } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', newSession.user.id)
              .single();
            
            if (mounted && profile) {
              const userProfile = { ...profile };
              // THE FIX: If the DB says Reserver, force it to Manager
              if (userProfile && (userProfile.role as any) === 'Reserver') {
                userProfile.role = 'Manager'; 
              }
              setUser(userProfile);
            }
          }
        } else {
          setUser(null);
          setSession(null);
          lastUserId.current = null;
        }
        
        setLoading(false); // Only set loading false once we have a definitive answer
      }
    );

    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, [supabase]); // ONLY depend on the static supabase client

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
    <AuthContext.Provider value={{ user, session, loading, signIn, signUp, signOut }}>
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
