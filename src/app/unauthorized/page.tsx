'use client';

export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';

export default function UnauthorizedPage() {
  const { signOut } = useAuth();

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0F1419]">
      <div className="bg-[#1C232E] p-8 rounded-2xl shadow-lg text-center max-w-md border border-[#5C4A2E]/30">
        <div className="text-6xl mb-4">🚫</div>
        <h1 className="text-2xl font-bold text-[#EDE6D6] mb-2">Access Denied</h1>
        <p className="text-[#9C9384] mb-6">
          You don't have permission to access this page. Please contact your administrator if you believe this is an error.
        </p>
        <div className="flex flex-col gap-3">
          <Link
            href="/login"
            className="inline-block px-6 py-2 bg-[#0B6E4F] text-[#C9A227] rounded-lg hover:bg-[#0B6E4F]/80 font-medium border border-[#0B6E4F]/40"
          >
            Back to Login
          </Link>
          <button
            onClick={() => signOut()}
            className="inline-block px-6 py-2 bg-[#2A1518] text-[#EDE6D6] rounded-lg hover:bg-[#2A1518]/80 font-medium transition-all border border-[#5C4A2E]/30"
          >
            Logout
          </button>
        </div>
      </div>
    </div>
  );
}
