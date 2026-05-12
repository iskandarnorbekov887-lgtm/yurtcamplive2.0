'use client';

import type { ProcurementStatus } from '@/lib/supabase';

// Visual Language mapping from the Expert prompt
const statusConfig: Record<ProcurementStatus, { label: string; icon: string; bg: string; text: string; border: string; pulse?: boolean }> = {
  draft:     { label: 'Pending',     icon: '🟡', bg: 'bg-amber-50',   text: 'text-amber-700',  border: 'border-amber-200' },
  sent:      { label: 'Sent',        icon: '🌀', bg: 'bg-blue-50',    text: 'text-blue-700',   border: 'border-blue-200', pulse: true },
  reviewed:  { label: 'Reviewed',    icon: '🔍', bg: 'bg-indigo-50',  text: 'text-indigo-700', border: 'border-indigo-200' },
  finalized: { label: 'Finalized',   icon: '✅', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
};

interface ProcurementStatusProps {
  status: ProcurementStatus;
  size?: 'sm' | 'md' | 'lg';
}

export function ProcurementStatusBadge({ status, size = 'md' }: ProcurementStatusProps) {
  const config = statusConfig[status] || statusConfig.draft;

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-[9px]',
    md: 'px-3 py-1 text-[10px]',
    lg: 'px-4 py-1.5 text-xs',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-black uppercase tracking-widest border ${config.bg} ${config.text} ${config.border} ${sizeClasses[size]} ${config.pulse ? 'animate-pulse' : ''}`}
    >
      {/* Visual Language: Sent uses Blue Spinner, Pending uses Yellow Icon */}
      <span className={status === 'sent' ? 'animate-spin inline-block' : ''}>
        {status === 'sent' ? '💿' : config.icon}
      </span>
      <span>{config.label}</span>
    </span>
  );
}

/** Progress bar showing the lifecycle stage */
export function ProcurementProgress({ status }: { status: ProcurementStatus }) {
  const stages: ProcurementStatus[] = ['draft', 'sent', 'reviewed', 'finalized'];
  const currentIndex = stages.indexOf(status);

  return (
    <div className="flex items-center gap-1 w-full">
      {stages.map((stage, i) => {
        const config = statusConfig[stage];
        const isActive = i <= currentIndex;
        return (
          <div key={stage} className="flex-1 flex flex-col items-center gap-1">
            <div
              className={`h-1.5 w-full rounded-full transition-all duration-500 ${
                isActive ? 'bg-emerald-400' : 'bg-slate-100'
              }`}
            />
            <span className={`text-[8px] font-bold uppercase tracking-wider ${isActive ? config.text : 'text-slate-300'}`}>
              {config.icon}
            </span>
          </div>
        );
      })}
    </div>
  );
}
