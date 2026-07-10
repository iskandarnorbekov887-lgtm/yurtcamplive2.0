'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useRouter } from 'next/navigation';

const IMPERSONATION_KEY = 'impersonation_state';

interface ImpersonatingUser {
  id: string;
  role: 'CEO' | 'Manager' | 'Cook';
  full_name: string;
}

interface ImpersonationContextType {
  impersonating: ImpersonatingUser | null;
  startImpersonating: (user: ImpersonatingUser) => void;
  stopImpersonating: () => void;
}

const ImpersonationContext = createContext<ImpersonationContextType | undefined>(undefined);

export function ImpersonationProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [impersonating, setImpersonating] = useState<ImpersonatingUser | null>(null);

  // Initialize from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(IMPERSONATION_KEY);
    if (stored) {
      try {
        setImpersonating(JSON.parse(stored));
      } catch (e) {
        console.error('Failed to parse impersonation state:', e);
        localStorage.removeItem(IMPERSONATION_KEY);
      }
    }
  }, []);

  const startImpersonating = (user: ImpersonatingUser) => {
    setImpersonating(user);
    localStorage.setItem(IMPERSONATION_KEY, JSON.stringify(user));
    
    // Redirect to the appropriate dashboard based on role
    switch (user.role) {
      case 'Manager':
        router.push('/manager');
        break;
      case 'Cook':
        router.push('/cook');
        break;
      case 'CEO':
        router.push('/ceo');
        break;
    }
  };

  const stopImpersonating = () => {
    setImpersonating(null);
    localStorage.removeItem(IMPERSONATION_KEY);
    router.push('/ceo');
  };

  return (
    <ImpersonationContext.Provider value={{ impersonating, startImpersonating, stopImpersonating }}>
      {children}
    </ImpersonationContext.Provider>
  );
}

export function useImpersonation() {
  const context = useContext(ImpersonationContext);
  if (!context) throw new Error('useImpersonation must be used within ImpersonationProvider');
  return context;
}
