'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import type { UserRole } from '@/lib/supabase';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles: UserRole[];
}

export function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { user, loading } = useAuth();
  const [mounted, setMounted] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && !loading) {
      if (!user) {
        console.warn('🛡️ ProtectedRoute: No user found, redirecting to /login');
        router.push('/login');
      } else if (!allowedRoles.includes(user.role)) {
        console.warn(`🛡️ ProtectedRoute: Role ${user.role} not in ${allowedRoles.join(', ')}, redirecting to /unauthorized`);
        router.push('/unauthorized');
      }
    }
  }, [user, loading, mounted, router, JSON.stringify(allowedRoles)]);

  // During SSR/hydration, show a loading state to prevent hydration mismatch
  if (!mounted || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user || !allowedRoles.includes(user.role)) {
    return null;
  }

  return <>{children}</>;
}
