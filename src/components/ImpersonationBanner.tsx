'use client';

import { useImpersonation } from '@/lib/impersonation-context';

export function ImpersonationBanner() {
  const { impersonating, stopImpersonating } = useImpersonation();

  if (!impersonating) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] bg-gradient-to-r from-[#C9A227] to-[#B8941F] shadow-lg border-b border-[#9C7A1F]">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-[#1C232E] flex items-center justify-center">
            <svg className="w-4 h-4 text-[#C9A227]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-bold text-[#1C232E]">
              Viewing as <span className="underline">{impersonating.full_name}</span> ({impersonating.role})
            </p>
            <p className="text-xs text-[#1C232E]/70">
              CEO impersonation mode active — all actions are logged under your real account
            </p>
          </div>
        </div>
        <button
          onClick={stopImpersonating}
          className="px-4 py-2 bg-[#1C232E] text-[#C9A227] text-xs font-black uppercase tracking-widest rounded-lg hover:bg-[#2A1518] transition-all flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 17l-5-5m0 0l5-5m-5 5h12" />
          </svg>
          Leave & Return to Team Page
        </button>
      </div>
    </div>
  );
}
