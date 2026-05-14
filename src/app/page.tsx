'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (user) {
        const rolePaths: Record<string, string> = {
          'CEO': '/ceo',
          'Manager': '/manager',
          'Cook': '/cook'
        };
        router.push(rolePaths[user.role] || '/login');
      } else {
        router.push('/login');
      }
    }
  }, [user, loading, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-emerald-700 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-zinc-950 font-medium animate-pulse">Redirecting to your workspace...</p>
      </div>
    </div>
  );
}
