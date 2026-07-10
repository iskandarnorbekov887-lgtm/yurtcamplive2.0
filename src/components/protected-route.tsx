'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useImpersonation } from '@/lib/impersonation-context';
import type { UserRole } from '@/lib/supabase';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles: UserRole[];
}

export function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { user, loading } = useAuth();
  const { impersonating } = useImpersonation();
  const [mounted, setMounted] = useState(false);
  const [gracePeriod, setGracePeriod] = useState(true);
  const router = useRouter();

  useEffect(() => {
    setMounted(true);
    // Give auth a 1s head start after mounting even if loading says false
    const timer = setTimeout(() => setGracePeriod(false), 1000);
    return () => clearTimeout(timer);
  }, []);

  // 1. Core Logic: Only redirect once we are SURE loading has finished AND grace period is over
  useEffect(() => {
    if (!mounted || loading || gracePeriod) return;

    if (!user) {
      console.warn('🛡️ ProtectedRoute: Session check failed after grace period. Redirecting to /login');
      router.push('/login');
    } else if (user.account_status === 'banned') {
      console.warn('🛡️ ProtectedRoute: Account is banned. Redirecting to /login');
      router.push('/login');
    } else {
      // Check role access - if real role already satisfies, allow regardless of impersonation state
      // Only use impersonated role when user is intentionally viewing as a different role
      const effectiveRole = allowedRoles.includes(user.role) ? user.role : (impersonating?.role || user.role);
      if (!allowedRoles.includes(effectiveRole)) {
        console.warn(`🛡️ ProtectedRoute: Access Denied. Role ${effectiveRole} unauthorized.`);
        router.push('/unauthorized');
      }
    }
  }, [user, loading, mounted, gracePeriod, router, allowedRoles, impersonating]);

  // 2. UI: While loading or unmounted or in grace period, show the HUD
  if (!mounted || loading || (gracePeriod && !user)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-noir-950 text-white font-sans">
        <div className="relative">
          <div className="w-16 h-16 border-4 border-electric-blue/20 border-t-electric-blue rounded-full animate-spin"></div>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-2 h-2 bg-electric-blue rounded-full animate-pulse"></div>
          </div>
        </div>
        <p className="mt-8 text-[10px] font-black uppercase tracking-[0.4em] text-slate-500 animate-pulse">
          Synchronizing Security State...
        </p>
      </div>
    );
  }

  if (!user) {
    return null;
  }
  // Check role access - if real role already satisfies, allow regardless of impersonation state
  // Only use impersonated role when user is intentionally viewing as a different role
  const effectiveRole = allowedRoles.includes(user.role) ? user.role : (impersonating?.role || user.role);
  if (!allowedRoles.includes(effectiveRole)) {
    return null;
  }

  return <>{children}</>;
}
