'use client';
import { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { formatSpace } from '@/utils/calendar-logic';
import { UnifiedFolio } from '@/components/manager/UnifiedFolio';
import * as htmlToImage from 'html-to-image';

interface BookingModalProps {
  selectedItem: any;
  setSelectedItem: (item: any) => void;
  userRole: string;
  currentUserId: string;
  pricing: any;
  setPricing: (p: any) => void;
  loadingAction: string;
  setLoadingAction: (a: string) => void;
  actionMsg: string;
  flash: (m: string) => void;
  onRefresh?: () => void;
  onUpdateBooking?: (id: number, data: any) => Promise<void>;
  onCheckIn?: (id: number) => Promise<void>;
  onCheckOut?: (id: number) => Promise<void>;
  onCancelBooking?: (id: number) => Promise<void>;
  
  // State for the modal logic
  svcAdults: number;
  setSvcAdults: (v: number) => void;
  svcChildren: number;
  setSvcChildren: (v: number) => void;
  svcAmount: number;
  setSvcAmount: (v: number) => void;
  svcDateAdjustment: number;
  setSvcDateAdjustment: (v: number) => void;
  isPrepaid: boolean;
  setIsPrepaid: (v: boolean) => void;
  isLunchPrepaid: boolean;
  setIsLunchPrepaid: (v: boolean) => void;
  isDinnerPrepaid: boolean;
  setIsDinnerPrepaid: (v: boolean) => void;
  svcLunch: boolean;
  setSvcLunch: (v: boolean) => void;
  svcLunchCount: number;
  setSvcLunchCount: (v: number) => void;
  svcDinner: boolean;
  setSvcDinner: (v: boolean) => void;
  svcDinnerCount: number;
  setSvcDinnerCount: (v: number) => void;
  svcGuide: boolean;
  setSvcGuide: (v: boolean) => void;
  svcGuidePrice: number;
  setSvcGuidePrice: (v: number) => void;
  svcGuideNames: string[];
  setSvcGuideNames: (v: string[]) => void;
  svcTransport: boolean;
  setSvcTransport: (v: boolean) => void;
  svcTransList: any[];
  setSvcTransList: (v: any[]) => void;
  svcDiscount: number;
  setSvcDiscount: (v: number) => void;
  svcPayList: any[];
  setSvcPayList: (v: any[]) => void;
  
  // Drink/Extra service states
  showDrinks: boolean;
  setShowDrinks: (v: boolean) => void;
  drinks: any[];
  selectedDrinks: any;
  setSelectedDrinks: (v: any) => void;
  extraServices: any[];
  setExtraServices: (v: any[]) => void;
  newExtraName: string;
  setNewExtraName: (v: string) => void;
  newExtraPrice: string;
  setNewExtraPrice: (v: string) => void;
  
  // UI states
  showServices: boolean;
  setShowServices: (v: boolean) => void;
  showNotes: boolean;
  setShowNotes: (v: boolean) => void;
  showFinalReceipt: boolean;
  setShowFinalReceipt: (v: boolean) => void;
  selectedReceipt: any;
  setSelectedReceipt: (v: any) => void;
  editingDates: boolean;
  setEditingDates: (v: boolean) => void;
  editCheckIn: string;
  setEditCheckIn: (v: string) => void;
  editCheckOut: string;
  setEditCheckOut: (v: string) => void;
  dateAdjAmount: string;
  setDateAdjAmount: (v: string) => void;
  valError: string | null;
  setValError: (v: string | null) => void;
  
  // Helpers
  getSettledReceiptsForSel: () => any[];
  handleCheckIn: () => Promise<void>;
  handleCheckOut: () => Promise<void | boolean>;
  handleCancel: () => Promise<void>;
  finalizeTab?: () => Promise<boolean>;
  handleCreateFromEvent: (doCheckIn: boolean) => Promise<void>;
  fetchCbuRate: (curr: any) => Promise<void>;
  
  // Derived values
  gTotal: number;
  debtRemaining: number;
  tPaidUsd: number;
  isBalanceMatched: boolean;
  today: string;
  gcEvents: any[];
  dayEntries: any[];
  syncWarnings?: any;
  setSyncWarnings?: (v: any) => void;
  activeMeals: any[];
}

export function BookingModal(props: BookingModalProps) {
  const {
    selectedItem, setSelectedItem, userRole, currentUserId, pricing, setPricing,
    loadingAction, setLoadingAction, actionMsg, flash,
    onRefresh, onUpdateBooking, onCheckIn, onCheckOut, onCancelBooking,
    svcAdults, setSvcAdults,
    svcChildren, setSvcChildren,
    svcAmount, setSvcAmount,
    svcDateAdjustment, setSvcDateAdjustment,
    isPrepaid, setIsPrepaid, isLunchPrepaid, setIsLunchPrepaid, isDinnerPrepaid, setIsDinnerPrepaid,
    svcLunch, setSvcLunch, svcLunchCount, setSvcLunchCount, svcDinner, setSvcDinner, svcDinnerCount, setSvcDinnerCount,
    svcGuide, setSvcGuide, svcGuidePrice, setSvcGuidePrice, svcGuideNames, setSvcGuideNames,
    svcTransport, setSvcTransport, svcTransList, setSvcTransList,
    svcDiscount, setSvcDiscount, svcPayList, setSvcPayList,
    showDrinks, setShowDrinks, drinks, selectedDrinks, setSelectedDrinks,
    extraServices, setExtraServices, newExtraName, setNewExtraName, newExtraPrice, setNewExtraPrice,
    showServices, setShowServices, showNotes, setShowNotes, showFinalReceipt, setShowFinalReceipt,
    selectedReceipt, setSelectedReceipt, editingDates, setEditingDates,
    editCheckIn, setEditCheckIn, editCheckOut, setEditCheckOut, dateAdjAmount, setDateAdjAmount,
    valError, setValError, getSettledReceiptsForSel, handleCheckIn, handleCheckOut, handleCancel,
    fetchCbuRate, gTotal, debtRemaining, tPaidUsd, isBalanceMatched, today,
    dayEntries, finalizeTab, activeMeals
  } = props;

  const isStaff = userRole === 'Manager' || userRole === 'CEO';
  const sel = selectedItem?.booking;

  const getBookingTypeInfo = () => {
    if (!sel) return null;
    let category = '';
    try {
      const meta = typeof sel.special_requests === 'string' 
        ? JSON.parse(sel.special_requests || '{}') 
        : (sel.special_requests || {});
      category = meta.guest_category || '';
    } catch {}

    if (category === 'pool') return { prefix: '🏊', message: 'Instant POS: Settled in UZS' };
    if (category === 'local') return { prefix: '🏠', message: 'Instant POS: Settled in UZS' };
    return { prefix: '', message: 'Standard Stay Booking' };
  };

  const typeInfo = getBookingTypeInfo();

  const currentMeta = useMemo(() => {
    if (!sel) return {};
    let meta: any = {};
    try {
      const parsed = typeof sel.special_requests === 'string'
        ? JSON.parse(sel.special_requests || '{}')
        : (sel.special_requests || {});
      meta = Array.isArray(parsed) ? { days: parsed } : (parsed || {});
    } catch (err) {
      console.error('Metadata parse error:', err);
    }
    return meta;
  }, [sel?.special_requests]);

  const guestStatement = useMemo(() => {
    if (!sel) return null;
    
    const accommodation = sel.total_price || 0;
    const mealRequests = sel.meal_requests || [];
    const payments = (sel as any).payments || [];
    const collected = sel.collected_amount || 0;
    
    const mealItems = mealRequests.map((m: any) => {
       const qty = (m.adult_qty || 0) + (m.child_qty || 0);
       const isLunch = m.meal_type.toLowerCase().includes('lunch');
       const pricePer = isLunch ? (pricing?.lunch_price || 10) : (pricing?.dinner_price || 12);
       return {
         name: m.meal_type,
         date: m.meal_date,
         qty,
         price: pricePer,
         total: qty * pricePer,
         status: m.status
       };
    });
    
    const mealsTotal = mealItems.reduce((s: number, i: any) => s + i.total, 0);
    
    // Guide service from booking data
    const guideTotal = sel.has_guide ? (parseFloat(sel.guide_amount || '0') || (pricing?.guide_price || 40)) : 0;
    const guideNames = sel.guide_names || '';
    
    // Transportation from booking data
    const transportTotal = sel.has_transportation ? 
      (sel.transportation_details || '').split('\n').reduce((sum: number, line: string) => {
        const match = line.match(/Price: \$(\d+(?:\.\d+)?)/);
        return sum + (match ? parseFloat(match[1]) || 0 : 0);
      }, 0) : 0;
    
    const grandTotal = accommodation + mealsTotal + guideTotal + transportTotal;
    
    const paymentsTotal = payments.reduce((s: number, p: any) => s + (p.amount_usd_equivalent || 0), 0);
    const totalReconciled = collected + paymentsTotal;
    const remaining = Math.max(0, grandTotal - totalReconciled);
    
    let status = 'OPEN TAB';
    if (remaining < 0.01) status = 'PAID';
    if (isPrepaid) status = 'PREPAID';
    
    return {
      accommodation,
      mealItems,
      mealsTotal,
      guideTotal,
      guideNames,
      transportTotal,
      transportationDetails: sel.transportation_details || '',
      grandTotal,
      totalReconciled,
      remaining,
      status
    };
  }, [sel, pricing, isPrepaid]);

  const isPOS = currentMeta.guest_category === 'local' || currentMeta.guest_category === 'pool';

  const [mealAssurance, setMealAssurance] = useState({ accepted: 0, served: 0 });
  const [showMealRequestModal, setShowMealRequestModal] = useState(false);
  const [currentMealType, setCurrentMealType] = useState<'lunch' | 'dinner' | null>(null);
  const [mealRequestAmount, setMealRequestAmount] = useState(0);
  const [mealRequestDietary, setMealRequestDietary] = useState<'Normal' | 'Vegetarian'>('Normal');
  const [mealRequestNotes, setMealRequestNotes] = useState('');

  // Meal assurance logic (calculated from the prop)
  useEffect(() => {
    const acceptedCount = activeMeals.filter(m => m.status === 'confirmed').length;
    const servedCount = activeMeals.filter(m => m.status === 'served').length;
    setMealAssurance({ accepted: acceptedCount, served: servedCount });
  }, [activeMeals]);


  const handleSaveProgress = async () => {
    if (!sel || !onUpdateBooking) return;
    setLoadingAction('save');
    try {
      const data: any = {
        number_of_adults: svcAdults,
        number_of_children: svcChildren,
        amount: svcAmount,
        stay_price: svcAmount,
        is_prepaid: isPrepaid,
        lunch: svcLunch,
        lunch_count: svcLunchCount,
        lunch_paid: isLunchPrepaid,
        dinner: svcDinner,
        dinner_count: svcDinnerCount,
        dinner_paid: isDinnerPrepaid,
        has_guide: svcGuide,
        has_transportation: svcTransport,
        extra_services: extraServices,
      };

      // If prepaid, add the amount to collected_amount so balance starts at zero
      if (isPrepaid && svcAmount > 0) {
        data.collected_amount = (sel.collected_amount || 0) + svcAmount;
        data.collected_currency = 'USD';
      }

      const dTab = Object.entries(selectedDrinks).map(([id, qty]) => {
        const d = (drinks || []).find(dr => dr.id === Number(id));
        return { 
          drink_id: Number(id), 
          drink_name: d?.name || '', 
          quantity: qty, 
          price: d?.sold_price || 0, 
          currency: d?.currency || 'USD' 
        };
      });
      data.drinks_tab = dTab;

      // Manual Protection Rule: Flag office bookings as manually updated
      if (sel.google_event_id || sel.source === 'System' || sel.source === 'office') {
        data.is_manually_updated = true;
      }

      await onUpdateBooking(sel.id, data);
      
      // Force Supabase schema reload
      try { await supabase.rpc('reload_schema'); } catch { /* ignore if not exist */ }

      flash('✓ Choices saved to guest file!');
    } catch (err) {
      flash('⚠ Failed to save progress.');
    } finally {
      setLoadingAction('');
    }
  };

  const statusColor = (s?: string) => ({
    checked_in: 'bg-[#0B6E4F]/20 text-[#0B6E4F] border border-[#0B6E4F]/40',
    confirmed: 'bg-[#B8860B]/20 text-[#B8860B] border border-[#B8860B]/40',
    completed: 'bg-[#5C4A2E]/20 text-[#5C4A2E] border border-[#5C4A2E]/40',
    cancelled: 'bg-[#722F37]/20 text-[#722F37] border border-[#722F37]/40',
    pending: 'bg-[#1C232E]/20 text-[#9C9384] border border-[#5C4A2E]/30',
    no_arrival: 'bg-[#1C232E]/20 text-[#9C9384] border border-[#5C4A2E]/30',
  }[s ?? ''] ?? 'bg-[#1C232E]/20 text-[#9C9384]');

  const receiptRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    const printContent = receiptRef.current;
    if (!printContent) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    
    printWindow.document.write(`
      <html>
        <head>
          <title>Receipt #${selectedReceipt?.id || 'Pending'}</title>
          <style>
            body { font-family: system-ui, -apple-system, sans-serif; padding: 40px; color: #0f172a; }
            .receipt-header { text-align: center; margin-bottom: 40px; border-bottom: 2px solid #6366f1; padding-bottom: 20px; }
            .row { display: flex; justify-content: space-between; margin-bottom: 12px; font-size: 14px; }
            .total { border-top: 1px solid #e2e8f0; margin-top: 20px; padding-top: 12px; font-weight: 800; font-size: 18px; color: #6366f1; }
            .label { color: #64748b; font-weight: 600; text-transform: uppercase; font-size: 11px; letter-spacing: 0.1em; }
          </style>
        </head>
        <body>
          <div class="receipt-header">
            <h1 style="margin: 0; font-weight: 900; text-transform: uppercase;">Final Receipt</h1>
            <p style="font-size: 12px; color: #64748b; margin-top: 8px;">ID: ${selectedReceipt?.id || 'PENDING'}</p>
          </div>
          <div class="row"><span class="label">Guest</span> <strong>${sel.guest_name}</strong></div>
          <div class="row"><span class="label">Stay</span> <strong>${sel.check_in} — ${sel.check_out}</strong></div>
          <hr style="border: 0; border-top: 1px solid #f1f5f9; margin: 20px 0;">
          <div id="items-content">
            ${printContent.querySelector('.space-y-4')?.innerHTML || ''}
          </div>
          <script>
            window.onload = () => { window.print(); window.close(); };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleSaveAsImage = async () => {
    if (!receiptRef.current) {
      console.error('Receipt ref is null');
      return;
    }
    setLoadingAction('exporting');
    console.log('Starting receipt export with html-to-image...');
    try {
      const dataUrl = await htmlToImage.toPng(receiptRef.current, {
        backgroundColor: '#ffffff',
        quality: 1.0,
        pixelRatio: 2,
        skipFonts: true, // Speeds up generation
      });
      console.log('Image generated successfully');
      const link = document.createElement('a');
      link.download = `receipt-${selectedReceipt?.id || 'pending'}.png`;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      flash('✓ Receipt saved as image!');
    } catch (err) {
      console.error('Export error:', err);
      flash('⚠ Failed to save image. Try the "Print PDF" button instead.');
    } finally {
      setLoadingAction('');
    }
  };

  const statusIcon = (s: string | undefined) => {
    if (s === 'checked_in') return '✓';
    if (s === 'completed') return '✈';
    if (s === 'cancelled') return '✕';
    if (s === 'no_arrival') return '⊘';
    return '';
  };
  const statusIconColor = (s: string | undefined) => {
    if (s === 'completed') return 'text-amber-500';
    return '';
  };

  const daysUntilCheckIn = sel
    ? Math.ceil((new Date(sel.check_in + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime()) / 86400000)
    : 999;
  const daysUntilCheckOut = sel
    ? Math.ceil((new Date(sel.check_out + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime()) / 86400000)
    : 999;

  const isGracePeriodActive = false;
  const guestCategory = currentMeta.guest_category || 'international';
  const isDayGuest = guestCategory === 'pool' || (guestCategory === 'local' && currentMeta.local_stay_type === 'day');
  const isRoomStay = guestCategory === 'international' || guestCategory === 'camper';

  const canCheckIn = sel?.status === 'confirmed' && daysUntilCheckIn <= 2 && !!onCheckIn && !isDayGuest;
  const isComingSoon = sel?.status === 'confirmed' && daysUntilCheckIn > 2 && !isDayGuest;

  const canCheckOut = (sel?.status === 'checked_in' || isGracePeriodActive) && daysUntilCheckOut <= 1 && !!onCheckOut && !isDayGuest;
  const canCancel = sel && ['confirmed', 'pending'].includes(sel.status) && !!onCancelBooking && !isDayGuest;
  const isAfterNoon = new Date().getHours() >= 12;
  const isAfterTwo = new Date().getHours() >= 14;

  const dTotal_calc = Object.entries(selectedDrinks).reduce((sum: number, [id, qty]: [string, any]) => {
    const drink = drinks.find((d: any) => d.id === parseInt(id));
    return sum + (Number(qty) * (drink?.sold_price || 0));
  }, 0);

  if (!selectedItem) return null;

  // Calendar-only event (no booking) — show simplified card
  if (!sel && selectedItem?.event) {
    const ev = selectedItem.event;
    return (
      <div className="fixed inset-0 z-[100] flex items-center sm:items-start justify-center p-0 sm:p-4 sm:pt-16 pb-safe" onClick={() => setSelectedItem(null)}>
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
        <div className="relative bento-card sm:rounded-2xl shadow-2xl w-full sm:max-w-md h-full sm:h-auto sm:max-h-[85vh] overflow-y-auto pb-20 sm:pb-0" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#5C4A2E]/30 sticky top-0 bg-[#1C232E] rounded-t-2xl z-10">
            <p className="text-[10px] font-black uppercase tracking-widest text-[#9C9384]">
              📅 Google Calendar Event
            </p>
            <button onClick={() => setSelectedItem(null)} className="w-8 h-8 flex items-center justify-center edge-control rounded-xl transition-all text-[#EDE6D6] font-bold text-xl">×</button>
          </div>
          <div className="p-5 space-y-4">
            <div>
              <h2 className="text-xl font-black text-[#EDE6D6]">{ev.summary || '(No title)'}</h2>
              <p className="text-sm text-[#9C9384] mt-0.5 font-data">{ev.start} → {ev.end}</p>
              {ev.description && (
                <p className="text-xs text-[#9C9384] mt-2 whitespace-pre-wrap bg-[#1C232E]/50 rounded-xl p-3 border border-[#5C4A2E]/30">{ev.description}</p>
              )}
            </div>
            <div className="bg-[#B8860B]/20 border border-[#B8860B]/40 rounded-xl p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-[#B8860B] mb-2">Calendar Only — No Booking Yet</p>
              <p className="text-xs text-[#B8860B]">Create a booking from this event to manage check-in, services, and payments.</p>
            </div>
            {props.handleCreateFromEvent && (
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => props.handleCreateFromEvent(true)}
                  disabled={loadingAction === 'creating'}
                  className="w-full py-3 bg-emerald-700 hover:bg-emerald-800 text-white text-[11px] font-black uppercase tracking-[0.15em] flex items-center justify-center gap-2 transition-all disabled:opacity-60 border border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[2px] active:translate-y-[2px]"
                >
                  {loadingAction === 'creating' ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : '→'}
                  Create Booking & Check In
                </button>
                <button
                  onClick={() => props.handleCreateFromEvent(false)}
                  disabled={loadingAction === 'creating'}
                  className="w-full py-3 bg-[#1C232E] hover:bg-[#2A1518] text-[#9C9384] text-[11px] font-black uppercase tracking-[0.15em] flex items-center justify-center gap-2 transition-all disabled:opacity-60 border border-[#5C4A2E]/30"
                >
                  Create Booking Only
                </button>
              </div>
            )}
            {actionMsg && (
              <div className="bg-[#1C232E] text-[#EDE6D6] px-4 py-2 rounded-xl text-xs font-bold text-center animate-in fade-in border border-[#5C4A2E]/30">{actionMsg}</div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // No booking and no event — nothing to show
  if (!sel) return null;

  return (
    <>
      <div className="fixed inset-0 z-[100] flex items-center sm:items-start justify-center p-0 sm:p-4 sm:pt-16 pb-safe" onClick={() => setSelectedItem(null)}>
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
        <div className={"relative bento-card sm:rounded-2xl shadow-2xl w-full sm:max-w-md h-full sm:h-auto sm:max-h-[85vh] overflow-y-auto pb-20 sm:pb-0 " + (userRole === 'CEO' && sel?.source === 'System' ? 'border-4 border-blue-500' : '')} onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#5C4A2E]/30 sticky top-0 bg-[#1C232E] rounded-t-2xl z-10">
            <p className="text-[10px] font-black uppercase tracking-widest text-[#0B6E4F]">
              Booking Details
            </p>
            <button onClick={() => setSelectedItem(null)} className="w-8 h-8 flex items-center justify-center edge-control rounded-xl transition-all text-[#EDE6D6] font-bold text-xl">×</button>
          </div>

          <div className="p-5 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                {typeInfo && (
                  <div className="mb-2 px-2 py-0.5 bg-[#1C232E]/20 border border-[#5C4A2E]/30 rounded-lg text-[10px] font-black text-[#9C9384] uppercase tracking-widest flex items-center gap-1.5">
                    <span>{typeInfo.prefix}</span>
                    <span>{typeInfo.message}</span>
                  </div>
                )}
                <h2 className="text-xl font-black text-[#EDE6D6]">{String(sel?.guest_name || "Guest")}</h2>
                <p className="text-sm text-[#9C9384] mt-0.5">{String(sel?.check_in)} → {String(sel?.check_out)}{sel?.nights ? ` · ${String(sel?.nights)}n` : ''}{(sel?.guest_count || sel?.number_of_adults) ? ` · ${String(sel?.guest_count || sel?.number_of_adults)} pax` : ''}</p>
              </div>
              <div className="flex flex-col items-end gap-2">
                {(sel?.notes || sel?.description) && (
                  <button 
                    onClick={() => setShowNotes(!showNotes)}
                    className="text-[10px] font-black text-[#0B6E4F] hover:text-[#0B6E4F] flex items-center gap-1 bg-[#0B6E4F]/10 px-2 py-1 rounded-lg border border-[#0B6E4F]/20 transition-all active:scale-95"
                  >
                    <svg className={`w-3 h-3 transition-transform ${showNotes ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                    {showNotes ? 'Hide Notes' : 'View Notes'}
                  </button>
                )}
                {sel && (
                  <span className={`text-xs font-bold px-3 py-1 rounded-full capitalize ${statusColor(sel.status)} flex items-center gap-1`}>
                    {statusIcon(sel.status) && <span className={statusIconColor(sel.status)}>{statusIcon(sel.status)}</span>}
                    {String(sel.status).replace('_', ' ')}
                  </span>
                )}
              </div>
            </div>

            {showNotes && sel && (sel.notes || sel.description) && (
              <div className="bg-[#B8860B]/20 rounded-[20px] p-4 border border-[#B8860B]/30 shadow-sm animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 bg-[#B8860B]/30 rounded-lg flex items-center justify-center text-[#B8860B]">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  </div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-[#B8860B]">Booking & Stay Notes</p>
                </div>
                <p className="text-sm text-[#EDE6D6] whitespace-pre-wrap leading-relaxed font-medium">{String(sel.notes || sel.description)}</p>
              </div>
            )}

              {(sel.status === 'no_arrival' || sel.status === 'cancelled') && (
                <div className={`px-4 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 select-none cursor-not-allowed ${statusColor(sel.status)}`}>
                  <span className={statusIconColor(sel.status)}>{statusIcon(sel.status)}</span>
                  <span className="capitalize">{String(sel.status).replace('_', ' ')}</span>
                  {sel.status === 'no_arrival' && <span className="text-[10px] font-medium opacity-70">· permanent</span>}
                </div>
              )}



              {sel.status === 'completed' && !isGracePeriodActive && (() => {
                const isPOS = currentMeta.guest_category === 'local' || currentMeta.guest_category === 'pool';
                
                if (isPOS) {
                  return (
                    <div className="bg-[#1C232E] border-2 border-[#5C4A2E]/30 rounded-[32px] p-6 shadow-xl shadow-[#5C4A2E]/20 space-y-4">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-12 h-12 bg-[#0B6E4F]/30 rounded-2xl flex items-center justify-center text-[#0B6E4F] shadow-md shadow-[#0B6E4F]/20">
                          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        </div>
                        <div>
                          <h3 className="text-lg font-black text-[#EDE6D6] uppercase tracking-tight leading-tight">Transaction Receipt</h3>
                          <p className="text-[10px] font-bold text-[#9C9384] uppercase tracking-widest">Instant Point of Sale Settlement</p>
                        </div>
                      </div>
                      
                      <div className="bg-[#1C232E]/50 border border-[#5C4A2E]/30 rounded-2xl p-4 flex flex-col items-center justify-center gap-1 shadow-inner">
                        <p className="text-[10px] font-black text-[#9C9384] uppercase tracking-widest">Amount Taken</p>
                        <p className="text-3xl font-black text-[#EDE6D6] flex items-baseline gap-1 font-mono">
                          {(sel.collected_amount || sel.total_price || 0).toLocaleString()} 
                          <span className="text-lg text-[#9C9384] font-bold font-mono">{sel.collected_currency || 'UZS'}</span>
                        </p>
                      </div>
                      
                      <div className="flex items-center justify-between px-2 text-sm font-bold text-[#9C9384] border-b border-[#5C4A2E]/30 pb-2">
                        <span className="uppercase tracking-widest text-[10px] text-[#9C9384]">Guest Count:</span>
                        <span className="text-[#EDE6D6] text-base">{sel.number_of_adults || sel.guest_count || 0} pax</span>
                      </div>
                      
                      <button className="w-full py-4 bg-[#1C232E]/50 text-[#9C9384] font-black uppercase tracking-[0.2em] text-[11px] rounded-2xl cursor-not-allowed border border-[#5C4A2E]/30">
                        Closed Tab - Receipt Logged
                      </button>
                    </div>
                  );
                }

                return (
                  <div className="bg-[#1C232E] border-2 border-[#5C4A2E]/30 rounded-[32px] p-6 shadow-xl shadow-[#5C4A2E]/20 space-y-4">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-12 h-12 bg-[#0B6E4F]/30 rounded-2xl flex items-center justify-center text-[#0B6E4F] shadow-md shadow-[#0B6E4F]/20">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                      </div>
                      <div>
                        <h3 className="text-lg font-black text-[#EDE6D6] uppercase tracking-tight leading-tight">Successfully Checked Out</h3>
                        <p className="text-[10px] font-bold text-[#9C9384] uppercase tracking-widest">Guest Tab Closed & Settled</p>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {isStaff && sel.status !== 'no_arrival' && sel.status !== 'cancelled' && (sel.status !== 'completed' || isGracePeriodActive) && (
                <div className="flex flex-wrap gap-2">
                  {sel.status === 'checked_in' && !editingDates && (
                    <div className="w-full">
                      <div className="flex items-center justify-between">
                        <div className="flex flex-col gap-1.5">
                          <span className="px-4 py-2 bg-[#0B6E4F]/20 text-[#0B6E4F] text-sm font-bold rounded-xl border border-[#0B6E4F]/40 flex items-center gap-2">
                            ✓ Checked In
                          </span>
                        </div>
                        <button
                          onClick={() => { 
                            setEditingDates(true); 
                            setEditCheckIn(sel.check_in); 
                            setEditCheckOut(sel.check_out); 
                            setDateAdjAmount(currentMeta.last_adjustment || '');
                          }}
                          className="text-[10px] font-bold text-[#0B6E4F] hover:text-[#0B6E4F] underline underline-offset-2 decoration-[#0B6E4F]/20 transition-all">
                          Edit Dates
                        </button>
                      </div>
                    </div>
                  )}
                  {editingDates && (
                    <div className="w-full bg-[#1C232E] border border-[#5C4A2E]/30 p-4 space-y-4 shadow-[4px_4px_0px_0px_rgba(92,74,46,0.3)]">
                      <div className="flex items-center justify-between border-b border-[#5C4A2E]/30 pb-2">
                        <p className="text-[10px] font-black text-[#EDE6D6] uppercase tracking-[0.2em]">Bento Stay Editor</p>
                        {(sel.collected_amount || 0) > 0 && (
                          <span className="text-[9px] font-black bg-[#0B6E4F]/20 text-[#0B6E4F] px-2 py-0.5 border border-[#0B6E4F]/40 uppercase">Financial Locked</span>
                        )}
                      </div>
                       
                      <div className="grid grid-cols-2 border border-[#5C4A2E]/30">
                        <div className="p-3 border-r border-[#5C4A2E]/30 bg-[#1C232E]/50">
                          <label className="text-[9px] font-black text-[#EDE6D6] uppercase tracking-widest mb-1 block">Inbound</label>
                          <div className="hc-mono text-sm font-black text-[#9C9384] opacity-60">{String(editCheckIn)}</div>
                        </div>
                        <div className="p-3 bg-[#1C232E]">
                          <label className="text-[9px] font-black text-[#0B6E4F] uppercase tracking-widest mb-1 block">Outbound</label>
                          <input
                            type="date"
                            value={String(editCheckOut)}
                            onChange={e => {
                              const v = e.target.value;
                              setEditCheckOut(v);
                              if (v === sel.check_out) setDateAdjAmount('');
                            }}
                            className="w-full bg-[#1C232E] text-sm font-black text-[#EDE6D6] hc-mono focus:outline-none focus:ring-1 focus:ring-[#0B6E4F]"
                          />
                        </div>
                      </div>

                      <div className="flex gap-2 pt-2">
                        <button
                          onClick={async () => {
                            if (!confirm(`Update check-out date to ${editCheckOut}?`)) return;
                            setLoadingAction('editdates');
                            try {
                              const settledReceipts = getSettledReceiptsForSel ? getSettledReceiptsForSel() : [];
                              const isTab1Closed = settledReceipts.length > 0 || (sel.collected_amount || 0) > 0;
                              
                              let currentMeta: any = {};
                              try {
                                const parsed = typeof sel.special_requests === 'string'
                                  ? JSON.parse(sel.special_requests || '{}')
                                  : (sel.special_requests || {});
                                currentMeta = Array.isArray(parsed) ? { days: parsed } : (parsed || {});
                              } catch {
                                currentMeta = {};
                              }

                              const updates: any = { 
                                check_in: editCheckIn,
                                check_out: editCheckOut,
                                is_manually_updated: true,
                                total_price: isTab1Closed ? ((sel.total_price || 0) + svcDateAdjustment) : (svcAmount + svcDateAdjustment)
                              };

                              // collected_amount will be updated in finalizeTab when the refund is physically given/settled

                              // Save metadata change history natively
                              updates.special_requests = JSON.stringify({ 
                                ...currentMeta, 
                                is_manual_dates: true, 
                                days: dayEntries,
                                last_adjustment: svcDateAdjustment
                              });

                              if (onUpdateBooking) await onUpdateBooking(sel.id, updates);

                              // Sync straight to Google Calendar
                              if (sel.google_event_id) {
                                try {
                                  await fetch('/api/calendar/update-event', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                      eventId: sel.google_event_id,
                                      start: updates.check_in,
                                      end: updates.check_out,
                                      summary: sel.guest_name
                                    })
                                  });
                                } catch (err) {
                                  console.warn('Google Calendar sync bypassed.');
                                }
                              }

                              setEditingDates(false);
                              if (onRefresh) onRefresh();
                              flash('✓ Stay dates and adjustment updated.');
                            } catch (e: any) {
                              flash(`⚠ Error executing adjustment: ${e.message}`);
                            } finally {
                              setLoadingAction('');
                            }
                          }}
                          disabled={loadingAction === 'editdates' || !editCheckOut}
                          className="flex-1 py-3 bg-[#047857] hover:bg-[#035e44] text-white text-xs font-black uppercase tracking-[0.2em] rounded-none transition-all disabled:opacity-60 flex items-center justify-center gap-2 border border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[2px] active:translate-y-[2px]">
                          {loadingAction === 'editdates' ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : '✓'}
                          Save & Sync Dates
                        </button>
                        <button
                          onClick={() => setEditingDates(false)}
                          className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-sm font-bold rounded-lg transition-all">
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                  {canCheckIn && (
                    <button onClick={handleCheckIn} disabled={loadingAction === 'checkin'}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl transition-all disabled:opacity-60 flex items-center gap-2">
                      {loadingAction === 'checkin' ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : '→'}
                      Check In
                    </button>
                  )}
                  {canCheckOut && (() => {
                    return (
                      <div className="flex flex-col gap-2">
                        <button
                          onClick={async () => {
                            if (guestStatement?.status === 'OPEN TAB') {
                              flash(`⚠ Guest has an open balance of $${guestStatement.remaining.toFixed(2)}. Settle tab first.`);
                              return;
                            }

                            const receipts = getSettledReceiptsForSel();
                            const hasSettled = receipts.length > 0 || (sel.collected_amount || 0) > 0;
                            const guestNum = (sel.number_of_adults || 0) + (sel.number_of_children || 0) || sel.guest_count || 0;
                            const price = sel.total_price || 0;
                            const isPrepaidVal = isPrepaid || sel.is_prepaid || false;

                            if (guestNum <= 0) {
                              flash(`⚠ Please enter the Number of Guests before checking out.`);
                              return;
                            }
                            
                            if (!confirm(`Complete stay for ${sel.guest_name}?`)) return;
                            setLoadingAction('checkout_manual');
                            try { 
                              if (finalizeTab && gTotal >= 0) {
                                 const success = await finalizeTab();
                                 if (success === false) {
                                   setLoadingAction('');
                                   return; 
                                 }
                              }
                              if (onCheckOut) await onCheckOut(sel.id); 
                              flash('✓ Guest checked out successfully!'); 
                              setSelectedItem(null); 
                            }
                            catch { flash('⚠ Check-out failed.'); }
                            finally { setLoadingAction(''); }
                          }}
                          disabled={loadingAction === 'checkout_manual' || guestStatement?.status === 'OPEN TAB'}
                          className={`px-4 py-3 text-sm font-bold rounded-xl transition-all disabled:opacity-60 flex items-center justify-center gap-2 ${
                            (guestStatement?.status === 'OPEN TAB' || ((sel.number_of_adults || 0) + (sel.number_of_children || 0) || sel.guest_count || 0) <= 0)
                              ? 'bg-rose-100 border-2 border-rose-300 text-rose-700'
                              : 'bg-black hover:bg-zinc-950 text-white shadow-lg shadow-zinc-200 border-2 border-black'
                          }`}
                        >
                          {loadingAction === 'checkout_manual' ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : '✈'}
                          {guestStatement?.status === 'OPEN TAB' ? `Pay $${guestStatement.remaining.toFixed(2)} to Settle` : 'Finalize Stay'}
                        </button>
                      </div>
                    );
                  })()}
                  {isComingSoon && (
                    <div className="px-4 py-2 bg-sky-50 border border-sky-200 rounded-xl text-sm font-bold text-sky-700">
                      ⏰ Coming in {String(daysUntilCheckIn)} day{daysUntilCheckIn !== 1 ? 's' : ''}
                    </div>
                  )}
                  {canCancel && !editingDates && (
                    <button onClick={handleCancel} disabled={loadingAction === 'cancel'}
                      className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-700 text-sm font-bold rounded-xl border border-red-200 transition-all disabled:opacity-60">Cancel Booking</button>
                  )}

                  {sel.status === 'confirmed' && sel.check_in < today && onUpdateBooking && !editingDates && (
                    <button onClick={async () => { if (!confirm(`Mark ${sel.guest_name} as No Arrival? This is PERMANENT and cannot be undone.`)) return; setLoadingAction('na'); try { await onUpdateBooking(sel.id, { status: 'no_arrival' }); flash('Marked as No Arrival.'); } catch { flash('⚠ Failed.'); } finally { setLoadingAction(''); } }} disabled={loadingAction === 'na'}
                      className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 text-sm font-bold rounded-xl border border-gray-300 transition-all disabled:opacity-60">⊘ No Arrival</button>
                  )}
                </div>
              )}


              {(sel.status === 'checked_in' || sel.status === 'confirmed') && isStaff && (
                <div className="bg-[#1C232E] border-2 border-[#5C4A2E]/30 rounded-[32px] p-6 shadow-xl shadow-[#5C4A2E]/20 mb-6">
                  <div className="flex justify-between items-center mb-6">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-[#0B6E4F] rounded-2xl flex items-center justify-center text-[#C9A227] shadow-lg shadow-[#0B6E4F]/20">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                      </div>
                      <div>
                        <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight leading-tight">Add to Tab</h3>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Post new charges for this guest</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => setShowServices(!showServices)} 
                      className={`text-[10px] font-black px-5 py-2.5 rounded-xl border-2 transition-all active:scale-95 ${showServices ? 'bg-[#1C232E]/50 text-[#9C9384] border-[#5C4A2E]/30 hover:bg-[#2A1518]' : 'bg-[#0B6E4F] text-[#C9A227] border-[#0B6E4F]/40 shadow-lg shadow-[#0B6E4F]/20 hover:bg-[#0B6E4F]/80'}`}
                    >
                      {showServices ? 'HIDE OPTIONS' : 'START NEW ORDER'}
                    </button>
                  </div>
                  
                  {!showServices && (
                    <div 
                      className="group relative flex items-center justify-center py-10 border-2 border-dashed border-[#5C4A2E]/30 rounded-[24px] bg-[#1C232E]/50 cursor-pointer hover:bg-[#2A1518] hover:border-[#0B6E4F]/40 transition-all duration-300 overflow-hidden" 
                      onClick={() => setShowServices(true)}
                    >
                      <div className="absolute inset-0 bg-gradient-to-br from-[#0B6E4F]/0 to-[#0B6E4F]/50 opacity-0 group-hover:opacity-100 transition-opacity" />
                      <div className="relative flex flex-col items-center">
                        <div className="w-10 h-10 bg-[#1C232E] rounded-full flex items-center justify-center shadow-md mb-3 group-hover:scale-110 transition-transform border border-[#5C4A2E]/30">
                          <span className="text-[#0B6E4F] text-3xl font-light">+</span>
                        </div>
                        <p className="text-[11px] font-black text-[#9C9384] uppercase tracking-[0.2em] group-hover:text-[#0B6E4F] transition-colors">Select Meals or Services</p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {showServices && (sel.status === 'checked_in' || sel.status === 'confirmed') && isStaff && (
                <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300 mt-4">
                  {isRoomStay && sel?.guest_category !== 'pool' && (() => {
                    const isTab1Closed = getSettledReceiptsForSel().length > 0 || (sel.collected_amount || 0) > 0;
                    const isDatesChanged = editCheckOut !== sel.check_out;
                    const isExtended = editCheckOut > sel.check_out;
                    const isShortened = editCheckOut < sel.check_out;

                    return (
                      <div className="border border-[#5C4A2E]/30 p-4 bg-[#1C232E] shadow-[2px_2px_0px_0px_rgba(92,74,46,0.3)] space-y-4">
                        <div className="flex justify-between items-center">
                          <p className="text-[10px] font-black uppercase tracking-widest text-[#9C9384]">Stay Configuration</p>
                          {isPrepaid && (
                            <span className="px-2 py-0.5 text-[8px] font-black bg-emerald-100 text-emerald-700 rounded uppercase border border-emerald-300">
                              ✓ Original Stay Prepaid
                            </span>
                          )}
                        </div>

                        {/* Entrants Grid */}
                        <div className="grid grid-cols-2 gap-4 pb-4 border-b border-slate-100">
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Adults *</label>
                            <input 
                              type="number" 
                              value={svcAdults ?? ''} 
                              disabled={isTab1Closed}
                              onChange={e => {
                                const val = parseInt(e.target.value) || 0;
                                setSvcAdults(val);
                                if (onUpdateBooking) onUpdateBooking(sel.id, { number_of_adults: val });
                              }}
                              className={`w-full px-3 py-2 border text-sm font-black focus:outline-none ${isTab1Closed ? 'bg-[#1C232E]/50 border-[#5C4A2E]/30 text-[#9C9384] cursor-not-allowed' : 'bg-[#1C232E]/50 border-[#5C4A2E]/30 text-[#EDE6D6]'}`}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Children</label>
                            <input 
                              type="number" 
                              value={svcChildren ?? ''} 
                              disabled={isTab1Closed}
                              onChange={e => {
                                const val = parseInt(e.target.value) || 0;
                                setSvcChildren(val);
                                if (onUpdateBooking) onUpdateBooking(sel.id, { number_of_children: val });
                              }}
                              className={`w-full px-3 py-2 border text-sm font-black focus:outline-none ${isTab1Closed ? 'bg-[#1C232E]/50 border-[#5C4A2E]/30 text-[#9C9384] cursor-not-allowed' : 'bg-[#1C232E]/50 border-[#5C4A2E]/30 text-[#EDE6D6]'}`}
                            />
                          </div>
                        </div>

                        {isTab1Closed ? (
                          <div className="space-y-4">
                            {/* Condition A: Tab 1 Closed (Locked Mode) */}
                            <div className="space-y-1.5">
                              <label className="text-[10px] font-black uppercase tracking-widest text-[#9C9384]">Original Stay Price (Baseline)</label>
                              <div className="px-3 py-2 bg-[#1C232E]/50 border border-[#5C4A2E]/30 text-sm font-mono text-[#9C9384] font-bold">
                                ${String((sel.stay_price || sel.total_price || 0).toFixed(2))}
                              </div>
                            </div>

                            {isExtended && (
                              <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                                <label className="text-[10px] font-black uppercase tracking-widest text-indigo-600">Extension Fee (USD)</label>
                                <div className="relative mt-1.5">
                                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-indigo-400 font-mono text-xs">+$</span>
                                  <input 
                                    type="number" 
                                    value={svcDateAdjustment > 0 ? svcDateAdjustment : ''} 
                                    onChange={e => setSvcDateAdjustment(Math.abs(parseFloat(e.target.value) || 0))}
                                    placeholder="0.00"
                                    className="w-full pl-8 pr-3 py-2 bg-[#0B6E4F]/10 border border-[#0B6E4F]/30 text-sm font-black font-mono focus:outline-none"
                                  />
                                </div>
                              </div>
                            )}

                          </div>
                        ) : (
                          /* Condition B: No Tab Closed (Fresh Mode) */
                          <div className="space-y-4">
                            <div className="space-y-1.5">
                              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Original Stay Price (USD)</label>
                              <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-mono text-xs">$</span>
                                <input 
                                  type="number" 
                                  value={String(svcAmount || '')} 
                                  onChange={e => {
                                    const val = parseFloat(e.target.value) || 0;
                                    setSvcAmount(val);
                                    setSvcDateAdjustment(0);
                                    if (onUpdateBooking) onUpdateBooking(sel.id, { total_price: val, stay_price: val, amount: val });
                                  }}
                                  className="w-full pl-7 pr-3 py-2 bg-[#1C232E]/50 border border-[#5C4A2E]/30 text-sm font-black text-[#EDE6D6] font-mono focus:outline-none"
                                  placeholder="0.00"
                                />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {isRoomStay && (
                    <div className="border border-[#5C4A2E]/30 rounded-xl p-4 space-y-4 bg-[#1C232E] shadow-lg">
                      <div className="flex justify-between items-end mb-3">
                        <div className="space-y-1">
                          <p className="text-[10px] font-black uppercase tracking-widest text-[#9C9384]">Kitchen Orders</p>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-3">
                        {/* Lunch Request Button */}
                        <div className="space-y-2">
                          {(() => {
                            const lunchOrders = activeMeals.filter(o => o.type === 'lunch');
                            const totalLunchQty = lunchOrders.reduce((sum, o) => sum + (o.quantity || 0), 0);
                            const isPending = lunchOrders.some(o => o.status === 'pending');
                            const hasAcceptedLunch = lunchOrders.some(o => o.status === 'confirmed');
                            return (
                              <button type="button" 
                                onClick={() => { 
                                  setCurrentMealType('lunch'); 
                                  setMealRequestAmount(0); // Default to 0 for adding extra portions
                                  setShowMealRequestModal(true); 
                                }}
                                className={`w-full py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all flex flex-col items-center justify-center gap-1 border-2 ${
                                  hasAcceptedLunch ? 'bg-[#0B6E4F] border-[#0B6E4F]/80 text-[#C9A227] shadow-md active:scale-95' : 
                                  isPending ? 'bg-[#C9A227] border-[#C9A227]/80 text-[#1C232E] shadow-md active:scale-95' : 
                                  'bg-[#1C232E] border-[#5C4A2E]/30 text-[#9C9384] hover:border-[#0B6E4F] hover:text-[#0B6E4F] shadow-md active:scale-95'
                                }`}>
                                {isPending ? <span className="opacity-80">⏳ Sent — + Add More</span> :
                                 hasAcceptedLunch ? <span className="opacity-80">✓ Accepted — + Add More</span> :
                                 <span className="opacity-80">Request Lunch</span>}
                                {totalLunchQty > 0 && <span className="text-sm font-black">x {totalLunchQty} Total</span>}
                              </button>
                            );
                          })()}
                        </div>

                        {/* Dinner Request Button */}
                        <div className="space-y-2">
                          {(() => {
                            const dinnerOrders = activeMeals.filter(o => o.type === 'dinner');
                            const totalDinnerQty = dinnerOrders.reduce((sum, o) => sum + (o.quantity || 0), 0);
                            const isPending = dinnerOrders.some(o => o.status === 'pending');
                            const hasAcceptedDinner = dinnerOrders.some(o => o.status === 'confirmed');
                            return (
                              <button type="button" 
                                onClick={() => { 
                                  setCurrentMealType('dinner'); 
                                  setMealRequestAmount(0); // Default to 0 for adding extra portions
                                  setShowMealRequestModal(true); 
                                }}
                                className={`w-full py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all flex flex-col items-center justify-center gap-1 border-2 ${
                                  hasAcceptedDinner ? 'bg-[#0B6E4F] border-[#0B6E4F]/80 text-[#C9A227] shadow-md active:scale-95' : 
                                  isPending ? 'bg-[#C9A227] border-[#C9A227]/80 text-[#1C232E] shadow-md active:scale-95' : 
                                  'bg-[#1C232E] border-[#5C4A2E]/30 text-[#9C9384] hover:border-[#0B6E4F] hover:text-[#0B6E4F] shadow-md active:scale-95'
                                }`}>
                                {isPending ? <span className="opacity-80">⏳ Sent — + Add More</span> :
                                 hasAcceptedDinner ? <span className="opacity-80">✓ Accepted — + Add More</span> :
                                 <span className="opacity-80">Request Dinner</span>}
                                {totalDinnerQty > 0 && <span className="text-sm font-black">x {totalDinnerQty} Total</span>}
                              </button>
                            );
                          })()}
                        </div>
                      </div>

                      {/* Info Text */}
                      <p className="text-[9px] font-bold text-slate-400 text-center italic">
                        * Items appear in the Tab only after Kitchen Acceptance.
                      </p>
                    </div>
                  )}

                  {/* Meal Request Modal */}
                  {showMealRequestModal && (
                    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowMealRequestModal(false)}>
                      <div className="bg-[#1C232E] rounded-[32px] w-full max-w-sm p-8 shadow-2xl animate-in zoom-in-95 duration-200 border border-[#5C4A2E]/30" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-6">
                          <h3 className="text-xl font-black text-[#EDE6D6] uppercase tracking-tight">Request {currentMealType}</h3>
                          <button onClick={() => setShowMealRequestModal(false)} className="text-2xl font-bold text-[#9C9384] hover:text-[#EDE6D6] transition-colors">×</button>
                        </div>
                        
                        <div className="space-y-6">
                          <div className="flex items-center justify-center gap-6">
                            <button type="button" onClick={() => setMealRequestAmount(Math.max(0, mealRequestAmount - 1))} className="w-16 h-16 rounded-3xl bg-[#1C232E]/50 text-[#9C9384] text-2xl font-black hover:bg-[#2A1518] transition-all shadow-sm border border-[#5C4A2E]/30">－</button>
                            <div className="text-5xl font-black text-[#EDE6D6] min-w-[60px] text-center">{mealRequestAmount}</div>
                            <button type="button" onClick={() => setMealRequestAmount(mealRequestAmount + 1)} className="w-16 h-16 rounded-3xl bg-[#0B6E4F]/20 text-[#0B6E4F] text-2xl font-black hover:bg-[#0B6E4F]/30 transition-all shadow-sm border border-[#0B6E4F]/40">＋</button>
                          </div>

                          <div className="flex items-center justify-between p-4 bg-[#1C232E]/50 rounded-2xl border border-[#5C4A2E]/30">
                            <span className="text-[10px] font-black text-[#9C9384] uppercase tracking-widest">Include in Booking (Prepaid)</span>
                            <button 
                              type="button"
                              onClick={() => currentMealType === 'lunch' ? setIsLunchPrepaid(!isLunchPrepaid) : setIsDinnerPrepaid(!isDinnerPrepaid)}
                              className={`w-12 h-6 rounded-full transition-all relative ${ (currentMealType === 'lunch' ? isLunchPrepaid : isDinnerPrepaid) ? 'bg-[#0B6E4F]' : 'bg-[#5C4A2E]' }`}
                            >
                              <div className={`absolute top-1 w-4 h-4 bg-[#EDE6D6] rounded-full transition-all ${ (currentMealType === 'lunch' ? isLunchPrepaid : isDinnerPrepaid) ? 'left-7' : 'left-1' }`} />
                            </button>
                          </div>

                          <div className="space-y-3">
                            <div>
                              <label className="text-[10px] font-black text-[#9C9384] uppercase tracking-widest block mb-2">Dietary Type</label>
                              <select
                                value={mealRequestDietary}
                                onChange={(e) => setMealRequestDietary(e.target.value as 'Normal' | 'Vegetarian')}
                                className="w-full px-4 py-3 bg-[#1C232E] border border-[#5C4A2E]/30 rounded-xl text-sm font-black text-[#EDE6D6] outline-none focus:border-[#0B6E4F] transition-all"
                              >
                                <option value="Normal">Normal</option>
                                <option value="Vegetarian">Vegetarian</option>
                              </select>
                            </div>
                            <div>
                              <label className="text-[10px] font-black text-[#9C9384] uppercase tracking-widest block mb-2">Notes (Optional)</label>
                              <input
                                type="text"
                                value={mealRequestNotes}
                                onChange={(e) => setMealRequestNotes(e.target.value)}
                                className="w-full px-4 py-3 bg-[#1C232E] border border-[#5C4A2E]/30 rounded-xl text-sm font-black text-[#EDE6D6] outline-none focus:border-[#0B6E4F] transition-all"
                                placeholder="e.g., No peanuts, Extra spicy"
                              />
                            </div>
                          </div>

                          {(currentMealType === 'lunch' ? isLunchPrepaid : isDinnerPrepaid) && (
                            <div className="bg-[#0B6E4F]/10 border border-[#0B6E4F]/30 rounded-2xl p-4 flex items-center gap-3 animate-in fade-in slide-in-from-top-1">
                              <div className="w-8 h-8 bg-[#0B6E4F]/20 rounded-full flex items-center justify-center text-[#0B6E4F] shrink-0">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                              </div>
                              <p className="text-[11px] font-bold text-[#0B6E4F] leading-tight">
                                This is a <span className="font-black uppercase">Prepaid</span> request. It will not increase the guest's debt on the tab.
                              </p>
                            </div>
                          )}

                          <button type="button"
                            disabled={mealRequestAmount <= 0}
                            onClick={async () => {
                              // 1. Fetch latest metadata first to prevent overwriting other fields (like settled_receipts)
                              const { data: latest } = await supabase
                                .from('bookings')
                                .select('special_requests')
                                .eq('id', sel.id)
                                .single();

                              const latestMeta = latest?.special_requests
                                ? (typeof latest.special_requests === 'string' ? JSON.parse(latest.special_requests) : latest.special_requests)
                                : {};

                              // 3. Insert into normalized meal_requests table so Cook dashboard sees it
                              const todayStr = new Date().toISOString().split('T')[0];
                              const dbMealType = currentMealType === 'lunch' ? 'Lunch' : 'Dinner';
                              
                              const mealRow = {
                                booking_id: sel.id,
                                meal_date: todayStr,
                                meal_type: dbMealType,
                                adult_qty: mealRequestAmount,
                                child_qty: 0,
                                dietary_type: mealRequestDietary,
                                notes: mealRequestNotes,
                                status: 'Pending',
                              };
                              console.log('Inserting into meal_requests:', mealRow);
                              const { data: insertedMeal, error: mealErr } = await supabase.from('meal_requests').insert(mealRow).select().single();

                              if (mealErr) {
                                console.error('meal_requests insert failed:', mealErr);
                                flash('⚠ Saved locally but failed to sync to kitchen: ' + mealErr.message);
                                setShowMealRequestModal(false);
                                return;
                              }

                              const order = {
                                type: currentMealType,
                                quantity: mealRequestAmount,
                                status: 'pending',
                                prepaid: currentMealType === 'lunch' ? isLunchPrepaid : isDinnerPrepaid,
                                guest_name: sel.guest_name,
                                id: sel.id,
                                meal_id: insertedMeal.id,
                                requested_at: new Date().toISOString()
                              };

                              // meal_requests table is the Single Source of Truth.
                              // The parent's realtime subscription will auto-update activeMeals.
                              if (onRefresh) onRefresh();
                              flash('✓ Sent to Kitchen!');
                              setShowMealRequestModal(false);
                            }}
                            className="w-full py-5 bg-[#0B6E4F] text-[#C9A227] rounded-[24px] text-sm font-black uppercase tracking-[0.2em] shadow-xl shadow-[#0B6E4F]/30 hover:bg-[#0B6E4F]/80 transition-all active:scale-95 disabled:opacity-50"
                          >
                            Send to Kitchen
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {isRoomStay && (
                    <div className="border border-[#5C4A2E]/30 rounded-xl p-4 space-y-3 bg-[#1C232E]">

                      <p className="text-[10px] font-black uppercase tracking-widest text-[#9C9384]">Other Services</p>
                      <div className="grid grid-cols-1 gap-4">
                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input type="checkbox" checked={svcGuide} onChange={e => { 
                                setSvcGuide(e.target.checked); 
                                if (e.target.checked) { 
                                  setSvcGuidePrice(pricing?.guide_price || 0); 
                                  setSvcGuideNames(['']); 
                                } 
                              }} className="w-5 h-5 border-2 border-[#5C4A2E]/30 text-[#0B6E4F] rounded" />
                              <div className="flex flex-col">
                                <span className="text-sm font-bold text-[#EDE6D6]">Guide Service</span>
                                {pricing?.guide_price && pricing.guide_price > 0 && (
                                  <span className="text-[9px] font-bold text-[#9C9384] uppercase tracking-wider">System Price: ${String(pricing.guide_price)} / guide</span>
                                )}
                              </div>
                            </label>
                            {svcGuide && (
                              <div className="flex items-center gap-2">
                                <button type="button" onClick={() => setSvcGuidePrice(Math.max(0, svcGuidePrice - 5))} className="w-8 h-8 flex items-center justify-center bg-[#1C232E]/50 hover:bg-[#2A1518] text-[#9C9384] rounded-xl font-black text-sm transition-all shadow-sm border border-[#5C4A2E]/30">－</button>
                                <div className="relative">
                                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[#9C9384] font-bold text-[10px]">$</span>
                                  <input type="number" value={String(svcGuidePrice)} onChange={e => setSvcGuidePrice(parseFloat(e.target.value) || 0)}
                                    className="w-20 pl-5 pr-2 py-2 bg-[#1C232E] border-2 border-[#5C4A2E]/30 rounded-xl text-base font-black text-[#EDE6D6] focus:border-[#0B6E4F] outline-none text-center" />
                                </div>
                                <button type="button" onClick={() => setSvcGuidePrice(svcGuidePrice + 5)} className="w-8 h-8 flex items-center justify-center bg-[#0B6E4F]/20 hover:bg-[#0B6E4F]/30 text-[#0B6E4F] rounded-xl font-black text-sm transition-all shadow-sm border border-[#0B6E4F]/40">＋</button>
                              </div>
                            )}
                          </div>
                          {svcGuide && (
                            <div className="space-y-2">
                              {svcGuideNames.map((name: any, ni: number) => (
                                <div key={ni} className="flex gap-2">
                                  <input type="text" value={String(name || '')} onChange={e => { const next = [...svcGuideNames]; next[ni] = e.target.value; setSvcGuideNames(next); }}
                                    placeholder={`Guide ${ni + 1} name...`}
                                    className={`flex-1 px-3 py-2 border-2 ${!String(name).trim() ? 'border-[#722F37] bg-[#722F37]/10' : 'border-[#5C4A2E]/30 bg-[#1C232E]'} rounded-lg text-base font-bold text-[#EDE6D6] focus:border-[#0B6E4F] transition-all`} />
                                  {svcGuideNames.length > 1 && <button type="button" onClick={() => { setSvcGuideNames(svcGuideNames.filter((_: any, i: number) => i !== ni)); setSvcGuidePrice(Math.max(0, svcGuidePrice - 40)); }}
                                    className="text-[#722F37] hover:text-[#722F37]/80 font-black text-xl px-1">×</button>}
                                </div>
                              ))}
                              <button type="button" onClick={() => { setSvcGuideNames([...svcGuideNames, '']); setSvcGuidePrice(svcGuidePrice + 40); }}
                                className="w-full py-1.5 border-2 border-dashed border-[#5C4A2E]/30 rounded-xl text-[10px] font-black text-[#9C9384] uppercase tracking-widest hover:border-[#0B6E4F] hover:text-[#0B6E4F] transition-all">+ Add Another Guide ($40)</button>
                            </div>
                          )}
                        </div>
                        <div className="space-y-2 pt-2 border-t border-[#5C4A2E]/30">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={svcTransport} onChange={e => setSvcTransport(e.target.checked)} className="w-5 h-5 border-2 border-[#5C4A2E]/30 text-[#0B6E4F] rounded" />
                            <span className="text-sm font-bold text-[#EDE6D6]">Transport</span>
                          </label>
                          {svcTransport && (
                            <div className="space-y-3">
                              {svcTransList.map((trans: any, ti: number) => (
                                <div key={ti} className="p-3 border border-[#5C4A2E]/30 rounded-xl bg-[#1C232E]/50 space-y-2">
                                  <div className="flex justify-between items-center">
                                    <span className="text-[10px] font-black text-[#9C9384] uppercase tracking-widest">Transfer {String(ti + 1)}</span>
                                    {svcTransList.length > 1 && <button type="button" onClick={() => setSvcTransList(svcTransList.filter((_: any, i: number) => i !== ti))} className="text-[#722F37] hover:text-[#722F37]/80 font-bold text-xs">✕ Remove</button>}
                                  </div>
                                  <input type="text" value={String(trans.name)} onChange={e => setSvcTransList(svcTransList.map((t: any, i: number) => i === ti ? { ...t, name: e.target.value } : t))} placeholder="Driver Name..."
                                    className={`w-full px-3 py-2 border-2 ${!String(trans.name).trim() ? 'border-[#722F37] bg-[#722F37]/10' : 'border-[#5C4A2E]/30 bg-[#1C232E]'} rounded-lg text-base font-bold text-[#EDE6D6] focus:border-[#0B6E4F] transition-all`} />
                                  <div className="flex gap-2">
                                    <input type="text" value={String(trans.details)} onChange={e => setSvcTransList(svcTransList.map((t: any, i: number) => i === ti ? { ...t, details: e.target.value } : t))} placeholder="From/To..."
                                      className={`flex-1 px-3 py-2 border-2 ${!String(trans.details).trim() ? 'border-[#722F37] bg-[#722F37]/10' : 'border-[#5C4A2E]/30 bg-[#1C232E]'} rounded-lg text-base font-bold text-[#EDE6D6] focus:border-[#0B6E4F] transition-all`} />
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-[10px] font-bold text-[#9C9384]">$</span>
                                      <input type="number" value={String(trans.price)} onChange={e => setSvcTransList(svcTransList.map((t: any, i: number) => i === ti ? { ...t, price: parseFloat(e.target.value) || 0 } : t))} placeholder="Price"
                                        className={`w-20 px-3 py-2 border-2 ${trans.price <= 0 ? 'border-[#722F37] bg-[#722F37]/10' : 'border-[#5C4A2E]/30 bg-[#1C232E]'} rounded-lg text-base font-bold text-[#EDE6D6] focus:border-[#0B6E4F] transition-all`} />
                                    </div>
                                  </div>
                                </div>
                              ))}
                              <button type="button" onClick={() => setSvcTransList([...svcTransList, { name: '', details: '', price: 0 }])}
                                className="w-full py-1.5 border-2 border-dashed border-[#5C4A2E]/30 rounded-xl text-[10px] font-black text-[#9C9384] uppercase tracking-widest hover:border-[#0B6E4F] hover:text-[#0B6E4F] transition-all">+ Add Transfer</button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {(canCheckOut || sel.status === 'checked_in') && isStaff && (
                <div className="border border-[#5C4A2E]/30 rounded-xl p-4 space-y-3 bg-[#1C232E]">
                  <p className="text-[10px] font-black uppercase tracking-widest text-[#9C9384]">Extra Services</p>
                  <button onClick={() => setShowDrinks(!showDrinks)} className="text-sm font-bold text-[#0B6E4F] hover:text-[#0B6E4F]/80">{showDrinks ? '− Hide Drinks' : '+ Add Drinks'}</button>
                  {showDrinks && drinks.length > 0 && (
                    <div className="grid grid-cols-2 gap-2">
                      {drinks.map((d: any) => (
                        <div key={d.id} className="flex items-center gap-2 bg-[#1C232E]/50 rounded-lg px-3 py-2 border border-[#5C4A2E]/30">
                          <span className="text-xs text-[#EDE6D6] flex-1 truncate">{String(d.name)}</span>
                          <div className="flex items-center gap-1">
                            <button onClick={() => setSelectedDrinks({ ...selectedDrinks, [d.id]: Math.max(0, (selectedDrinks[d.id] || 0) - 1) })} className="w-5 h-5 rounded bg-[#1C232E]/50 text-[#9C9384] text-xs font-bold hover:bg-[#2A1518] border border-[#5C4A2E]/30">−</button>
                            <span className="w-5 text-center text-xs font-bold text-[#EDE6D6]">{String(selectedDrinks[d.id] || 0)}</span>
                            <button onClick={() => setSelectedDrinks({ ...selectedDrinks, [d.id]: (selectedDrinks[d.id] || 0) + 1 })} className="w-5 h-5 rounded bg-[#0B6E4F]/20 text-[#0B6E4F] text-xs font-bold hover:bg-[#0B6E4F]/30 border border-[#0B6E4F]/40">+</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <input type="text" value={String(newExtraName)} onChange={e => setNewExtraName(e.target.value)} placeholder="Service name"
                      className="flex-1 px-3 py-2 text-base rounded-lg border border-[#5C4A2E]/30 bg-[#1C232E] focus:outline-none focus:ring-2 focus:ring-[#0B6E4F]/30 text-[#EDE6D6]" />
                    <input type="number" value={String(newExtraPrice)} onChange={e => setNewExtraPrice(e.target.value)} placeholder="Price"
                      className="w-20 px-3 py-2 text-base rounded-lg border border-[#5C4A2E]/30 bg-[#1C232E] focus:outline-none text-[#EDE6D6]" />
                    <button onClick={() => { if (!newExtraName.trim()) return; setExtraServices([...extraServices, { name: newExtraName.trim(), price: newExtraPrice, currency: 'USD' }]); setNewExtraName(''); setNewExtraPrice(''); }}
                      className="px-3 py-2 bg-[#0B6E4F] text-[#C9A227] text-xs font-bold rounded-lg hover:bg-[#0B6E4F]/80 border border-[#0B6E4F]/40">Add</button>
                  </div>
                  {extraServices.length > 0 && (
                    <div className="space-y-1">
                      {extraServices.map((s: any, i: number) => (
                        <div key={i} className="flex justify-between items-center text-xs bg-[#0B6E4F]/10 px-3 py-1.5 rounded-lg border border-[#0B6E4F]/20">
                          <span className="text-[#EDE6D6]">{String(s.name)}</span>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-[#0B6E4F]">{String(s.price)} {String(s.currency)}</span>
                            <button onClick={() => setExtraServices(extraServices.filter((_: any, j: number) => j !== i))} className="text-[#722F37] hover:text-[#722F37]/80 font-bold">×</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {isStaff && !isPOS && sel.status !== 'completed' && (
                <div className="bg-[#0B6E4F] rounded-2xl p-5 text-[#C9A227] shadow-xl shadow-[#0B6E4F]/20 animate-in fade-in zoom-in duration-500 border border-[#0B6E4F]/40">
                  <div className="flex justify-between items-center mb-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-[#C9A227]/80">Tab Summary</p>
                    <svg className="w-5 h-5 text-[#C9A227]/60 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                  </div>
                  
                  <div className="space-y-2">
                    {(svcAmount > 0 || (isPrepaid && (sel.collected_amount || 0) === 0)) && (() => {
                      let currentMeta: any = {};
                      try {
                        const parsed = typeof sel.special_requests === 'string'
                          ? JSON.parse(sel.special_requests || '{}')
                          : (sel.special_requests || {});
                        currentMeta = Array.isArray(parsed) ? { days: parsed } : (parsed || {});
                      } catch {
                        currentMeta = {};
                      }
                      const lastAdjustment = parseFloat(currentMeta.last_adjustment) || 0;
                      const isExtended = lastAdjustment > 0;

                      return (
                        <div className="flex justify-between items-center opacity-90 border-b border-white/20 pb-2 mb-2">
                          <span className="font-bold">
                            Accommodation {isExtended && <span className="text-amber-200">(Extended)</span>}
                          </span>
                          {isPrepaid ? (
                            <span className="text-[10px] font-black bg-emerald-400 text-emerald-900 px-2 py-0.5 rounded-md uppercase tracking-wider">PREPAID</span>
                          ) : (
                            <span className="font-black">${String(svcAmount.toFixed(2))}</span>
                          )}
                        </div>
                      );
                    })()}

                    {(() => {
                      const adjustmentValue = parseFloat(String(svcDateAdjustment)) || 0;
                      if (adjustmentValue <= 0) return null; // ONLY SHOW EXTENSIONS

                      return (
                        <div className="flex justify-between items-center opacity-90 border-b border-white/20 pb-2 mb-2 font-mono text-xs bg-black/10 p-2 rounded-lg border border-white/10 animate-in fade-in">
                          <div className="flex flex-col">
                            <span className="font-bold flex items-center gap-1.5">
                              ➕ Stay Extension Fee
                            </span>
                            <span className="text-[8px] uppercase text-white/50 tracking-widest font-sans mt-0.5">
                              Reason: Additional nights added
                            </span>
                          </div>
                          <span className="font-black tracking-tight text-sm text-amber-300">
                            +${adjustmentValue.toFixed(2)}
                          </span>
                        </div>
                      );
                    })()}
                    {(() => {
                      const acceptedOrders = activeMeals.filter((o: any) => 
                        (o.status === 'confirmed' || o.status === 'served') && !o.is_paid
                      );
                      
                      const individualMeals = acceptedOrders.map((o: any) => {
                        const dietaryInfo = o.dietary_type && o.dietary_type !== 'Normal' ? ` - ${o.dietary_type}` : '';
                        const notesInfo = o.notes ? ` - *${o.notes}*` : '';
                        return {
                          name: `${o.type.charAt(0).toUpperCase() + o.type.slice(1)} (${o.meal_date || 'N/A'})${dietaryInfo}${notesInfo} - ID: #${o.meal_id}`,
                          price: (o.quantity || 1) * (o.type === 'lunch' ? pricing.lunch_price : pricing.dinner_price),
                          prepaid: o.prepaid
                        };
                      });

                      const sItems = [
                        ...individualMeals,
                        svcGuide && { name: 'Guide', price: svcGuidePrice, prepaid: false },
                        svcTransport && { name: 'Transport', price: svcTransList.reduce((s: number, t: any) => s + (t.price || 0), 0), prepaid: false },
                        svcDiscount > 0 && { name: 'Discount', price: -svcDiscount, prepaid: false }
                      ].filter(Boolean) as any[];

                      if (sItems.length === 0) return null;

                      return sItems.map((item: any, idx: number) => (
                        <div key={idx} className="flex justify-between items-center opacity-90 border-b border-white/10 pb-1 mb-1 last:border-none last:pb-0 last:mb-0">
                          <span className="font-bold">{String(item.name)}</span>
                          {item.prepaid ? (
                            <span className="text-[9px] font-black bg-emerald-400 text-emerald-900 px-2 py-0.5 rounded-md uppercase tracking-wider">Prepaid</span>
                          ) : (
                            <span className="font-black">${String(item.price.toFixed(2))}</span>
                          )}
                        </div>
                      ));
                    })()}

                    {dTotal_calc > 0 && (
                      <div className="flex justify-between items-center opacity-90">
                        <span className="font-bold">Drinks Tab</span>
                        <span className="font-black">${String(dTotal_calc.toFixed(2))}</span>
                      </div>
                    )}

                    {(() => {
                      const eTotal = extraServices.reduce((sum: number, s: any) => sum + (parseFloat(s.price) || 0), 0);
                      if (eTotal <= 0) return null;
                      return (
                        <div className="flex justify-between items-center opacity-90">
                          <span className="font-bold">Extra Services</span>
                          <span className="font-black">${String(eTotal.toFixed(2))}</span>
                        </div>
                      );
                    })()}

                    {(() => {
                      const paidOrders = activeMeals.filter((o: any) => o.is_paid === true);
                      if (paidOrders.length === 0) return null;

                      const individualPaidMeals = paidOrders.map((o: any) => {
                        const dietaryInfo = o.dietary_type && o.dietary_type !== 'Normal' ? ` - ${o.dietary_type}` : '';
                        const notesInfo = o.notes ? ` - *${o.notes}*` : '';
                        return {
                          name: `${o.type.charAt(0).toUpperCase() + o.type.slice(1)} (${o.meal_date || 'N/A'})${dietaryInfo}${notesInfo} - ID: #${o.meal_id}`
                        };
                      });

                      return (
                        <div className="mt-4 pt-4 border-t border-white/20 animate-in fade-in duration-700">
                          <p className="text-[9px] font-black uppercase tracking-[0.2em] text-indigo-200 mb-2 opacity-70">Historical Receipts / Settled</p>
                          {individualPaidMeals.map((item: any, idx: number) => (
                            <div key={idx} className="flex justify-between items-center opacity-60 text-xs italic line-through decoration-indigo-300/50">
                              <span>{String(item.name)}</span>
                              <span>Settled</span>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>

                  <div className="mt-4 pt-4 border-t border-indigo-400 flex justify-between items-end">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <p className="text-[10px] font-black uppercase tracking-widest text-indigo-100">
                          {gTotal > 0 ? 'Current Tab Balance' : gTotal < 0 ? 'Refund Due to Guest' : 'Tab Settled (Zero Balance)'}
                        </p>
                        {sel.payment_status === 'Prepaid' && (
                          <span className="font-mono text-[9px] font-black uppercase tracking-widest border border-white px-2 py-0.5 bg-indigo-500 text-white">
                            [ PREPAID ]
                          </span>
                        )}
                        {sel.payment_status === 'paid' && (
                          <span className="font-mono text-[9px] font-black uppercase tracking-widest border border-[#5C4A2E]/30 px-2 py-0.5 bg-[#1C232E] text-[#0B6E4F]">
                            [ PAID - {svcPayList?.[0]?.method?.toUpperCase() || 'CASH'} ]
                          </span>
                        )}
                      </div>
                      <p className="text-3xl font-black tracking-tighter leading-none mb-2">
                        ${String(gTotal.toFixed(2))}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {isStaff && sel.status !== 'completed' && (
                  Math.abs(debtRemaining) > 0.01 && (
                    <div className="bg-[#1C232E] border border-[#5C4A2E]/30 p-6 space-y-4 shadow-[4px_4px_0px_0px_rgba(92,74,46,0.3)]">
                      <div className="flex justify-between items-center">
                        <p className="text-[10px] font-black uppercase tracking-widest text-[#9C9384]">Payment Collection</p>
                        {isBalanceMatched || (tPaidUsd >= debtRemaining - 1.00) ? (
                          <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-200">
                            Paid
                          </span>
                        ) : (
                          <span className="text-[10px] font-black uppercase tracking-widest text-rose-500 bg-rose-50 px-2 py-1 rounded-lg border border-rose-100">
                            Remaining: ${String((debtRemaining - tPaidUsd).toFixed(2))}
                          </span>
                        )}
                      </div>

                      <div className="space-y-4">
                        {svcPayList.map((pay: any, pi: number) => {
                          const currentRate = pay.currency === 'USD' ? 1 : (pay.currency === 'UZS' ? (pricing?.usd_to_uzs || 12500) : (pricing?.usd_to_eur || 0.92));
                          
                          return (
                            <div key={pi} className="space-y-3 p-4 bg-[#1C232E]/50 rounded-2xl border border-[#5C4A2E]/30 animate-in slide-in-from-top-2 duration-300">
                              <div className="flex justify-between items-center">
                                <label className="text-[9px] font-black uppercase tracking-widest text-[#9C9384]">Payment {String(pi + 1)}</label>
                                {svcPayList.length > 1 && (
                                  <button onClick={() => setSvcPayList(svcPayList.filter((_: any, i: number) => i !== pi))} className="text-[10px] font-bold text-rose-500 hover:text-rose-700">✕ Remove</button>
                                )}
                              </div>

                              <div className="grid grid-cols-12 gap-4 items-end">
                                <div className="col-span-12 space-y-1.5">
                                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-tighter">Pay in</span>
                                  <select 
                                    value={String(pay.currency)}
                                      onChange={e => {
                                        const newCurr = e.target.value as any;
                                        const newRate = newCurr === 'USD' ? 1 : (newCurr === 'UZS' ? (pricing?.usd_to_uzs || 12500) : (pricing?.usd_to_eur || 0.92));
                                        const otherRowsPaidUsd = svcPayList
                                          .filter((_: any, idx: number) => idx !== pi)
                                          .reduce((sum: number, p: any) => {
                                            const amt = parseFloat(p.amount) || 0;
                                            const r = p.currency === 'USD' ? 1 : (p.currency === 'UZS' ? (pricing?.usd_to_uzs || 12500) : (pricing?.usd_to_eur || 0.92));
                                            return sum + (amt / r);
                                          }, 0);
                                        const stillOwedUsd = debtRemaining - otherRowsPaidUsd;
                                        setSvcPayList(svcPayList.map((p: any, i: number) => {
                                          if (i !== pi) return p;
                                          const updates: any = { ...p, currency: newCurr };
                                          if (newCurr !== 'USD') {
                                            updates.amount = (stillOwedUsd * newRate).toFixed(newCurr === 'UZS' ? 0 : 2);
                                          } else {
                                            updates.amount = stillOwedUsd.toFixed(2);
                                          }
                                          return updates;
                                        }));
                                      }}
                                    className="w-full px-4 py-3 bg-[#1C232E] border-2 border-[#5C4A2E]/30 rounded-2xl text-base font-black text-[#EDE6D6] outline-none focus:border-[#0B6E4F] transition-all shadow-sm"
                                  >
                                    <option value="USD">USD ($)</option>
                                    <option value="UZS">UZS (Sum)</option>
                                    <option value="EUR">EUR (€)</option>
                                  </select>
                                </div>

                                {pay.currency !== 'USD' && (
                                  <div className="col-span-12 space-y-1.5 animate-in slide-in-from-left-2">
                                    <div className="flex justify-between items-center px-1">
                                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-tighter">Exchange Rate (1 USD =)</span>
                                      <button 
                                        onClick={() => fetchCbuRate(pay.currency)}
                                        disabled={loadingAction.includes('rate')}
                                        className="text-[9px] font-black text-indigo-600 hover:text-indigo-700 underline"
                                      >
                                        Get Live Rate
                                      </button>
                                    </div>
                                    <div className="relative group">
                                      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">Rate:</div>
                                      <input
                                        type="number"
                                        value={pay.currency === 'UZS' ? (pricing?.usd_to_uzs || 12500) : (pricing?.usd_to_eur || 0.92)}
                                        onChange={e => {
                                          const val = parseFloat(e.target.value) || 0;
                                          setPricing({ ...pricing, [pay.currency === 'UZS' ? 'usd_to_uzs' : 'usd_to_eur']: val });
                                        }}
                                        className="w-full pl-14 pr-3 py-2.5 bg-[#1C232E] border-2 border-[#5C4A2E]/30 rounded-xl text-base font-black text-[#EDE6D6] outline-none focus:border-[#0B6E4F] shadow-sm"
                                      />
                                    </div>
                                  </div>
                                )}

                                <div className="col-span-12 space-y-1.5">
                                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-tighter">Method</span>
                                  <div className="flex gap-2">
                                    {(['Cash', 'Online'] as const).map((m: any) => (
                                      <button
                                        key={m}
                                        onClick={() => setSvcPayList(svcPayList.map((p: any, i: number) => i === pi ? { ...p, method: m } : p))}
                                        className={`flex-1 py-3 rounded-2xl text-xs font-black uppercase tracking-tighter transition-all border-2 ${
                                          pay.method === m 
                                            ? 'bg-[#0B6E4F] border-[#0B6E4F] text-[#C9A227] shadow-lg' 
                                            : 'bg-[#1C232E] border-[#5C4A2E]/30 text-[#9C9384] hover:border-[#0B6E4F]'
                                        }`}
                                      >
                                        {String(m)}
                                      </button>
                                    ))}
                                  </div>
                                </div>

                                <div className="col-span-12 space-y-1.5">
                                  <div className="flex justify-between items-center px-1">
                                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-tighter">Money to Collect ({String(pay.currency)})</span>
                                    <button 
                                      onClick={() => {
                                        const otherRowsPaidUsd = svcPayList
                                          .filter((_: any, idx: number) => idx !== pi)
                                          .reduce((sum: number, p: any) => {
                                            const amt = parseFloat(p.amount) || 0;
                                            const r = p.currency === 'USD' ? 1 : (p.currency === 'UZS' ? (pricing?.usd_to_uzs || 12500) : (pricing?.usd_to_eur || 0.92));
                                            return sum + (amt / r);
                                          }, 0);
                                        const stillOwedUsd = debtRemaining - otherRowsPaidUsd;
                                        const r = pay.currency === 'USD' ? 1 : (pay.currency === 'UZS' ? (pricing?.usd_to_uzs || 12500) : (pricing?.usd_to_eur || 0.92));
                                        const matchAmt = stillOwedUsd * r;
                                        setSvcPayList(svcPayList.map((p: any, i: number) => i === pi ? { ...p, amount: matchAmt !== 0 ? (pay.currency === 'UZS' ? Math.round(matchAmt).toString() : matchAmt.toFixed(2)) : '' } : p));
                                      }}
                                      className="text-[9px] font-black text-indigo-600 hover:text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100 transition-all"
                                    >
                                      MATCH BALANCE
                                    </button>
                                  </div>
                                  <div className="relative">
                                    <span className={`absolute left-4 top-1/2 -translate-y-1/2 font-black text-slate-400 ${pay.currency === 'UZS' ? 'text-[9px]' : 'text-sm'}`}>
                                      {pay.currency === 'USD' ? '$' : pay.currency === 'EUR' ? '€' : 'SUM'}
                                    </span>
                                    <input
                                      type="text"
                                      inputMode="decimal"
                                      value={String(pay.amount || '')}
                                      onChange={e => {
                                        setSvcPayList(svcPayList.map((p: any, i: number) => i === pi ? { ...p, amount: e.target.value } : p));
                                      }}
                                      placeholder="0.00"
                                      className={`w-full ${pay.currency === 'UZS' ? 'pl-11' : 'pl-8'} pr-4 py-4 bg-[#1C232E] border-2 border-[#5C4A2E]/30 rounded-3xl text-xl font-black text-[#EDE6D6] focus:border-[#0B6E4F] shadow-md`}
                                    />
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}

                        <button
                          onClick={() => {
                            const remaining = debtRemaining - tPaidUsd;
                            setSvcPayList([...svcPayList, { 
                              amount: remaining !== 0 ? remaining.toFixed(2) : '', 
                              currency: 'USD', 
                              method: 'Cash' 
                            }]);
                          }}
                          className="w-full py-3 border-2 border-dashed border-[#5C4A2E]/30 rounded-2xl text-[10px] font-black text-[#9C9384] uppercase tracking-widest hover:border-[#0B6E4F] hover:text-[#0B6E4F] transition-all bg-[#1C232E]/30"
                        >
                          + Add Another Currency
                        </button>

                        <div className="sticky bottom-0 left-0 right-0 p-4 bg-[#1C232E]/80 backdrop-blur-md border-t border-[#5C4A2E]/30 -mx-4 -mb-4 rounded-b-[24px] z-30 flex flex-col gap-2">
                          {!isBalanceMatched && (
                            <div className="flex items-center justify-between px-2">
                              <p className="text-[10px] font-black text-rose-500 uppercase tracking-widest">
                                ⚠ Balance Mismatch: ${Math.abs(debtRemaining - tPaidUsd).toFixed(2)}
                              </p>
                              <button 
                                onClick={() => {
                                  const lastIdx = svcPayList.length - 1;
                                  const otherRowsPaidUsd = svcPayList.slice(0, -1).reduce((sum: number, p: any) => {
                                    const amt = parseFloat(p.amount) || 0;
                                    const r = p.currency === 'USD' ? 1 : (p.currency === 'UZS' ? (pricing?.usd_to_uzs || 12500) : (pricing?.usd_to_eur || 0.92));
                                    return sum + (amt / r);
                                  }, 0);
                                  const stillOwedUsd = debtRemaining - otherRowsPaidUsd;
                                  const lastPay = svcPayList[lastIdx];
                                  const r = lastPay.currency === 'USD' ? 1 : (lastPay.currency === 'UZS' ? (pricing?.usd_to_uzs || 12500) : (pricing?.usd_to_eur || 0.92));
                                  const matchAmt = stillOwedUsd * r;
                                  setSvcPayList(svcPayList.map((p: any, i: number) => i === lastIdx ? { ...p, amount: matchAmt !== 0 ? (lastPay.currency === 'UZS' ? Math.round(matchAmt).toString() : matchAmt.toFixed(2)) : '' } : p));
                                }}
                                className="text-[9px] font-black text-indigo-600 underline uppercase"
                              >
                                Auto-Fix
                              </button>
                            </div>
                          )}
                          <button
                            onClick={() => {
                              const receipts = getSettledReceiptsForSel();
                              const hasSettled = receipts.length > 0 || (sel.collected_amount || 0) > 0;
                              if (!isPrepaid && svcAmount <= 0 && !hasSettled) {
                                setValError('Stay Price is missing. Please enter the guest\'s accommodation cost before proceeding.');
                                return;
                              }
                              if (!isBalanceMatched) {
                                setValError(`Payment balance mismatch. You are trying to collect ${tPaidUsd.toFixed(2)} USD, but the debt is ${debtRemaining.toFixed(2)} USD. Please use the "Match Balance" button to even the tab.`);
                                return;
                              }
                              setSelectedReceipt(null);
                              setShowFinalReceipt(true);
                            }}
                            disabled={loadingAction === 'checkout'}
                            className={`w-full py-4 rounded-2xl font-black uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2 shadow-xl ${!isBalanceMatched ? 'bg-[#1C232E]/50 text-[#9C9384] cursor-not-allowed shadow-none' : 'bg-[#0B6E4F] text-[#C9A227] hover:bg-[#0B6E4F]/80 hover:scale-[1.02] active:scale-95 shadow-[#0B6E4F]/20'}`}
                          >
                            {loadingAction === 'checkout' ? 'Processing...' : 'Review & Pay Tab'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )
              )}

              {/* FOLIO HISTORY — settled tabs (green) + active tab (indigo) */}
              {isStaff && !isPOS && sel.status !== 'completed' && (() => {
                const receipts = getSettledReceiptsForSel();
                const tabCount = receipts.length;
                if (tabCount === 0 && gTotal <= 0.01 && (sel.collected_amount || 0) === 0) return null;
                return (
                  <div className="border border-[#5C4A2E]/30 rounded-2xl p-4 bg-[#1C232E]/50 space-y-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-[#9C9384]">Guest Folio</p>
                    <div className="flex flex-wrap gap-2">
                      {receipts.map((r: any, idx: number) => (
                        <button
                          key={r.id || `folio-tab-${idx}`}
                          onClick={() => { setSelectedReceipt(r); setShowFinalReceipt(true); }}
                          className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border-2 border-emerald-200 text-emerald-700 text-xs font-black rounded-xl hover:bg-emerald-100 transition-all active:scale-95"
                        >
                          <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                          Tab {String(idx + 1)} — Settled
                        </button>
                      ))}
                      {sel.status === 'checked_in' && (
                        <button
                          onClick={() => { setSelectedReceipt(null); setShowFinalReceipt(true); }}
                          className="flex items-center gap-2 px-3 py-2 bg-indigo-50 border-2 border-indigo-300 text-indigo-700 text-xs font-black rounded-xl hover:bg-indigo-100 transition-all active:scale-95"
                        >
                          <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse shrink-0" />
                          Tab {String(tabCount + 1)} — Active {gTotal > 0.01 ? <span className="font-mono text-[11px] ml-1">(${gTotal.toFixed(2)})</span> : '(Empty)'}
                        </button>
                      )}
                    </div>
                    {gTotal > 0.01 && (
                      <p className="text-[9px] font-black text-rose-500 uppercase tracking-widest flex items-center gap-1">
                        ⚠ Guest cannot check out until active tab is settled
                      </p>
                    )}
                  </div>
                );
              })()}

              {showFinalReceipt && sel && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
                  <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={() => setShowFinalReceipt(false)} />
                  <div className="relative bg-[#1C232E] rounded-[32px] shadow-2xl w-full max-w-sm max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200 border border-[#5C4A2E]/30">
                    <div ref={receiptRef}>
                      <div className="bg-[#0B6E4F] px-6 py-10 text-[#C9A227] text-center relative overflow-hidden">
                        <div className="absolute top-4 right-4 z-10">
                          <button onClick={() => setShowFinalReceipt(false)} className="text-[#C9A227]/60 hover:text-[#C9A227] transition-all text-2xl font-bold">×</button>
                        </div>
                        
                        <div className="relative z-10 flex flex-col items-center">
                          <div className="w-16 h-16 bg-[#1C232E]/20 rounded-full flex items-center justify-center mb-4 backdrop-blur-sm border border-[#5C4A2E]/30">
                            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                          </div>
                          
                          <h3 className="text-2xl font-black uppercase tracking-tight mb-2">Final Receipt</h3>
                          <p className="text-[10px] font-black tracking-widest text-[#C9A227]/60 uppercase mb-4">Receipt #{selectedReceipt?.id || 'PENDING'}</p>
                          
                          {selectedReceipt && (
                            <div className="bg-[#1C232E]/20 backdrop-blur-md border border-[#5C4A2E]/30 rounded-lg px-3 py-1.5 text-[9px] font-black uppercase tracking-widest">
                              Settled: {new Date(selectedReceipt.settled_at || selectedReceipt.date || Date.now()).toLocaleString()}
                            </div>
                          )}
                        </div>
                      </div>

                    <div className="p-6 space-y-6">
                      <div className="space-y-4">
                        <div className="pb-4 border-b border-[#5C4A2E]/30">
                          <p className="text-[10px] font-black text-[#9C9384] uppercase tracking-widest mb-1">Guest</p>
                          <p className="text-xl font-black text-[#EDE6D6] leading-tight">{String(sel.guest_name)}</p>
                        </div>
                        <div className="flex justify-between items-center pt-2">
                          <span className="text-[11px] font-black text-[#9C9384] uppercase tracking-widest">Stay Period</span>
                          <span className="text-base font-black text-[#EDE6D6] flex items-center gap-2">
                            {String(sel.check_in)}
                            <svg className="w-4 h-4 text-[#9C9384]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                            </svg>
                            {String(sel.check_out)}
                          </span>
                        </div>
                      </div>

                      {selectedReceipt ? (
                        <div className="space-y-6">
                          <div className="space-y-4">
                            <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest bg-indigo-50 px-2.5 py-1 rounded-md w-fit border border-indigo-100">
                              {(() => {
                                const all = getSettledReceiptsForSel();
                                const idx = [...all].reverse().findIndex(r => r.id === selectedReceipt.id);
                                return `Tab #${idx !== -1 ? idx + 1 : '?'}`;
                              })()} — {String(selectedReceipt.id)}
                            </p>
                            
                            <div className="space-y-3">
                              {((selectedReceipt.items?.accommodation || 0) > 0 || selectedReceipt.items?.isPrepaid) && (
                                <div className="flex justify-between items-center text-sm">
                                  <span className="text-slate-600 font-bold">Stay Price</span>
                                  {selectedReceipt.items?.isPrepaid ? (
                                    <span className="text-[10px] font-black bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded uppercase tracking-wider">PREPAID</span>
                                  ) : (
                                    <span className="text-slate-900 font-black">${String((selectedReceipt.items.accommodation || 0).toFixed(2))}</span>
                                  )}
                                </div>
                              )}
                              
                              {(() => {
                                const meals = selectedReceipt.items?.meals || {};
                                return Object.entries(meals).map(([type, count]: [string, any]) => {
                                  if (type.startsWith('is') || !count) return null;
                                  const isMealPrepaid = type === 'lunch' ? meals.isLunchPrepaid : meals.isDinnerPrepaid;
                                  const price = type === 'lunch' ? (pricing?.lunch_price || 10) : (pricing?.dinner_price || 10);
                                  return (
                                    <div key={type} className="flex justify-between items-center text-sm">
                                      <span className="text-slate-400 font-medium capitalize">{type} ×{String(count)}</span>
                                      {isMealPrepaid ? (
                                        <span className="text-[9px] font-black bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded uppercase tracking-wider">PREPAID</span>
                                      ) : (
                                        <span className="text-slate-500 font-bold">${String((count * price).toFixed(2))}</span>
                                      )}
                                    </div>
                                  );
                                });
                              })()}

                              {(() => {
                                const svcs = selectedReceipt.items?.services || {};
                                return Object.entries(svcs).map(([name, price]: [string, any]) => {
                                  if (!price) return null;
                                  return (
                                    <div key={name} className="flex justify-between items-center text-sm">
                                      <span className="text-slate-400 font-medium capitalize">{name}</span>
                                      <span className="text-slate-500 font-bold">${String(price.toFixed(2))}</span>
                                    </div>
                                  );
                                });
                              })()}

                              {(selectedReceipt.items?.stay_adjustment > 0) && (
                                <div className="flex justify-between items-center text-sm">
                                  <span className="text-slate-400 font-medium">Stay Extension Fee</span>
                                  <span className="text-slate-500 font-bold">${String(selectedReceipt.items.stay_adjustment.toFixed(2))}</span>
                                </div>
                              )}

                              {(selectedReceipt.items?.drinks?.length > 0) && (
                                <div className="flex justify-between items-center text-sm">
                                  <span className="text-slate-400 font-medium">Drinks</span>
                                  <span className="text-slate-500 font-bold">${String(selectedReceipt.items.drinks.reduce((s: number, d: any) => s + (d.price * d.qty), 0).toFixed(2))}</span>
                                </div>
                              )}

                              <div className="flex justify-between items-center pt-4 border-t border-slate-100 mt-2">
                                <span className="text-base font-black text-slate-900">Tab Total</span>
                                <span className="text-lg font-black text-[#6366f1]">${String((selectedReceipt.total || 0).toFixed(2))}</span>
                              </div>
                            </div>
                          </div>

                          <div className="bg-[#f0fdf4] rounded-[24px] p-5 border border-emerald-100/50 space-y-4">
                            <p className="text-[10px] font-black text-emerald-600 uppercase tracking-[0.2em]">Payments Received</p>
                            <div className="space-y-2">
                              {selectedReceipt.payments?.map((p: any, i: number) => (
                                <div key={i} className="flex justify-between items-center text-sm">
                                  <span className="text-emerald-700 font-bold">{p.currency} · {p.method}</span>
                                  <span className="text-emerald-800 font-black">{parseFloat(p.amount).toLocaleString()} {p.currency}</span>
                                </div>
                              ))}
                              <div className="flex justify-between items-center pt-3 border-t border-emerald-200/50 mt-1">
                                <span className="text-sm font-black text-emerald-700">Total Paid (USD Equiv.)</span>
                                <span className="text-base font-black text-emerald-600">${String((selectedReceipt.total || 0).toFixed(2))}</span>
                              </div>
                            </div>
                          </div>

                        </div>
                      ) : (
                        <div className="space-y-6">
                          <div className="space-y-4">
                            <div className="flex justify-between items-center">
                              <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest bg-indigo-50 px-2.5 py-1 rounded-md w-fit border border-indigo-100">
                                Tab #{getSettledReceiptsForSel().length + 1} Breakdown
                              </p>
                              <button 
                                onClick={handleSaveProgress}
                                disabled={loadingAction === 'save'}
                                className="text-[10px] font-black text-emerald-600 hover:text-emerald-700 flex items-center gap-1 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-100 transition-all active:scale-95 disabled:opacity-50"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
                                {loadingAction === 'save' ? 'SAVING...' : 'SAVE CHOICES'}
                              </button>
                            </div>
                            <div className="space-y-3 bg-[#1C232E]/50 rounded-2xl p-4 border border-[#5C4A2E]/30">
                              {(svcAmount > 0 || (isPrepaid && (sel.collected_amount || 0) === 0)) && (
                                <div className="flex justify-between items-center text-sm">
                                  <span className="text-[#9C9384] font-bold">Stay Price</span>
                                  {isPrepaid && (sel.collected_amount || 0) === 0 ? (
                                    <span className="text-[10px] font-black bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded uppercase tracking-wider">PREPAID</span>
                                  ) : (
                                    <span className="text-slate-900 font-black">${String(svcAmount.toFixed(2))}</span>
                                  )}
                                </div>
                              )}
                              
                              {(() => {
                                const items = [
                                  svcLunch && { name: 'Lunch', count: svcLunchCount, price: pricing.lunch_price, prepaid: isLunchPrepaid },
                                  svcDinner && { name: 'Dinner', count: svcDinnerCount, price: pricing.dinner_price, prepaid: isDinnerPrepaid },
                                  svcGuide && { name: 'Guide', price: svcGuidePrice },
                                  svcTransport && { name: 'Transport', price: svcTransList.reduce((s: number, t: any) => s + (t.price || 0), 0) },
                                  svcDiscount > 0 && { name: 'Discount', price: -svcDiscount }
                                ].filter(Boolean) as any[];

                                return items.map((item, i) => (
                                  <div key={i} className="flex justify-between items-center text-sm">
                                    <span className="text-slate-400 font-medium">{item.name} {item.count ? `×${item.count}` : ''}</span>
                                    {item.prepaid ? (
                                      <span className="text-[9px] font-black bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded uppercase tracking-wider">PREPAID</span>
                                    ) : (
                                      <span className="text-slate-500 font-bold">${String((item.count ? item.count * item.price : item.price).toFixed(2))}</span>
                                    )}
                                  </div>
                                ));
                              })()}

                              {dTotal_calc > 0 && (
                                <div className="flex justify-between items-center text-sm">
                                  <span className="text-slate-400 font-medium">Drinks</span>
                                  <span className="text-slate-500 font-bold">${String(dTotal_calc.toFixed(2))}</span>
                                </div>
                              )}

                              <div className="flex justify-between items-center pt-3 border-t border-slate-200 mt-1">
                                <span className="text-sm font-black text-slate-900">Current Total</span>
                                <span className="text-base font-black text-[#6366f1]">${String(gTotal.toFixed(2))}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="space-y-4">
                        {gTotal > 0 && (
                          <button 
                            onClick={async () => {
                              if (finalizeTab) {
                                const ok = await finalizeTab();
                                if (ok) setShowFinalReceipt(false);
                              }
                            }}
                            disabled={loadingAction === 'finalize' || !isBalanceMatched}
                            className={`w-full py-4 rounded-2xl font-black uppercase text-[11px] tracking-widest transition-all shadow-lg active:scale-95 ${isBalanceMatched ? 'bg-[#0B6E4F] text-[#C9A227] shadow-[#0B6E4F]/30 hover:bg-[#0B6E4F]/80' : 'bg-[#1C232E]/50 text-[#9C9384] cursor-not-allowed'}`}
                          >
                            {loadingAction === 'finalize' ? 'PROCESSING...' : isBalanceMatched ? 'SETTLE & CLOSE TAB' : 'BALANCE MISMATCH'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="p-6 pt-0 flex gap-3 no-print">
                    <button 
                      onClick={handleSaveAsImage}
                      disabled={loadingAction === 'exporting'}
                      className="flex-1 py-4 bg-[#1C232E]/50 hover:bg-[#2A1518] text-[#9C9384] rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2 border border-[#5C4A2E]/30"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                      {loadingAction === 'exporting' ? 'EXPORTING...' : 'Save Image'}
                    </button>
                    <button 
                      onClick={handlePrint}
                      className="flex-1 py-4 bg-[#6366f1] hover:bg-[#4f46e5] text-white rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2 shadow-lg shadow-indigo-100"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                      Print PDF
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* SETTLEMENT HISTORY */}
              {isStaff && getSettledReceiptsForSel().length > 0 && (
                <div className="mt-8 border-t-2 border-black pt-6">
                  <div className="flex justify-between items-center mb-6">
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Guest Folio History</p>
                      <h3 className="text-xl font-black text-black uppercase tracking-tighter mt-1">Settlement History</h3>
                    </div>
                  </div>
                  <div className="grid gap-2">
                    {getSettledReceiptsForSel().map((receipt: any, idx: number) => (
                      <div key={idx} className={`p-4 border border-[#5C4A2E]/30 group ${parseFloat(receipt.total_usd || 0) < 0 ? 'bg-[#722F37]/10 border-[#722F37]/30' : 'bg-[#1C232E]'}`}>
                        <div className="flex justify-between items-start mb-2 border-b border-[#5C4A2E]/30 pb-2">
                          <div className="flex flex-col">
                            <span className="text-[10px] font-black text-[#9C9384] uppercase tracking-widest">
                              {parseFloat(receipt.total_usd || 0) < 0 ? 'Settled Refund' : `Tab #${idx + 1}`}
                            </span>
                            <span className="font-mono text-[10px] text-black font-black mt-0.5">{new Date(receipt.settled_at || new Date()).toLocaleString()}</span>
                          </div>
                          <div className="text-right flex flex-col items-end">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Amount</span>
                            <span className={`font-mono text-sm font-black ${parseFloat(receipt.total_usd || 0) < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                              {parseFloat(receipt.total_usd || 0) < 0 ? '-' : ''}${Math.abs(parseFloat(receipt.total_usd || 0)).toFixed(2)}
                            </span>
                            {receipt.payments && receipt.payments.length > 0 && (
                               <span className="text-[8px] font-mono font-black uppercase tracking-widest text-slate-400 mt-1">
                                 [ {receipt.payments.map((p: any) => p.method).join(', ')} ]
                               </span>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2 mt-2">
                           {receipt.items?.accommodation > 0 && (
                             <span className="text-[8px] font-mono font-black uppercase bg-[#1C232E]/50 border border-[#5C4A2E]/30 px-1.5 py-0.5 text-[#EDE6D6]">Stay: ${receipt.items.accommodation.toFixed(2)}</span>
                           )}
                           {receipt.items?.meals?.lunch > 0 && (
                             <span className="text-[8px] font-mono font-black uppercase bg-[#1C232E]/50 border border-[#5C4A2E]/30 px-1.5 py-0.5 text-[#EDE6D6]">Lunch x{receipt.items.meals.lunch}</span>
                           )}
                           {receipt.items?.meals?.dinner > 0 && (
                             <span className="text-[8px] font-mono font-black uppercase bg-[#1C232E]/50 border border-[#5C4A2E]/30 px-1.5 py-0.5 text-[#EDE6D6]">Dinner x{receipt.items.meals.dinner}</span>
                           )}
                           {receipt.items?.drinks?.length > 0 && (
                             <span className="text-[8px] font-mono font-black uppercase bg-[#1C232E]/50 border border-[#5C4A2E]/30 px-1.5 py-0.5 text-[#EDE6D6]">Drinks</span>
                           )}
                           {receipt.items?.extras?.length > 0 && (
                             <span className="text-[8px] font-mono font-black uppercase bg-[#1C232E]/50 border border-[#5C4A2E]/30 px-1.5 py-0.5 text-[#EDE6D6]">Extras</span>
                           )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* UNIFIED GUEST FOLIO — Final Reconciliation */}
              {isStaff && guestStatement && (
                <div className="mt-8 border-t-2 border-black pt-6">
                  <div className="flex justify-between items-center mb-6">
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Unified Guest Folio</p>
                      <h3 className="text-xl font-black text-[#EDE6D6] uppercase tracking-tighter mt-1">Audit Manifest</h3>
                    </div>
                    <span className={`px-4 py-1.5 text-[10px] font-black uppercase border-2 border-[#5C4A2E]/30 shadow-[2px_2px_0px_0px_rgba(92,74,46,0.3)] ${
                      guestStatement.status === 'PAID' || guestStatement.status === 'PREPAID' ? 'bg-[#0B6E4F] text-[#C9A227]' : 'bg-[#1C232E] text-[#EDE6D6] animate-pulse'
                    }`}>
                      [ STATUS: {guestStatement.status} {guestStatement.status === 'OPEN TAB' ? `- $${guestStatement.remaining.toFixed(2)}` : ''} ]
                    </span>
                  </div>

                  <div className="space-y-2">
                    {/* Line Items - Bento Style */}
                    <div className="grid gap-2">
                      {/* Accommodation */}
                      <div className="flex justify-between items-center p-4 bg-[#1C232E] border border-[#5C4A2E]/30 group">
                        <div className="flex flex-col">
                          <span className="text-[10px] font-black text-[#9C9384] uppercase tracking-widest">Service</span>
                          <span className="text-xs font-black text-[#EDE6D6] uppercase">Accommodation / Stay Fee</span>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Amount</span>
                          <span className="font-mono text-sm font-black text-black">${guestStatement.accommodation.toFixed(2)}</span>
                        </div>
                      </div>

                      {/* Meals */}
                      {guestStatement.mealItems.map((item: any, idx: number) => (
                        <div key={idx} className="flex justify-between items-center p-4 bg-[#1C232E] border border-[#5C4A2E]/30">
                          <div className="flex flex-col">
                            <span className="text-[10px] font-black text-[#9C9384] uppercase tracking-widest">Kitchen Request</span>
                            <span className="text-xs font-black text-[#EDE6D6] uppercase">{item.name} · <span className="font-mono text-[9px]">{item.date}</span></span>
                          </div>
                          <div className="text-right">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                              <span className="font-mono">{item.qty}</span> x $<span className="font-mono">{item.price}</span>
                            </span>
                            <span className="font-mono text-sm font-black text-black">${item.total.toFixed(2)}</span>
                          </div>
                        </div>
                      ))}

                      {/* Guide Service */}
                      {guestStatement.guideTotal > 0 && (
                        <div className="flex justify-between items-center p-4 bg-[#1C232E] border border-[#5C4A2E]/30">
                          <div className="flex flex-col">
                            <span className="text-[10px] font-black text-[#9C9384] uppercase tracking-widest">Guide Service</span>
                            <span className="text-xs font-black text-[#EDE6D6] uppercase">{guestStatement.guideNames || 'Guide'}</span>
                          </div>
                          <div className="text-right">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Amount</span>
                            <span className="font-mono text-sm font-black text-black">${guestStatement.guideTotal.toFixed(2)}</span>
                          </div>
                        </div>
                      )}

                      {/* Transportation */}
                      {guestStatement.transportTotal > 0 && (
                        <div className="flex justify-between items-center p-4 bg-[#1C232E] border border-[#5C4A2E]/30">
                          <div className="flex flex-col">
                            <span className="text-[10px] font-black text-[#9C9384] uppercase tracking-widest">Transportation</span>
                            <span className="text-xs font-black text-[#EDE6D6] uppercase max-w-[200px] truncate">{guestStatement.transportationDetails || 'Transport'}</span>
                          </div>
                          <div className="text-right">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Amount</span>
                            <span className="font-mono text-sm font-black text-black">${guestStatement.transportTotal.toFixed(2)}</span>
                          </div>
                        </div>
                      )}

                      {/* Grand Total Row */}
                      <div className="flex justify-between items-center p-4 bg-black text-white border border-black mt-2">
                        <span className="text-sm font-black uppercase tracking-widest">Grand Total Manifest</span>
                        <span className="font-mono text-lg font-black">${guestStatement.grandTotal.toFixed(2)}</span>
                      </div>

                      {/* Reconciliation / Payments */}
                      <div className="flex justify-between items-center p-4 bg-[#0F1419] border border-[#5C4A2E]/30 mt-4 border-dashed">
                        <div className="flex flex-col">
                          <span className="text-[10px] font-black text-[#9C9384] uppercase tracking-widest">Reconciliation</span>
                          <span className="text-xs font-black text-[#EDE6D6] uppercase">Settled Payments / Pre-Paid Credit</span>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] font-black text-[#9C9384] uppercase tracking-widest block">Total Paid</span>
                          <span className="font-mono text-sm font-black text-[#0B6E4F]">-${guestStatement.totalReconciled.toFixed(2)}</span>
                        </div>
                      </div>

                      {/* Final Balance */}
                      <div className="flex justify-between items-center p-5 bg-[#1C232E] border-2 border-[#5C4A2E]/30 mt-2 shadow-[4px_4px_0px_0px_rgba(92,74,46,0.3)]">
                        <span className="text-md font-black uppercase tracking-[0.1em] text-[#EDE6D6]">Remaining Balance</span>
                        <div className="text-right">
                          <p className={`text-2xl font-mono font-black ${guestStatement.status === 'OPEN TAB' ? 'text-[#722F37]' : 'text-[#0B6E4F]'}`}>
                            {guestStatement.status === 'PREPAID' ? 'PREPAID' : `$${guestStatement.remaining.toFixed(2)}`}
                          </p>
                          {guestStatement.status === 'OPEN TAB' && (
                            <p className="text-[9px] font-black text-rose-500 uppercase tracking-widest animate-pulse mt-1">⚠ Settlement Required at Front Desk</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
        </div>
      </div>

      {valError && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setValError(null)} />
          <div className="relative bg-[#1C232E] rounded-[32px] shadow-2xl w-full max-w-sm overflow-hidden p-8 space-y-6 text-center border border-[#5C4A2E]/30">
            <h3 className="text-2xl font-black uppercase tracking-tight text-[#722F37]">Checkout Blocked</h3>
            <p className="text-[#9C9384] text-sm font-medium leading-relaxed">{String(valError)}</p>
            <button onClick={() => setValError(null)} className="w-full py-4 bg-[#0B6E4F] text-[#C9A227] rounded-2xl font-black uppercase hover:bg-[#0B6E4F]/80 transition-all border border-[#0B6E4F]/40">I Understand</button>
          </div>
        </div>
      )}
    </>
  );
}
