'use client';

import { Booking } from '@/lib/supabase';

interface UnifiedFolioProps {
  booking: Booking;
  pricing?: any;
}

export function UnifiedFolio({ booking, pricing }: UnifiedFolioProps) {
  // 1. Live Tab Calculation
  const accommodation = booking.total_price || 0;
  const collected = booking.collected_amount || 0;
  
  // Sum up all meal requests that are 'Accepted' or 'Served'
  // Use pricing from context if available, fallback to standard rates
  const mealPrice = pricing?.lunch_price || 10;
  
  const mealsBill = (booking.meal_requests || []).reduce((sum, m) => {
    if (['Accepted', 'Served', 'confirmed', 'served'].includes(m.status)) {
       return sum + ((m.adult_qty || 0) + (m.child_qty || 0)) * mealPrice;
    }
    return sum;
  }, 0);

  const totalBill = accommodation + mealsBill;
  const liveTab = totalBill - collected;
  const isPrepaid = booking.payment_status === 'Prepaid';

  return (
    <div className="bg-[#1C232E] border border-[#5C4A2E]/30 p-6 shadow-[4px_4px_0px_0px_rgba(92,74,46,0.3)] animate-in fade-in duration-300">
      <div className="flex justify-between items-start mb-6">
        <div>
          <p className="text-[10px] font-black text-[#9C9384] uppercase tracking-[0.2em]">Unified Guest Folio</p>
          <h3 className="text-2xl font-black text-[#EDE6D6] uppercase tracking-tighter leading-none mt-1">
            {booking.guest_name}
          </h3>
          <div className="flex items-center gap-2 mt-2">
            <span className="font-mono text-[9px] font-black bg-[#0B6E4F]/20 border border-[#0B6E4F]/30 px-2 py-0.5 uppercase text-[#0B6E4F]">BID: {booking.id}</span>
            <span className="font-mono text-[9px] font-black bg-[#5C4A2E]/20 border border-[#5C4A2E]/30 px-2 py-0.5 uppercase text-[#9C9384]">{booking.check_in} → {booking.check_out}</span>
          </div>
        </div>
        
        <div className="text-right">
          <p className="text-[10px] font-black text-[#9C9384] uppercase tracking-widest mb-1">Fiscal Status</p>
          <span className={`px-4 py-1.5 text-[10px] font-black uppercase border-2 border-[#5C4A2E]/30 shadow-[2px_2px_0px_0px_rgba(92,74,46,0.3)] ${
            isPrepaid ? 'bg-[#0B6E4F] text-[#C9A227]' : 'bg-[#1C232E] text-[#EDE6D6]'
          }`}>
            {isPrepaid ? '[ PREPAID - OFFICE ]' : '[ OPEN - CAMP ]'}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-y border-[#5C4A2E]/30 py-8 my-6">
        <div className="space-y-6">
          <div>
            <p className="text-[10px] font-black text-[#9C9384] uppercase tracking-widest mb-2">Service Breakdown</p>
            <div className="space-y-3">
              <div className="flex justify-between items-center text-xs">
                <span className="font-black text-[#EDE6D6] uppercase tracking-tight">Accommodation</span>
                <span className="font-mono font-black text-[#C9A227]">${accommodation.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="font-black text-[#EDE6D6] uppercase tracking-tight">Catering (Accepted)</span>
                <span className="font-mono font-black text-[#C9A227]">${mealsBill.toFixed(2)}</span>
              </div>
              <div className="pt-2 border-t border-[#5C4A2E]/20 flex justify-between items-center text-sm font-black">
                <span className="uppercase tracking-tight text-[#EDE6D6]">Gross Total</span>
                <span className="font-mono text-[#C9A227]">${totalBill.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>
        
        <div className="bg-[#0F1419]/50 p-6 border border-[#5C4A2E]/30 flex flex-col justify-between">
          <div>
            <p className="text-[10px] font-black text-[#9C9384] uppercase tracking-widest mb-4">Balance Sheet</p>
            <div className="flex justify-between items-center mb-2">
              <span className="text-[10px] font-black text-[#9C9384] uppercase">Settled Amount</span>
              <span className="font-mono text-sm font-black text-[#0B6E4F]">${collected.toFixed(2)}</span>
            </div>
          </div>
          
          <div className="pt-4 border-t-2 border-[#5C4A2E]/30 border-dashed">
            <p className="text-[10px] font-black text-[#9C9384] uppercase tracking-widest mb-1">Current Live Tab</p>
            <p className={`text-4xl font-mono font-black tracking-tighter ${isPrepaid ? 'text-[#9C9384] italic' : 'text-[#EDE6D6]'}`}>
              {isPrepaid ? 'PREPAID' : `$${liveTab.toFixed(2)}`}
            </p>
            {!isPrepaid && liveTab > 0 && (
              <p className="text-[9px] font-black text-[#722F37] uppercase tracking-widest mt-2 animate-pulse">⚠ Pending Settlement at Camp</p>
            )}
          </div>
        </div>
      </div>
      
      {/* Transaction Log */}
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <p className="text-[10px] font-black text-[#9C9384] uppercase tracking-widest">Audit Trail: Kitchen & Services</p>
          <span className="text-[8px] font-black bg-[#0B6E4F] text-[#C9A227] px-2 py-0.5 uppercase tracking-tighter">Live Sync</span>
        </div>
        <div className="grid gap-2">
          {(booking.meal_requests || []).length === 0 ? (
            <p className="text-[10px] text-[#9C9384] italic">No kitchen activity recorded.</p>
          ) : (
            (booking.meal_requests || []).map((m: any, i: number) => (
              <div key={i} className="flex justify-between items-center p-3 bg-[#0F1419] border border-[#5C4A2E]/20 hover:border-[#5C4A2E] transition-colors group">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${m.status === 'Served' || m.status === 'served' ? 'bg-[#0B6E4F]' : 'bg-[#C9A227]'}`} />
                  <span className="text-[10px] font-black text-[#EDE6D6] uppercase tracking-tight">
                    {m.meal_type} · {m.meal_date} <span className="text-[#9C9384] ml-2 font-mono">({m.adult_qty}A / {m.child_qty}C)</span>
                  </span>
                </div>
                <span className={`font-mono text-[9px] font-black px-2 py-0.5 border border-[#5C4A2E]/30 uppercase transition-colors ${
                  ['Served', 'served'].includes(m.status) ? 'bg-[#0B6E4F] text-[#C9A227]' : 'bg-[#1C232E] text-[#EDE6D6] group-hover:bg-[#2A1518]'
                }`}>
                  {m.status.toUpperCase()}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
