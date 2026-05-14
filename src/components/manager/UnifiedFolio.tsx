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
    <div className="bg-[#FFFFFF] border border-black p-6 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] animate-in fade-in duration-300">
      <div className="flex justify-between items-start mb-6">
        <div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Unified Guest Folio</p>
          <h3 className="text-2xl font-black text-black uppercase tracking-tighter leading-none mt-1">
            {booking.guest_name}
          </h3>
          <div className="flex items-center gap-2 mt-2">
            <span className="font-mono text-[9px] font-black bg-zinc-100 border border-black/10 px-2 py-0.5 uppercase">BID: {booking.id}</span>
            <span className="font-mono text-[9px] font-black bg-zinc-100 border border-black/10 px-2 py-0.5 uppercase">{booking.check_in} → {booking.check_out}</span>
          </div>
        </div>
        
        <div className="text-right">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Fiscal Status</p>
          <span className={`px-4 py-1.5 text-[10px] font-black uppercase border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] ${
            isPrepaid ? 'bg-black text-white' : 'bg-white text-black'
          }`}>
            {isPrepaid ? '[ PREPAID - OFFICE ]' : '[ OPEN - CAMP ]'}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-y border-black py-8 my-6">
        <div className="space-y-6">
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Service Breakdown</p>
            <div className="space-y-3">
              <div className="flex justify-between items-center text-xs">
                <span className="font-black text-black uppercase tracking-tight">Accommodation</span>
                <span className="font-mono font-black text-black">${accommodation.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="font-black text-black uppercase tracking-tight">Catering (Accepted)</span>
                <span className="font-mono font-black text-black">${mealsBill.toFixed(2)}</span>
              </div>
              <div className="pt-2 border-t border-black/5 flex justify-between items-center text-sm font-black">
                <span className="uppercase tracking-tight">Gross Total</span>
                <span className="font-mono">${totalBill.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>
        
        <div className="bg-zinc-50/50 p-6 border border-black flex flex-col justify-between">
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Balance Sheet</p>
            <div className="flex justify-between items-center mb-2">
              <span className="text-[10px] font-black text-slate-500 uppercase">Settled Amount</span>
              <span className="font-mono text-sm font-black text-emerald-600">${collected.toFixed(2)}</span>
            </div>
          </div>
          
          <div className="pt-4 border-t-2 border-black border-dashed">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Current Live Tab</p>
            <p className={`text-4xl font-mono font-black tracking-tighter ${isPrepaid ? 'text-slate-300 italic' : 'text-black'}`}>
              {isPrepaid ? 'PREPAID' : `$${liveTab.toFixed(2)}`}
            </p>
            {!isPrepaid && liveTab > 0 && (
              <p className="text-[9px] font-black text-rose-600 uppercase tracking-widest mt-2 animate-pulse">⚠ Pending Settlement at Camp</p>
            )}
          </div>
        </div>
      </div>
      
      {/* Transaction Log */}
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Audit Trail: Kitchen & Services</p>
          <span className="text-[8px] font-black bg-black text-white px-2 py-0.5 uppercase tracking-tighter">Live Sync</span>
        </div>
        <div className="grid gap-2">
          {(booking.meal_requests || []).length === 0 ? (
            <p className="text-[10px] text-slate-400 italic">No kitchen activity recorded.</p>
          ) : (
            (booking.meal_requests || []).map((m: any, i: number) => (
              <div key={i} className="flex justify-between items-center p-3 bg-white border border-black/10 hover:border-black transition-colors group">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${m.status === 'Served' || m.status === 'served' ? 'bg-black' : 'bg-amber-400'}`} />
                  <span className="text-[10px] font-black text-black uppercase tracking-tight">
                    {m.meal_type} · {m.meal_date} <span className="text-slate-400 ml-2 font-mono">({m.adult_qty}A / {m.child_qty}C)</span>
                  </span>
                </div>
                <span className={`font-mono text-[9px] font-black px-2 py-0.5 border border-black uppercase transition-colors ${
                  ['Served', 'served'].includes(m.status) ? 'bg-black text-white' : 'bg-white text-black group-hover:bg-zinc-50'
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
