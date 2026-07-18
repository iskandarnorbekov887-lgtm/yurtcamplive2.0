'use client';
import { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { formatSpace, isGcCancelled } from '@/utils/calendar-logic';
import { LockedBookingPanel } from '@/components/LockedBookingPanel';
import * as htmlToImage from 'html-to-image';
import { buildReceiptLineItems } from '@/utils/receipt-logic';

function htmlDescriptionToText(html: string): string {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')           // <br> and <br/> → newline
    .replace(/<\/p>/gi, '\n')                // closing </p> → newline
    .replace(/<u>(.*?)<\/u>/gi, '$1')         // strip <u>...</u>, keep text
    .replace(/<b>(.*?)<\/b>/gi, '$1')         // strip <b>...</b>, keep text
    .replace(/<i>(.*?)<\/i>/gi, '$1')         // strip <i>...</i>, keep text
    .replace(/<[^>]+>/g, '')                  // strip any remaining tags
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .trim();
}

interface BookingModalProps {
  selectedItem: any;
  setSelectedItem: (item: any) => void;
  userRole: string;
  currentUserId: string;
  teamId?: string;
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

  svcLunch: boolean;
  setSvcLunch: (v: boolean) => void;
  svcLunchCount: number;
  setSvcLunchCount: (v: number) => void;
  svcDinner: boolean;
  setSvcDinner: (v: boolean) => void;
  svcDinnerCount: number;
  setSvcDinnerCount: (v: number) => void;
  svcDiscount: number;
  setSvcDiscount: (v: number) => void;
  svcDiscountReason: string;
  setSvcDiscountReason: (v: string) => void;
  svcPayList: any[];
  setSvcPayList: (v: any[]) => void;
  
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
  handleGuestCheckOut?: () => Promise<boolean>;
  handleSaveServices?: () => Promise<void>;
  handleCreateFromEvent: (doCheckIn: boolean, adults: number, children: number) => Promise<void>;
  fetchCbuRate: (curr: any) => Promise<void>;
  checkoutBlockReason?: string | null;
  setCheckoutBlockReason?: (val: string | null) => void;
  
  // Derived values
  gTotal: number;
  gTotalWithPending?: number;
  hasPendingUnsavedServices?: boolean;
  debtRemaining: number;
  tPaidUsd: number;
  isBalanceMatched: boolean;
  today: string;
  gcEvents: any[];
  dayEntries: any[];
  syncWarnings?: any;
  setSyncWarnings?: (v: any) => void;
  activeMeals: any[];
  setActiveMeals: (meals: any[]) => void;
  activeServices: any[];
  setActiveServices: (services: any[]) => void;
}

export function BookingModal(props: BookingModalProps) {
  const {
    selectedItem, setSelectedItem, userRole, currentUserId, teamId, pricing, setPricing,
    loadingAction, setLoadingAction, actionMsg, flash,
    onRefresh, onUpdateBooking, onCheckIn, onCheckOut, onCancelBooking,
    svcAdults, setSvcAdults,
    svcChildren, setSvcChildren,
    svcAmount, setSvcAmount,
    svcDateAdjustment, setSvcDateAdjustment,
    isPrepaid, setIsPrepaid,
    svcLunch, setSvcLunch, svcLunchCount, setSvcLunchCount, svcDinner, setSvcDinner, svcDinnerCount, setSvcDinnerCount,
    svcDiscount, setSvcDiscount, svcDiscountReason, setSvcDiscountReason, svcPayList, setSvcPayList,
    showServices, setShowServices, showNotes, setShowNotes, showFinalReceipt, setShowFinalReceipt,
    selectedReceipt, setSelectedReceipt, editingDates, setEditingDates,
    editCheckIn, setEditCheckIn, editCheckOut, setEditCheckOut, dateAdjAmount, setDateAdjAmount,
    valError, setValError, getSettledReceiptsForSel, handleCheckIn, handleCheckOut, handleCancel,
    handleSaveServices,
    fetchCbuRate, gTotal, gTotalWithPending, hasPendingUnsavedServices, debtRemaining, tPaidUsd, isBalanceMatched, today,
    dayEntries, finalizeTab, activeMeals, setActiveMeals, activeServices, setActiveServices
  } = props;

  console.trace('BookingModal render, svcAdults:', svcAdults);

  const isStaff = userRole === 'Manager' || userRole === 'CEO';
  const sel = selectedItem?.booking;

  const [localAdults, setLocalAdults] = useState<number | null>(null);
  const [localChildren, setLocalChildren] = useState<number | null>(null);
  const [loadingGuestCounts, setLoadingGuestCounts] = useState(false);
  const [adultsChildrenLocked, setAdultsChildrenLocked] = useState(false);

  // Temporary Manager Bypass state
  const [bypassLunchAdults, setBypassLunchAdults] = useState(0);
  const [bypassLunchChildren, setBypassLunchChildren] = useState(0);
  const [bypassDinnerAdults, setBypassDinnerAdults] = useState(0);
  const [bypassDinnerChildren, setBypassDinnerChildren] = useState(0);

  // Transportation & Guide Service state
  const [transportPrice, setTransportPrice] = useState('');
  const [guidePrice, setGuidePrice] = useState('');

  const [transportFrom, setTransportFrom] = useState('');
  const [transportTo, setTransportTo] = useState('');
  const [transportDriver, setTransportDriver] = useState('');
  const [addingTransport, setAddingTransport] = useState(false);

  const [guideName, setGuideName] = useState('');
  const [paxodType, setPaxodType] = useState<'kichik' | 'katta' | 'both'>('kichik');
  const [addingGuide, setAddingGuide] = useState(false);

  const [showTransportList, setShowTransportList] = useState(true);
  const [showGuideList, setShowGuideList] = useState(true);
  const [showTransportSummary, setShowTransportSummary] = useState(true);
  const [showGuideSummary, setShowGuideSummary] = useState(true);

  const [showCreatePopover, setShowCreatePopover] = useState<false | 'checkin' | 'only'>(false);
  const [newAdults, setNewAdults] = useState<string | number>(1);
  const [newChildren, setNewChildren] = useState<string | number>(0);

  const resetCreatePopoverState = () => {
    setNewAdults(1);
    setNewChildren(0);
  };

  // Use svcDiscountReason from props instead of local state

  useEffect(() => {
    if (sel?.id) {
      setLoadingGuestCounts(true);
      supabase.from('bookings')
        .select('number_of_adults, number_of_children, guest_count_confirmed')
        .eq('id', sel.id)
        .single()
        .then(({ data, error }) => {
          if (!error && data) {
            setLocalAdults(data.number_of_adults);
            setLocalChildren(data.number_of_children);
            // Lock if guest count has been explicitly confirmed by a manager
            setAdultsChildrenLocked(data.guest_count_confirmed === true);
          }
          setLoadingGuestCounts(false);
        });
    }
  }, [sel?.id]);

  // Pre-fill meal counts from meal_requests when booking changes
  useEffect(() => {
    if (sel?.id) {
      supabase
        .from('meal_requests')
        .select('meal_type, status')
        .eq('booking_id', sel.id)
        .then(({ data, error }) => {
          if (!error && data) {
            const lunchCount = data.filter(m => m.meal_type === 'Lunch' && m.status !== 'Cancelled').length;
            const dinnerCount = data.filter(m => m.meal_type === 'Dinner' && m.status !== 'Cancelled').length;
            setSvcLunchCount(lunchCount);
            setSvcDinnerCount(dinnerCount);
            // Enable the meal toggles if there are any requests
            setSvcLunch(lunchCount > 0);
            setSvcDinner(dinnerCount > 0);
          }
        });
    }
  }, [sel?.id]);

  const getBookingTypeInfo = () => {
    if (!sel) return null;
    let category = '';
    try {
      const meta = (sel.meta || {});
      category = meta.guest_category || '';
    } catch {}

    if (category === 'pool') return { prefix: '🏊', message: 'Instant POS: Settled in UZS' };
    if (category === 'local') return { prefix: '🏠', message: 'Instant POS: Settled in UZS' };
    return { prefix: '', message: 'Standard Stay Booking' };
  };

  const typeInfo = getBookingTypeInfo();

  // Build receipt items array for both settled and pending receipts
  const receiptItems = useMemo(() => {
    if (!sel) return [];
    if (selectedReceipt) {
      const { lineItems } = buildReceiptLineItems(selectedReceipt, pricing, selectedReceipt.total, selectedReceipt.id);
      return lineItems.map(item => ({
        name: item.label,
        description: '',
        price: item.amount,
        isPrepaid: item.isPrepaid,
        paid: true
      }));
    } else {
      // Fresh Mode - build snapshot-like object from live data
      const liveSnapshot = {
        items: {
          accommodation: svcAmount,
          isPrepaid: isPrepaid && (sel?.collected_amount || 0) === 0,
          meals: {
            lunch: activeMeals.filter(m => !m.is_paid && !m.prepaid && (m.status === 'confirmed' || m.status === 'served') && m.meal_type === 'Lunch').reduce((sum, m) => sum + (m.adult_qty || 0) + (m.child_qty || 0), 0),
            dinner: activeMeals.filter(m => !m.is_paid && !m.prepaid && (m.status === 'confirmed' || m.status === 'served') && m.meal_type === 'Dinner').reduce((sum, m) => sum + (m.adult_qty || 0) + (m.child_qty || 0), 0),
          },
          services: {},
          extras: activeServices.filter((s: any) => s.service_type === 'extra').map((s: any) => ({
            name: s.details?.name || 'Extra',
            price: String(s.unit_price * s.quantity)
          })),
          stay_adjustment: svcDateAdjustment,
          discount: svcDiscount > 0 ? { amount: svcDiscount, reason: svcDiscountReason } : null
        }
      };
      const { lineItems } = buildReceiptLineItems(liveSnapshot, pricing, gTotal);
      return lineItems.map(item => ({
        name: item.label,
        description: '',
        price: item.amount,
        isPrepaid: item.isPrepaid,
        paid: item.isPrepaid
      }));
    }
  }, [selectedReceipt, sel, pricing, svcAmount, isPrepaid, svcDiscount, svcDateAdjustment, svcDiscountReason, activeMeals, activeServices, gTotal]);

  const currentMeta = useMemo(() => {
    if (!sel) return {};
    let meta: any = {};
    try {
      meta = Array.isArray(sel.meta) ? { days: sel.meta } : (sel.meta || {});
    } catch (err) {
      console.error('Metadata parse error:', err);
    }
    return meta;
  }, [sel?.meta]);

  const isPOS = currentMeta.guest_category === 'local' || currentMeta.guest_category === 'pool';

  const [mealAssurance, setMealAssurance] = useState({ accepted: 0, served: 0 });
  const [showMealRequestModal, setShowMealRequestModal] = useState(false);
  const [currentMealType, setCurrentMealType] = useState<'lunch' | 'dinner' | null>(null);
  const [mealRequestAdultQty, setMealRequestAdultQty] = useState(0);
  const [mealRequestChildQty, setMealRequestChildQty] = useState(0);
  const [mealRequestAdultVegQty, setMealRequestAdultVegQty] = useState(0);
  const [mealRequestChildVegQty, setMealRequestChildVegQty] = useState(0);
  const [lastVegSplit, setLastVegSplit] = useState({ adultVeg: 0, childVeg: 0 });
  const [mealRequestDietary, setMealRequestDietary] = useState<'Normal' | 'Vegetarian'>('Normal');
  const [mealRequestNotes, setMealRequestNotes] = useState('');
  const [mealRequestDate, setMealRequestDate] = useState('');
  const [expandedMealGroups, setExpandedMealGroups] = useState<Set<string>>(new Set());
  const [expandedReceiptId, setExpandedReceiptId] = useState<string | null>(null);

  // Pre-fill meal request quantities when modal opens
  useEffect(() => {
    if (showMealRequestModal && sel) {
      setMealRequestAdultQty(sel.number_of_adults || 1);
      setMealRequestChildQty(sel.number_of_children || 0);
      // Use carried-over split if available, otherwise default to 0
      setMealRequestAdultVegQty(lastVegSplit.adultVeg);
      setMealRequestChildVegQty(lastVegSplit.childVeg);
      setMealRequestDate(new Date().toISOString().split('T')[0]);
    } else if (!showMealRequestModal) {
      // Reset fields when modal closes
      setMealRequestDate('');
    }
  }, [showMealRequestModal, sel, lastVegSplit]);

  // Meal assurance logic (calculated from the prop)
  useEffect(() => {
    const acceptedCount = activeMeals.filter(m => m.status === 'Accepted').length;
    const servedCount = activeMeals.filter(m => m.status === 'Served').length;
    setMealAssurance({ accepted: acceptedCount, served: servedCount });
  }, [activeMeals]);


  const handleSaveProgress = async () => {
    if (!sel || !onUpdateBooking) return;
    setLoadingAction('save');
    try {
      const category = currentMeta.guest_category || 'international';

      // 1. Prepare the standard fields
      const data: any = {
        guest_count_confirmed: true,
        is_prepaid: isPrepaid,
        is_accommodation_prepaid: isPrepaid,

        guest_category: category,
        
        // 2. Map all numeric data to the single 'amount' column
        amount: svcAmount, 
      };

      // Only update guest counts if they haven't been confirmed yet
      if (!sel.guest_count_confirmed) {
        data.number_of_adults = svcAdults;
        data.number_of_children = svcChildren;
      }

      // 3. Keep payment logic synchronized - prepaid should NOT add to collected_amount
      // collected_amount is for manager-collected cash only, not office-prepaid amounts
      if (!isPrepaid && svcAmount > 0) {
        data.collected_amount = (sel.collected_amount || 0) + svcAmount;
        data.collected_currency = 'USD';
      }

      // 4. Manual Protection Rule
      if (sel.google_event_id || sel.source === 'System' || sel.source === 'office') {
        data.is_manually_updated = true;
      }

      await onUpdateBooking(sel.id, data);
      
      // Force Supabase schema reload
      try { await supabase.rpc('reload_schema'); } catch { /* ignore if not exist */ }

      // Re-lock adults/children inputs after successful save
      setAdultsChildrenLocked(true);

      flash('✓ Choices saved to guest file!');
    } catch (err) {
      flash('⚠ Failed to save progress.');
    } finally {
      setLoadingAction('');
    }
  };

  const handleSaveGuestCount = async () => {
    if (!sel || !onUpdateBooking) return;
    setLoadingAction('save');
    try {
      const data: any = {
        number_of_adults: localAdults,
        number_of_children: localChildren,
        guest_count_confirmed: true,
      };

      await onUpdateBooking(sel.id, data);

      // Lock the fields immediately after successful save
      setAdultsChildrenLocked(true);

      flash('✓ Guest count saved and locked!');
    } catch (err) {
      flash('⚠ Failed to save guest count.');
    } finally {
      setLoadingAction('');
    }
  };

  const statusColor = (s?: string) => ({
    checked_in: 'bg-[#0B6E4F]/20 text-[#0B6E4F] border border-[#0B6E4F]/40',
    confirmed: 'bg-[#B8860B]/20 text-[#B8860B] border border-[#B8860B]/40',
    completed: 'bg-[#5C4A2E]/20 text-[#5C4A2E] border border-[#5C4A2E]/40',
    cancelled: 'bg-[#722F37]/20 text-[#722F37] border border-[#722F37]/40',
    pending: 'bg-[#1C232E]/20 text-[#9C9384] border border-[#2A2F36]',
    no_arrival: 'bg-[#1C232E]/20 text-[#9C9384] border border-[#2A2F36]',
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
  const isCheckoutDay = daysUntilCheckOut <= 0 && sel?.status === 'checked_in';
  const canCancel = sel && ['confirmed', 'pending'].includes(sel.status) && !!onCancelBooking && !isDayGuest;
  const isAfterNoon = new Date().getHours() >= 12;
  const isAfterTwo = new Date().getHours() >= 14;

  if (!selectedItem) return null;

  // Calendar-only event (no booking) — show simplified card
  if (!sel && selectedItem?.event) {
    const ev = selectedItem.event;

    // Cancelled event — show read-only cancelled view
    if (isGcCancelled(ev)) {
      return (
        <div className="fixed inset-0 z-[100] flex items-center sm:items-start justify-center p-0 sm:p-4 sm:pt-16 pb-safe" onClick={() => setSelectedItem(null)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative bento-card sm:rounded-2xl shadow-2xl w-full sm:max-w-md h-full sm:h-auto sm:max-h-[85vh] overflow-y-auto pb-20 sm:pb-0" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#2A2F36] sticky top-0 bg-red-700 rounded-t-2xl z-10">
              <p className="text-[10px] font-black uppercase tracking-widest text-white">
                CANCELLED
              </p>
              <button onClick={() => setSelectedItem(null)} className="w-8 h-8 flex items-center justify-center edge-control rounded-xl transition-all text-white font-bold text-xl">×</button>
            </div>
            <div className="p-5 space-y-4">
              <h2 className="text-xl font-black text-[#EDE6D6]">{ev.summary || '(No title)'}</h2>
              <p className="text-sm text-[#9C9384] mt-0.5 font-data">{ev.start} → {ev.end}</p>
              {ev.description && (
                <p className="text-xs text-[#9C9384] mt-2 whitespace-pre-wrap bg-[#1C232E]/50 rounded-xl p-3 border border-[#2A2F36]">{htmlDescriptionToText(ev.description)}</p>
              )}
              <div className="bg-red-700/20 border border-red-700/40 rounded-xl p-4">
                <p className="text-xs text-red-400">This event is cancelled. No booking can be created for it.</p>
              </div>
            </div>
          </div>
        </div>
      );
    }

    // Non-cancelled unlinked event — show create booking options
    return (
      <div className="fixed inset-0 z-[100] flex items-center sm:items-start justify-center p-0 sm:p-4 sm:pt-16 pb-safe" onClick={() => setSelectedItem(null)}>
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
        <div className="relative bento-card sm:rounded-2xl shadow-2xl w-full sm:max-w-md h-full sm:h-auto sm:max-h-[85vh] overflow-y-auto pb-20 sm:pb-0" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#2A2F36] sticky top-0 bg-[#1C232E] rounded-t-2xl z-10">
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
                <p className="text-xs text-[#9C9384] mt-2 whitespace-pre-wrap bg-[#1C232E]/50 rounded-xl p-3 border border-[#2A2F36]">{htmlDescriptionToText(ev.description)}</p>
              )}
            </div>
            <div className="bg-[#B8860B]/20 border border-[#B8860B]/40 rounded-xl p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-[#B8860B] mb-2">Calendar Only — No Booking Yet</p>
              <p className="text-xs text-[#B8860B]">Create a booking from this event to manage check-in, services, and payments.</p>
            </div>
            <div className="flex flex-col gap-2">
                <button
                  onClick={() => setShowCreatePopover('checkin')}
                  disabled={loadingAction === 'creating'}
                  className="w-full py-3 bg-emerald-700 hover:bg-emerald-800 text-white text-[11px] font-black uppercase tracking-[0.15em] flex items-center justify-center gap-2 transition-all disabled:opacity-60 border border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[2px] active:translate-y-[2px]"
                >
                  {loadingAction === 'creating' ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : '→'}
                  Create Booking & Check In
                </button>
                <button
                  onClick={() => setShowCreatePopover('only')}
                  disabled={loadingAction === 'creating'}
                  className="w-full py-3 bg-[#1C232E] hover:bg-[#2A1518] text-[#9C9384] text-[11px] font-black uppercase tracking-[0.15em] flex items-center justify-center gap-2 transition-all disabled:opacity-60 border border-[#2A2F36]"
                >
                  Create Booking Only
                </button>
            </div>

            {showCreatePopover && (
              <div className="fixed inset-0 z-[150] flex items-center justify-center p-4" onClick={() => { setShowCreatePopover(false); resetCreatePopoverState(); }}>
                <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
                <div className="relative bg-[#1C232E] border border-[#2A2F36] rounded-xl p-4 shadow-xl w-full max-w-sm animate-in fade-in zoom-in-95" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-[#9C9384]">New Booking Details</p>
                    <button onClick={() => { setShowCreatePopover(false); resetCreatePopoverState(); }} className="text-[#9C9384] hover:text-[#EDE6D6] font-bold text-lg">×</button>
                  </div>
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Adults *</label>
                      <input
                        type="number"
                        value={newAdults}
                        onChange={e => setNewAdults(e.target.value)}
                        onBlur={() => setNewAdults(Math.max(1, parseInt(String(newAdults)) || 1))}
                        className="w-full px-3 py-2 border text-sm font-black focus:outline-none bg-[#1C232E]/50 border-[#2A2F36] text-[#EDE6D6]"
                        min="1"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Children under 12</label>
                      <input
                        type="number"
                        value={newChildren}
                        onChange={e => setNewChildren(e.target.value)}
                        onBlur={() => setNewChildren(Math.max(0, parseInt(String(newChildren)) || 0))}
                        className="w-full px-3 py-2 border text-sm font-black focus:outline-none bg-[#1C232E]/50 border-[#2A2F36] text-[#EDE6D6]"
                        min="0"
                      />
                    </div>
                    <button
                      onClick={() => {
                        const adultsFinal = Math.max(1, parseInt(String(newAdults)) || 1);
                        const childrenFinal = Math.max(0, parseInt(String(newChildren)) || 0);
                        props.handleCreateFromEvent(
                          showCreatePopover === 'checkin',
                          adultsFinal,
                          childrenFinal
                        );
                        setShowCreatePopover(false);
                        resetCreatePopoverState();
                      }}
                      disabled={loadingAction === 'creating'}
                      className="w-full py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-[11px] font-black uppercase tracking-[0.15em] transition-all disabled:opacity-60 border border-black rounded-lg"
                    >
                      Create
                    </button>
                  </div>
                </div>
              </div>
            )}

            {actionMsg && (
              <div className="bg-[#1C232E] text-[#EDE6D6] px-4 py-2 rounded-xl text-xs font-bold text-center animate-in fade-in border border-[#2A2F36]">{actionMsg}</div>
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
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#2A2F36] sticky top-0 bg-[#1C232E] rounded-t-2xl z-10">
            <p className="text-[10px] font-black uppercase tracking-widest text-[#0B6E4F]">
              Booking Details
            </p>
            <button onClick={() => setSelectedItem(null)} className="w-8 h-8 flex items-center justify-center edge-control rounded-xl transition-all text-[#EDE6D6] font-bold text-xl">×</button>
          </div>

          <div className="p-5 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                {typeInfo && (
                  <div className="mb-2 px-2 py-0.5 bg-[#1C232E]/20 border border-[#2A2F36] rounded-lg text-[10px] font-black text-[#9C9384] uppercase tracking-widest flex items-center gap-1.5">
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

            {isCheckoutDay && isStaff && (
              <button
                onClick={async () => {
                  console.log('[Check Out Guest button] clicked, handleGuestCheckOut exists:', !!props.handleGuestCheckOut);
                  if (props.handleGuestCheckOut) {
                    const result = await props.handleGuestCheckOut();
                    console.log('[Check Out Guest button] result:', result);
                  }
                }}
                disabled={loadingAction === 'guestcheckout'}
                className="w-full py-3 bg-amber-700 hover:bg-amber-800 text-white text-[11px] font-black uppercase tracking-[0.15em] transition-all disabled:opacity-60"
              >
                {loadingAction === 'guestcheckout' ? 'Checking Out...' : 'Check Out Guest'}
              </button>
            )}

            {showNotes && sel && (sel.notes || sel.description) && (
              <div className="bg-[#B8860B]/20 rounded-[20px] p-4 border border-[#B8860B]/30 shadow-sm animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 bg-[#B8860B]/30 rounded-lg flex items-center justify-center text-[#B8860B]">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  </div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-[#B8860B]">Booking & Stay Notes</p>
                </div>
                <p className="text-sm text-[#EDE6D6] whitespace-pre-wrap leading-relaxed font-medium">{htmlDescriptionToText(String(sel.notes || sel.description))}</p>
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
                    <div className="bg-[#1C232E] border-2 border-[#2A2F36] rounded-[32px] p-6 shadow-xl shadow-[#5C4A2E]/20 space-y-4">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-12 h-12 bg-[#0B6E4F]/30 rounded-2xl flex items-center justify-center text-[#0B6E4F] shadow-md shadow-[#0B6E4F]/20">
                          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        </div>
                        <div>
                          <h3 className="text-lg font-black text-[#EDE6D6] uppercase tracking-tight leading-tight">Transaction Receipt</h3>
                          <p className="text-[10px] font-bold text-[#9C9384] uppercase tracking-widest">Instant Point of Sale Settlement</p>
                        </div>
                      </div>
                      {/* Summary Cards */}
                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-[#0B6E4F]/10 border border-[#0B6E4F]/30 rounded-2xl p-4">
                          <p className="text-[9px] font-black text-[#0B6E4F] uppercase tracking-widest mb-2">Paid</p>
                          <p className="text-xl font-black text-[#0B6E4F]">${String((sel.collected_amount || 0).toFixed(2))}</p>
                        </div>
                        <div className="bg-[#BA7517]/10 border border-[#BA7517]/30 rounded-2xl p-4">
                          <p className="text-[9px] font-black text-[#BA7517] uppercase tracking-widest mb-2">Unpaid</p>
                          <p className="text-xl font-black text-[#BA7517]">${String(Math.max(0, gTotal - (sel.collected_amount || 0)).toFixed(2))}</p>
                        </div>
                      </div>
                      
                      <div className="bg-[#1C232E]/50 border border-[#2A2F36] rounded-2xl p-4 flex flex-col items-center justify-center gap-1 shadow-inner">
                        <p className="text-[10px] font-black text-[#9C9384] uppercase tracking-widest">Amount Taken</p>
                        <p className="text-3xl font-black text-[#EDE6D6] flex items-baseline gap-1 font-mono">
                          {(sel.collected_amount || sel.total_price || 0).toLocaleString()} 
                          <span className="text-lg text-[#9C9384] font-bold font-mono">{sel.collected_currency || 'UZS'}</span>
                        </p>
                      </div>
                      
                      <div className="flex items-center justify-between px-2 text-sm font-bold text-[#9C9384] border-b border-[#2A2F36] pb-2">
                        <span className="uppercase tracking-widest text-[10px] text-[#9C9384]">Guest Count:</span>
                        <span className="text-[#EDE6D6] text-base">{sel.number_of_adults || sel.guest_count || 0} pax</span>
                      </div>
                      
                      <button className="w-full py-4 bg-[#1C232E]/50 text-[#9C9384] font-black uppercase tracking-[0.2em] text-[11px] rounded-2xl cursor-not-allowed border border-[#2A2F36]">
                        Closed Tab - Receipt Logged
                      </button>
                    </div>
                  );
                }

                return (
                  <div className="bg-[#1C232E] border-2 border-[#2A2F36] rounded-[32px] p-6 shadow-xl shadow-[#5C4A2E]/20 space-y-4">
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
                        {/* Gate "Edit Dates" behind lock when booking is paid, unless CEO */}
                        {sel.payment_status === 'paid' && userRole !== 'CEO' ? (
                          <div className="flex items-center gap-1.5 text-[10px] font-bold text-[#C9A227]">
                            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                            </svg>
                            Dates locked — use Extend Stay or Request Edit
                          </div>
                        ) : (
                          <button
                            onClick={() => { 
                              setEditingDates(true); 
                              setEditCheckIn(sel.check_in); 
                              setEditCheckOut(sel.check_out); 
                              setDateAdjAmount(currentMeta.last_adjustment || '');
                            }}
                            className="text-[10px] font-bold text-[#0B6E4F] hover:text-[#0B6E4F] underline underline-offset-2 decoration-[#0B6E4F]/20 transition-all">Edit Dates
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                  {editingDates && (
                    <div className="w-full bg-[#1C232E] border border-[#2A2F36] p-4 space-y-4 shadow-[4px_4px_0px_0px_rgba(92,74,46,0.3)]">
                      <div className="flex items-center justify-between border-b border-[#2A2F36] pb-2">
                        <p className="text-[10px] font-black text-[#EDE6D6] uppercase tracking-[0.2em]">Bento Stay Editor</p>
                        {(sel.collected_amount || 0) > 0 && (
                          <span className="text-[9px] font-black bg-[#0B6E4F]/20 text-[#0B6E4F] px-2 py-0.5 border border-[#0B6E4F]/40 uppercase">Financial Locked</span>
                        )}
                      </div>
                       
                      <div className="grid grid-cols-2 border border-[#2A2F36]">
                        <div className="p-3 border-r border-[#2A2F36] bg-[#1C232E]/50">
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
                              // INVARIANT: This is the ONLY place non-settlement accommodation price changes should happen.
                              // total_price represents accommodation base price + date adjustments only.
                              // Service/meal costs are never included here - they live in meal_requests/booking_services.
                              const settledReceipts = getSettledReceiptsForSel ? getSettledReceiptsForSel() : [];
                              const isTab1Closed = settledReceipts.length > 0 || (sel.collected_amount || 0) > 0 || sel.is_prepaid || sel.is_accommodation_prepaid;
                              
                              const currentMeta: any = Array.isArray(sel.meta) ? { days: sel.meta } : (sel.meta || {});

                              const updates: any = { 
                                check_in: editCheckIn,
                                check_out: editCheckOut,
                                is_manually_updated: true,
                                total_price: isTab1Closed ? ((sel.total_price || 0) + svcDateAdjustment) : (svcAmount + svcDateAdjustment)
                              };

                              // collected_amount will be updated in finalizeTab when the refund is physically given/settled

                              // Save metadata change history natively
                              updates.meta = { 
                                ...currentMeta, 
                                is_manual_dates: true, 
                                days: dayEntries,
                                last_adjustment: svcDateAdjustment
                              };

                              if (onUpdateBooking) await onUpdateBooking(sel.id, updates);

                              // Sync straight to Google Calendar
                              if (sel.google_event_id) {
                                try {
                                  await fetch('/api/calendar/events', {
                                    method: 'PATCH',
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
                <div className="bg-[#1C232E] border-2 border-[#2A2F36] rounded-[32px] p-6 shadow-xl shadow-[#5C4A2E]/20 mb-6">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-12 h-12 bg-[#0B6E4F] rounded-2xl flex items-center justify-center text-[#C9A227] shadow-lg shadow-[#0B6E4F]/20">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                    </div>
                    <div>
                      <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight leading-tight">Add to Tab</h3>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Post new charges for this guest</p>
                    </div>
                  </div>
                </div>
              )}

              {(sel.status === 'checked_in' || sel.status === 'confirmed') && isStaff && (
                <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300 mt-4">
                  {isRoomStay && sel?.guest_category !== 'pool' && (() => {
                    // ── LOCKED BOOKING: show read-only panel when payment_status === 'paid' ──
                    if (sel.payment_status === 'paid') {
                      return (
                        <LockedBookingPanel
                          booking={sel}
                          currentUserId={currentUserId}
                          onRefresh={onRefresh || (() => {})}
                        />
                      );
                    }

                    // ── NORMAL editable Stay Configuration ──────────────────────────────────
                    const isTab1Closed = getSettledReceiptsForSel().length > 0 || (sel.collected_amount || 0) > 0 || sel.is_prepaid || sel.is_accommodation_prepaid;
                    const isDatesChanged = editCheckOut !== sel.check_out;
                    const isExtended = editCheckOut > sel.check_out;
                    const isShortened = editCheckOut < sel.check_out;

                    return (
                      <div className="border border-[#2A2F36] p-4 bg-[#1C232E] shadow-[2px_2px_0px_0px_rgba(92,74,46,0.3)] space-y-4">
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
                            <div className="flex items-center justify-between">
                              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Adults *</label>
                              {adultsChildrenLocked && !isTab1Closed && (
                                <button
                                  onClick={() => {
                                    if (confirm('Change guest count? This will require re-entering the values.')) {
                                      setAdultsChildrenLocked(false);
                                    }
                                  }}
                                  className="text-[9px] font-black text-[#0B6E4F] uppercase tracking-wider hover:text-[#0B6E4F]/80"
                                >
                                  Edit
                                </button>
                              )}
                            </div>
                            <input
                              type="number"
                              value={loadingGuestCounts ? '' : (localAdults ?? '')}
                              disabled={isTab1Closed || adultsChildrenLocked || loadingGuestCounts}
                              onChange={e => {
                                const val = parseInt(e.target.value) || 0;
                                setSvcAdults(val);
                                setLocalAdults(val);
                              }}
                              className={`w-full px-3 py-2 border text-sm font-black focus:outline-none ${(isTab1Closed || adultsChildrenLocked || loadingGuestCounts) ? 'bg-[#1C232E]/50 border-[#2A2F36] text-[#9C9384] cursor-not-allowed' : 'bg-[#1C232E]/50 border-[#2A2F36] text-[#EDE6D6]'}`}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Children under 12</label>
                            <input 
                              type="number" 
                              value={loadingGuestCounts ? '' : (localChildren ?? '')} 
                              disabled={isTab1Closed || adultsChildrenLocked || loadingGuestCounts}
                              onChange={e => {
                                const val = parseInt(e.target.value) || 0;
                                setSvcChildren(val);
                                setLocalChildren(val);
                              }}
                              className={`w-full px-3 py-2 border text-sm font-black focus:outline-none ${(isTab1Closed || adultsChildrenLocked || loadingGuestCounts) ? 'bg-[#1C232E]/50 border-[#2A2F36] text-[#9C9384] cursor-not-allowed' : 'bg-[#1C232E]/50 border-[#2A2F36] text-[#EDE6D6]'}`}
                            />
                          </div>
                        </div>

                        {!isTab1Closed && !adultsChildrenLocked && (
                          <button
                            onClick={handleSaveGuestCount}
                            disabled={loadingAction === 'save'}
                            className="w-full py-2 px-4 bg-[#0B6E4F] text-[#C9A227] text-[10px] font-black uppercase tracking-wider border border-[#0B6E4F]/40 hover:bg-[#0B6E4F]/80 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {loadingAction === 'save' ? 'Saving...' : 'Save Guest Count'}
                          </button>
                        )}

                        {isTab1Closed ? (
                          <div className="space-y-4">
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between">
                                <label className="text-[10px] font-black uppercase tracking-widest text-[#9C9384]">Accommodation</label>
                                <div className="flex items-center gap-3">
                                  {sel.is_accommodation_prepaid ? (
                                    <span className="text-[10px] font-black bg-emerald-400 text-emerald-900 px-2 py-0.5 rounded-md uppercase tracking-wider">Prepaid</span>
                                  ) : (
                                    <span className="text-[10px] font-black bg-emerald-500 text-white px-2 py-0.5 rounded-md uppercase tracking-wider">✓ Paid</span>
                                  )}
                                </div>
                              </div>
                              <div className={`px-3 py-2 text-sm font-mono font-bold ${(sel.is_accommodation_prepaid || isTab1Closed) ? 'border-emerald-700/40 bg-emerald-950/20 text-emerald-400' : 'bg-[#1C232E]/50 border border-[#2A2F36] text-[#9C9384]'}`}>
                                ${String((sel.is_accommodation_prepaid ? 0 : (sel.total_price || 0)).toFixed(2))}
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
                              <div className="flex items-center justify-between">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Accommodation</label>
                                <div className="flex items-center gap-3">
                                  {isPrepaid && (
                                    <span className="text-[10px] font-black bg-emerald-400 text-emerald-900 px-2 py-0.5 rounded-md uppercase tracking-wider">Prepaid</span>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => setIsPrepaid(!isPrepaid)}
                                    className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${isPrepaid ? 'bg-[#0B6E4F]' : 'bg-[#2A2F36]'}`}
                                  >
                                    <span
                                      className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform duration-200 ${isPrepaid ? 'translate-x-5' : 'translate-x-0'}`}
                                    />
                                  </button>
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                <div className="relative flex-1">
                                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-mono text-xs">$</span>
                                  <input 
                                    type="number" 
                                    value={String(svcAmount || '')} 
                                    disabled={isPrepaid}
                                    onChange={e => {
                                      const val = parseFloat(e.target.value) || 0;
                                      setSvcAmount(val);
                                      setSvcDateAdjustment(0);
                                    }}
                                    className={`w-full pl-7 pr-3 py-2 bg-[#1C232E]/50 border border-[#2A2F36] text-sm font-black font-mono focus:outline-none ${isPrepaid ? 'text-[#9C9384] cursor-not-allowed' : 'text-[#EDE6D6]'}`}
                                    placeholder="0.00"
                                  />
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Meal Request Modal */}
                  {showMealRequestModal && (
                    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowMealRequestModal(false)}>
                      <div className="bg-[#1C232E] rounded-[32px] w-full max-w-sm p-8 shadow-2xl animate-in zoom-in-95 duration-200 border border-[#2A2F36]" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-6">
                          <h3 className="text-xl font-black text-[#EDE6D6] uppercase tracking-tight">Request {currentMealType}</h3>
                          <button onClick={() => setShowMealRequestModal(false)} className="text-2xl font-bold text-[#9C9384] hover:text-[#EDE6D6] transition-colors">×</button>
                        </div>
                        
                        <div className="space-y-6">
                          <div className="space-y-4">
                            <div>
                              <label className="text-[10px] font-black text-[#9C9384] uppercase tracking-widest block mb-2">Adults Qty</label>
                              <div className="flex items-center justify-center gap-4">
                                <button type="button" onClick={() => setMealRequestAdultQty(Math.max(0, mealRequestAdultQty - 1))} className="w-12 h-12 rounded-2xl bg-[#1C232E]/50 text-[#9C9384] text-xl font-black hover:bg-[#2A1518] transition-all shadow-sm border border-[#2A2F36]">－</button>
                                <div className="text-3xl font-black text-[#EDE6D6] min-w-[50px] text-center">{mealRequestAdultQty}</div>
                                <button type="button" onClick={() => setMealRequestAdultQty(mealRequestAdultQty + 1)} className="w-12 h-12 rounded-2xl bg-[#0B6E4F]/20 text-[#0B6E4F] text-xl font-black hover:bg-[#0B6E4F]/30 transition-all shadow-sm border border-[#0B6E4F]/40">＋</button>
                              </div>
                            </div>
                            {(sel?.children_under_12 || 0) > 0 && (
                              <div>
                                <label className="text-[10px] font-black text-[#9C9384] uppercase tracking-widest block mb-2">Children Qty</label>
                                <div className="flex items-center justify-center gap-4">
                                  <button type="button" onClick={() => setMealRequestChildQty(Math.max(0, mealRequestChildQty - 1))} className="w-12 h-12 rounded-2xl bg-[#1C232E]/50 text-[#9C9384] text-xl font-black hover:bg-[#2A1518] transition-all shadow-sm border border-[#2A2F36]">－</button>
                                  <div className="text-3xl font-black text-[#EDE6D6] min-w-[50px] text-center">{mealRequestChildQty}</div>
                                  <button type="button" onClick={() => setMealRequestChildQty(mealRequestChildQty + 1)} className="w-12 h-12 rounded-2xl bg-[#0B6E4F]/20 text-[#0B6E4F] text-xl font-black hover:bg-[#0B6E4F]/30 transition-all shadow-sm border border-[#0B6E4F]/40">＋</button>
                                </div>
                              </div>
                            )}
                            <div>
                              <label className="text-[10px] font-black text-[#9C9384] uppercase tracking-widest block mb-2">Adult Vegetarian Qty</label>
                              <div className="flex items-center justify-center gap-4">
                                <button type="button" onClick={() => setMealRequestAdultVegQty(Math.max(0, mealRequestAdultVegQty - 1))} className="w-12 h-12 rounded-2xl bg-[#1C232E]/50 text-[#9C9384] text-xl font-black hover:bg-[#2A1518] transition-all shadow-sm border border-[#2A2F36]">－</button>
                                <div className="text-3xl font-black text-[#EDE6D6] min-w-[50px] text-center">{mealRequestAdultVegQty}</div>
                                <button type="button" onClick={() => setMealRequestAdultVegQty(Math.min(mealRequestAdultQty, mealRequestAdultVegQty + 1))} className="w-12 h-12 rounded-2xl bg-[#0B6E4F]/20 text-[#0B6E4F] text-xl font-black hover:bg-[#0B6E4F]/30 transition-all shadow-sm border border-[#0B6E4F]/40">＋</button>
                              </div>
                              <div className="flex items-center justify-between mt-2 px-2 py-1 bg-[#0B6E4F]/10 rounded-lg border border-[#0B6E4F]/30">
                                <span className="text-[10px] font-bold text-[#0B6E4F]">Normal Adults:</span>
                                <span className="text-[10px] font-black text-[#EDE6D6]">{mealRequestAdultQty - mealRequestAdultVegQty}</span>
                              </div>
                            </div>
                            {(sel?.children_under_12 || 0) > 0 && (
                              <div>
                                <label className="text-[10px] font-black text-[#9C9384] uppercase tracking-widest block mb-2">Child Vegetarian Qty</label>
                                <div className="flex items-center justify-center gap-4">
                                  <button type="button" onClick={() => setMealRequestChildVegQty(Math.max(0, mealRequestChildVegQty - 1))} className="w-12 h-12 rounded-2xl bg-[#1C232E]/50 text-[#9C9384] text-xl font-black hover:bg-[#2A1518] transition-all shadow-sm border border-[#2A2F36]">－</button>
                                  <div className="text-3xl font-black text-[#EDE6D6] min-w-[50px] text-center">{mealRequestChildVegQty}</div>
                                  <button type="button" onClick={() => setMealRequestChildVegQty(Math.min(mealRequestChildQty, mealRequestChildVegQty + 1))} className="w-12 h-12 rounded-2xl bg-[#0B6E4F]/20 text-[#0B6E4F] text-xl font-black hover:bg-[#0B6E4F]/30 transition-all shadow-sm border border-[#0B6E4F]/40">＋</button>
                                </div>
                                <div className="flex items-center justify-between mt-2 px-2 py-1 bg-[#0B6E4F]/10 rounded-lg border border-[#0B6E4F]/30">
                                  <span className="text-[10px] font-bold text-[#0B6E4F]">Normal Children:</span>
                                  <span className="text-[10px] font-black text-[#EDE6D6]">{mealRequestChildQty - mealRequestChildVegQty}</span>
                                </div>
                              </div>
                            )}
                          </div>

                          <div className="flex items-center justify-between p-4 bg-[#1C232E]/50 rounded-2xl border border-[#2A2F36]">
                            <span className="text-[10px] font-black text-[#9C9384] uppercase tracking-widest">Include in Booking (Prepaid)</span>
                            <button 
                              type="button"
                              disabled
                              className={`w-12 h-6 rounded-full transition-all relative bg-[#5C4A2E] opacity-50 cursor-not-allowed`}
                            >
                              <div className={`absolute top-1 w-4 h-4 bg-[#EDE6D6] rounded-full transition-all left-1`} />
                            </button>
                          </div>

                          <div className="space-y-3">
                            <div>
                              <label className="text-[10px] font-black text-[#9C9384] uppercase tracking-widest block mb-2">Meal Date</label>
                              <input
                                type="date"
                                value={mealRequestDate}
                                onChange={(e) => setMealRequestDate(e.target.value)}
                                className="w-full px-4 py-3 bg-[#1C232E] border border-[#2A2F36] rounded-xl text-sm font-black text-[#EDE6D6] outline-none focus:border-[#0B6E4F] transition-all"
                              />
                            </div>
                            <div>
                              <label className="text-[10px] font-black text-[#9C9384] uppercase tracking-widest block mb-2">Dietary Type</label>
                              <select
                                value={mealRequestDietary}
                                onChange={(e) => setMealRequestDietary(e.target.value as 'Normal' | 'Vegetarian')}
                                className="w-full px-4 py-3 bg-[#1C232E] border border-[#2A2F36] rounded-xl text-sm font-black text-[#EDE6D6] outline-none focus:border-[#0B6E4F] transition-all"
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
                                className="w-full px-4 py-3 bg-[#1C232E] border border-[#2A2F36] rounded-xl text-sm font-black text-[#EDE6D6] outline-none focus:border-[#0B6E4F] transition-all"
                                placeholder="e.g., No peanuts, Extra spicy"
                              />
                            </div>
                          </div>



                          <button type="button"
                            disabled={mealRequestAdultQty <= 0 && mealRequestChildQty <= 0}
                            onClick={async () => {
                              // 1. Fetch latest metadata first to prevent overwriting other fields (like settled_receipts)
                              const { data: latest } = await supabase
                                .from('bookings')
                                .select('meta')
                                .eq('id', sel.id)
                                .single();

                              const latestMeta = latest?.meta || {};

                              // 3. Insert into normalized meal_requests table so Cook dashboard sees it
                              const dbMealType = currentMealType === 'lunch' ? 'Lunch' : 'Dinner';
                              
                              const mealRow = {
                                booking_id: sel.id,
                                meal_date: mealRequestDate,
                                meal_type: dbMealType,
                                adult_qty: mealRequestAdultQty,
                                child_qty: mealRequestChildQty,
                                vegetarian_qty: mealRequestAdultVegQty + mealRequestChildVegQty,
                                dietary_type: mealRequestDietary,
                                notes: mealRequestNotes,
                                status: 'Pending',
                                team_id: teamId,
                              };
                              console.log('Inserting into meal_requests:', mealRow);
                              const { data: insertedMeal, error: mealErr } = await supabase.from('meal_requests').insert(mealRow).select().single();

                              if (mealErr) {
                                console.error('meal_requests insert failed:', mealErr);
                                flash('⚠ Saved locally but failed to sync to kitchen: ' + mealErr.message);
                                setShowMealRequestModal(false);
                                return;
                              }

                              // Update bookings table with default_vegetarian_qty
                              await supabase
                                .from('bookings')
                                .update({ default_vegetarian_qty: mealRequestAdultVegQty + mealRequestChildVegQty })
                                .eq('id', sel.id);

                              // If this is Lunch, auto-apply the same vegetarian count to Dinner on the same day
                              if (currentMealType === 'lunch') {
                                const { data: existingDinner } = await supabase
                                  .from('meal_requests')
                                  .select('*')
                                  .eq('booking_id', sel.id)
                                  .eq('meal_date', mealRequestDate)
                                  .eq('meal_type', 'Dinner')
                                  .single();

                                if (existingDinner) {
                                  await supabase
                                    .from('meal_requests')
                                    .update({ vegetarian_qty: mealRequestAdultVegQty + mealRequestChildVegQty })
                                    .eq('id', existingDinner.id);
                                }
                              }

                              const order = {
                                type: currentMealType,
                                quantity: mealRequestAdultQty + mealRequestChildQty,
                                status: 'pending',
                                prepaid: false,
                                guest_name: sel.guest_name,
                                id: sel.id,
                                meal_id: insertedMeal.id,
                                requested_at: new Date().toISOString()
                              };

                              // meal_requests table is the Single Source of Truth.
                              // The parent's realtime subscription will auto-update activeMeals.
                              
                              // Save the veg split for carry-over to future meals
                              setLastVegSplit({ adultVeg: mealRequestAdultVegQty, childVeg: mealRequestChildVegQty });
                              
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

                  {isRoomStay && (() => {
                    const isTab1Closed = getSettledReceiptsForSel().length > 0 || (sel.collected_amount || 0) > 0 || sel.is_prepaid || sel.is_accommodation_prepaid;
                    return (
                      <div className="border border-[#2A2F36] rounded-xl p-4 space-y-3 bg-[#1C232E]">
                        <div className="flex justify-between items-center">
                          <p className="text-[10px] font-black uppercase tracking-widest text-[#9C9384]">Other Services</p>
                        </div>
                      <div className="grid grid-cols-1 gap-4">
                        {(() => {
                          const hasActiveFoodTab = activeMeals.some((m: any) =>
                            !m.is_paid && (m.status === 'confirmed' || m.status === 'served')
                          );
                          if (!hasActiveFoodTab) return null;

                          const activeUnpaidMeals = activeMeals.filter((m: any) =>
                            !m.is_paid && (m.status === 'confirmed' || m.status === 'served')
                          );
                          const isFoodPrepaid = activeUnpaidMeals.length > 0 &&
                            activeUnpaidMeals.every((m: any) => m.prepaid);

                          return (
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium text-slate-400">Food Prepaid</span>
                              <button
                                onClick={async () => {
                                  const newValue = !isFoodPrepaid;
                                  const idsToUpdate = activeUnpaidMeals.map((m: any) => m.meal_id || m.id);
                                  console.log('[FoodPrepaid] idsToUpdate:', idsToUpdate, 'types:', idsToUpdate.map(id => typeof id));
                                  if (idsToUpdate.length === 0) return;

                                  // Optimistic update — flip immediately, matches accommodation's
                                  // isPrepaid responsiveness
                                  const idSet = new Set(idsToUpdate);
                                  setActiveMeals(activeMeals.map((m: any) =>
                                    idSet.has(m.meal_id || m.id) ? { ...m, prepaid: newValue } : m
                                  ));

                                  const { error } = await supabase
                                    .from('meal_requests')
                                    .update({ prepaid: newValue })
                                    .in('id', idsToUpdate);

                                  if (error) {
                                    console.error('[FoodPrepaid] Update failed:', JSON.stringify(error, null, 2));
                                    // Roll back on failure
                                    setActiveMeals(activeMeals.map((m: any) =>
                                      idSet.has(m.meal_id || m.id) ? { ...m, prepaid: !newValue } : m
                                    ));
                                    flash('⚠ Failed to update food prepaid status.');
                                    return;
                                  }
                                  flash(newValue ? '✓ Food marked prepaid.' : '✓ Food marked billable.');
                                }}
                                className={`relative w-11 h-6 rounded-full transition-colors ${
                                  isFoodPrepaid ? 'bg-[#0B6E4F]' : 'bg-[#2A2F36]'
                                }`}
                              >
                                <span
                                  className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
                                    isFoodPrepaid ? 'translate-x-5' : 'translate-x-0'
                                  }`}
                                />
                              </button>
                            </div>
                          );
                        })()}

                        {/* TEMPORARY: Manager bypass — adds meal directly as Accepted, skipping cook queue. Remove when no longer needed. */}
                        {isStaff && (
                          <div className="grid grid-cols-2 gap-3">
                            {/* Quick Add Lunch */}
                            <div className="bg-[#1C232E]/50 rounded-lg p-3 border border-[#2A2F36]">
                              <div className="text-[10px] font-black uppercase tracking-widest text-[#9C9384] mb-2">Quick Add Lunch</div>
                              <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs text-slate-400">Adults</span>
                                  <div className="flex items-center gap-2">
                                    <button onClick={() => setBypassLunchAdults(Math.max(0, bypassLunchAdults - 1))} className="w-8 h-8 rounded-lg bg-[#1C232E]/50 text-[#9C9384] text-sm font-black hover:bg-[#2A1518] transition-all border border-[#2A2F36]">－</button>
                                    <span className="text-sm font-black text-[#EDE6D6] min-w-[20px] text-center">{bypassLunchAdults}</span>
                                    <button onClick={() => setBypassLunchAdults(bypassLunchAdults + 1)} className="w-8 h-8 rounded-lg bg-[#0B6E4F]/20 text-[#0B6E4F] text-sm font-black hover:bg-[#0B6E4F]/30 transition-all border border-[#0B6E4F]/40">＋</button>
                                  </div>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-xs text-slate-400">Children</span>
                                  <div className="flex items-center gap-2">
                                    <button onClick={() => setBypassLunchChildren(Math.max(0, bypassLunchChildren - 1))} className="w-8 h-8 rounded-lg bg-[#1C232E]/50 text-[#9C9384] text-sm font-black hover:bg-[#2A1518] transition-all border border-[#2A2F36]">－</button>
                                    <span className="text-sm font-black text-[#EDE6D6] min-w-[20px] text-center">{bypassLunchChildren}</span>
                                    <button onClick={() => setBypassLunchChildren(bypassLunchChildren + 1)} className="w-8 h-8 rounded-lg bg-[#0B6E4F]/20 text-[#0B6E4F] text-sm font-black hover:bg-[#0B6E4F]/30 transition-all border border-[#0B6E4F]/40">＋</button>
                                  </div>
                                </div>
                                <button
                                  onClick={async () => {
                                    const adultQty = bypassLunchAdults;
                                    const childQty = bypassLunchChildren;
                                    if (adultQty <= 0 && childQty <= 0) return;
                                    const { data: inserted, error } = await supabase.from('meal_requests').insert({
                                      booking_id: sel.id,
                                      meal_date: today,
                                      meal_type: 'Lunch',
                                      adult_qty: adultQty,
                                      child_qty: childQty,
                                      status: 'Accepted',
                                      team_id: teamId,
                                      is_manual_entry: true,
                                    }).select().single();
                                    if (error) {
                                      flash('⚠ Failed to add to tab.');
                                      return;
                                    }
                                    // Optimistic add — show immediately, matches Food Prepaid's pattern
                                    setActiveMeals([...activeMeals, {
                                      meal_id: inserted.id,
                                      id: inserted.id,
                                      meal_type: inserted.meal_type,
                                      type: inserted.meal_type.toLowerCase(),
                                      adult_qty: inserted.adult_qty,
                                      child_qty: inserted.child_qty,
                                      status: 'confirmed', // matches statusMap['Accepted'] used elsewhere
                                      prepaid: false,
                                      is_paid: false,
                                      meal_date: inserted.meal_date,
                                      is_manual_entry: true,
                                    }]);
                                    setBypassLunchAdults(0);
                                    setBypassLunchChildren(0);
                                    flash('✓ Added directly to tab (bypassed kitchen).');
                                  }}
                                  disabled={bypassLunchAdults <= 0 && bypassLunchChildren <= 0}
                                  className="w-full py-2 bg-[#0B6E4F] text-[#C9A227] rounded-lg text-xs font-black uppercase tracking-widest hover:bg-[#0B6E4F]/80 transition-all disabled:opacity-50"
                                >
                                  Add to Tab
                                </button>
                              </div>
                            </div>

                            {/* Quick Add Dinner */}
                            <div className="bg-[#1C232E]/50 rounded-lg p-3 border border-[#2A2F36]">
                              <div className="text-[10px] font-black uppercase tracking-widest text-[#9C9384] mb-2">Quick Add Dinner</div>
                              <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs text-slate-400">Adults</span>
                                  <div className="flex items-center gap-2">
                                    <button onClick={() => setBypassDinnerAdults(Math.max(0, bypassDinnerAdults - 1))} className="w-8 h-8 rounded-lg bg-[#1C232E]/50 text-[#9C9384] text-sm font-black hover:bg-[#2A1518] transition-all border border-[#2A2F36]">－</button>
                                    <span className="text-sm font-black text-[#EDE6D6] min-w-[20px] text-center">{bypassDinnerAdults}</span>
                                    <button onClick={() => setBypassDinnerAdults(bypassDinnerAdults + 1)} className="w-8 h-8 rounded-lg bg-[#0B6E4F]/20 text-[#0B6E4F] text-sm font-black hover:bg-[#0B6E4F]/30 transition-all border border-[#0B6E4F]/40">＋</button>
                                  </div>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-xs text-slate-400">Children</span>
                                  <div className="flex items-center gap-2">
                                    <button onClick={() => setBypassDinnerChildren(Math.max(0, bypassDinnerChildren - 1))} className="w-8 h-8 rounded-lg bg-[#1C232E]/50 text-[#9C9384] text-sm font-black hover:bg-[#2A1518] transition-all border border-[#2A2F36]">－</button>
                                    <span className="text-sm font-black text-[#EDE6D6] min-w-[20px] text-center">{bypassDinnerChildren}</span>
                                    <button onClick={() => setBypassDinnerChildren(bypassDinnerChildren + 1)} className="w-8 h-8 rounded-lg bg-[#0B6E4F]/20 text-[#0B6E4F] text-sm font-black hover:bg-[#0B6E4F]/30 transition-all border border-[#0B6E4F]/40">＋</button>
                                  </div>
                                </div>
                                <button
                                  onClick={async () => {
                                    const adultQty = bypassDinnerAdults;
                                    const childQty = bypassDinnerChildren;
                                    if (adultQty <= 0 && childQty <= 0) return;
                                    const { data: inserted, error } = await supabase.from('meal_requests').insert({
                                      booking_id: sel.id,
                                      meal_date: today,
                                      meal_type: 'Dinner',
                                      adult_qty: adultQty,
                                      child_qty: childQty,
                                      status: 'Accepted',
                                      team_id: teamId,
                                      is_manual_entry: true,
                                    }).select().single();
                                    if (error) {
                                      flash('⚠ Failed to add to tab.');
                                      return;
                                    }
                                    // Optimistic add — show immediately, matches Food Prepaid's pattern
                                    setActiveMeals([...activeMeals, {
                                      meal_id: inserted.id,
                                      id: inserted.id,
                                      meal_type: inserted.meal_type,
                                      type: inserted.meal_type.toLowerCase(),
                                      adult_qty: inserted.adult_qty,
                                      child_qty: inserted.child_qty,
                                      status: 'confirmed', // matches statusMap['Accepted'] used elsewhere
                                      prepaid: false,
                                      is_paid: false,
                                      meal_date: inserted.meal_date,
                                      is_manual_entry: true,
                                    }]);
                                    setBypassDinnerAdults(0);
                                    setBypassDinnerChildren(0);
                                    flash('✓ Added directly to tab (bypassed kitchen).');
                                  }}
                                  disabled={bypassDinnerAdults <= 0 && bypassDinnerChildren <= 0}
                                  className="w-full py-2 bg-[#0B6E4F] text-[#C9A227] rounded-lg text-xs font-black uppercase tracking-widest hover:bg-[#0B6E4F]/80 transition-all disabled:opacity-50"
                                >
                                  Add to Tab
                                </button>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Transportation & Guide Services */}
                        {isStaff && (() => {
                          const transportEntries = activeServices.filter((s: any) => s.details?.name === 'Transportation');
                          const guideEntries = activeServices.filter((s: any) => s.details?.name === 'Guide Service');
                          return (
                          <div className="space-y-3">
                            <div className="bg-[#1C232E]/50 rounded-lg p-3 border border-[#2A2F36]">
                              <div className="text-[10px] font-black uppercase tracking-widest text-[#9C9384] mb-2">Transportation</div>
                              <div className="space-y-2">
                                <div className="grid grid-cols-2 gap-2">
                                  <input
                                    type="text"
                                    value={transportFrom}
                                    onChange={(e) => setTransportFrom(e.target.value)}
                                    placeholder="From"
                                    className="px-3 py-2 bg-[#1C232E] border border-[#2A2F36] rounded-lg text-sm text-[#EDE6D6] placeholder:text-[#9C9384] focus:outline-none focus:border-[#0B6E4F]"
                                  />
                                  <input
                                    type="text"
                                    value={transportTo}
                                    onChange={(e) => setTransportTo(e.target.value)}
                                    placeholder="To"
                                    className="px-3 py-2 bg-[#1C232E] border border-[#2A2F36] rounded-lg text-sm text-[#EDE6D6] placeholder:text-[#9C9384] focus:outline-none focus:border-[#0B6E4F]"
                                  />
                                </div>
                                <input
                                  type="text"
                                  value={transportDriver}
                                  onChange={(e) => setTransportDriver(e.target.value)}
                                  placeholder="Driver Name"
                                  className="w-full px-3 py-2 bg-[#1C232E] border border-[#2A2F36] rounded-lg text-sm text-[#EDE6D6] placeholder:text-[#9C9384] focus:outline-none focus:border-[#0B6E4F]"
                                />
                                <div className="flex gap-2">
                                  <input
                                    type="number"
                                    value={transportPrice}
                                    onChange={(e) => setTransportPrice(e.target.value)}
                                    placeholder="Price (USD)"
                                    className="flex-1 px-3 py-2 bg-[#1C232E] border border-[#2A2F36] rounded-lg text-sm text-[#EDE6D6] placeholder:text-[#9C9384] focus:outline-none focus:border-[#0B6E4F]"
                                  />
                                  <button
                                    onClick={async () => {
                                      if (addingTransport) return;
                                      setAddingTransport(true);
                                      try {
                                        const price = parseFloat(transportPrice);
                                        if (price <= 0) return;
                                        const { data: insertedRow, error } = await supabase.from('booking_services').insert({
                                          booking_id: sel.id,
                                          service_type: 'extra',
                                          unit_price: price,
                                          quantity: 1,
                                          currency: 'USD',
                                          details: { 
                                            name: 'Transportation',
                                            from: transportFrom,
                                            to: transportTo,
                                            driver_name: transportDriver,
                                          },
                                          team_id: teamId,
                                        }).select().single();
                                        if (error) {
                                          flash('⚠ Failed to add service.');
                                          return;
                                        }
                                        setActiveServices([...activeServices, insertedRow]);
                                        setTransportFrom('');
                                        setTransportTo('');
                                        setTransportDriver('');
                                        setTransportPrice('');
                                        flash('✓ Transportation added to tab.');
                                      } finally {
                                        setAddingTransport(false);
                                      }
                                    }}
                                    disabled={!transportFrom || !transportTo || !transportDriver || !transportPrice || parseFloat(transportPrice) <= 0 || addingTransport}
                                    className="px-4 py-2 bg-[#0B6E4F] text-[#C9A227] rounded-lg text-xs font-black uppercase tracking-widest hover:bg-[#0B6E4F]/80 transition-all disabled:opacity-50"
                                  >
                                    {addingTransport ? 'Adding...' : transportEntries.length > 0 ? '+ Add Another Transportation' : 'Add'}
                                  </button>
                                </div>
                              </div>
                              {transportEntries.length > 0 && (() => {
                                const last = transportEntries[transportEntries.length - 1];
                                return (
                                  <div className="mt-2 border-t border-[#2A2F36] pt-2">
                                    <button
                                      onClick={() => setShowTransportSummary(!showTransportSummary)}
                                      className="flex items-center justify-between w-full text-[10px] font-black uppercase tracking-widest text-[#9C9384] mb-1"
                                    >
                                      <span>Last added · {transportEntries.length} total</span>
                                      <span>{showTransportSummary ? '▲' : '▼'}</span>
                                    </button>
                                    {showTransportSummary && (
                                      <div className="bg-[#1C232E] rounded-lg px-3 py-2 space-y-0.5">
                                        <p className="text-[11px] text-[#EDE6D6] font-bold">
                                          {last.details?.from} → {last.details?.to}
                                        </p>
                                        <p className="text-[10px] text-[#9C9384]">
                                          Driver: {last.details?.driver_name}
                                        </p>
                                        <p className="text-[10px] text-[#C9A227] font-black">
                                          ${last.unit_price}
                                        </p>
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}
                              {transportEntries.length > 0 && (
                                <div className="mt-2 border-t border-[#2A2F36] pt-2">
                                  <button
                                    onClick={() => setShowTransportList(!showTransportList)}
                                    className="flex items-center justify-between w-full text-[10px] font-black uppercase tracking-widest text-[#9C9384]"
                                  >
                                    <span>{transportEntries.length} Added</span>
                                    <span>{showTransportList ? '▲' : '▼'}</span>
                                  </button>
                                  {showTransportList && (
                                    <div className="mt-2 space-y-1.5">
                                      {transportEntries.map((s: any, i: number) => (
                                        <div key={s.id ?? i} className="flex items-center justify-between text-xs text-[#EDE6D6] bg-[#1C232E] rounded-lg px-2 py-1.5">
                                          <span>{s.details?.from} → {s.details?.to} ({s.details?.driver_name})</span>
                                          <span className="font-black text-[#C9A227]">${s.unit_price}</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>

                            <div className="bg-[#1C232E]/50 rounded-lg p-3 border border-[#2A2F36]">
                              <div className="text-[10px] font-black uppercase tracking-widest text-[#9C9384] mb-2">Guide Service</div>
                              <div className="space-y-2">
                                <input
                                  type="text"
                                  value={guideName}
                                  onChange={(e) => setGuideName(e.target.value)}
                                  placeholder="Guide Name"
                                  className="w-full px-3 py-2 bg-[#1C232E] border border-[#2A2F36] rounded-lg text-sm text-[#EDE6D6] placeholder:text-[#9C9384] focus:outline-none focus:border-[#0B6E4F]"
                                />
                                <div className="flex gap-2">
                                  <select
                                    value={paxodType}
                                    onChange={(e) => setPaxodType(e.target.value as 'kichik' | 'katta' | 'both')}
                                    className="flex-1 px-3 py-2 bg-[#1C232E] border border-[#2A2F36] rounded-lg text-sm text-[#EDE6D6] focus:outline-none focus:border-[#0B6E4F]"
                                  >
                                    <option value="kichik">Kichik paxod</option>
                                    <option value="katta">Katta paxod</option>
                                    <option value="both">Both</option>
                                  </select>
                                  <input
                                    type="number"
                                    value={guidePrice}
                                    onChange={(e) => setGuidePrice(e.target.value)}
                                    placeholder="Price (USD)"
                                    className="flex-1 px-3 py-2 bg-[#1C232E] border border-[#2A2F36] rounded-lg text-sm text-[#EDE6D6] placeholder:text-[#9C9384] focus:outline-none focus:border-[#0B6E4F]"
                                  />
                                </div>
                                <button
                                  onClick={async () => {
                                    if (addingGuide) return;
                                    setAddingGuide(true);
                                    try {
                                      const basePrice = parseFloat(guidePrice);
                                      if (basePrice <= 0) return;
                                      const finalPrice = paxodType === 'both' ? basePrice * 2 : basePrice;
                                      const { data: insertedRow, error } = await supabase.from('booking_services').insert({
                                        booking_id: sel.id,
                                        service_type: 'extra',
                                        unit_price: finalPrice,
                                        quantity: 1,
                                        currency: 'USD',
                                        details: { 
                                          name: 'Guide Service',
                                          guide_name: guideName,
                                          paxod_type: paxodType,
                                        },
                                        team_id: teamId,
                                      }).select().single();
                                      if (error) {
                                        flash('⚠ Failed to add service.');
                                        return;
                                      }
                                      setActiveServices([...activeServices, insertedRow]);
                                      setGuideName('');
                                      setGuidePrice('');
                                      flash('✓ Guide Service added to tab.');
                                    } finally {
                                      setAddingGuide(false);
                                    }
                                  }}
                                  disabled={!guideName || !guidePrice || parseFloat(guidePrice) <= 0 || addingGuide}
                                  className="w-full px-4 py-2 bg-[#0B6E4F] text-[#C9A227] rounded-lg text-xs font-black uppercase tracking-widest hover:bg-[#0B6E4F]/80 transition-all disabled:opacity-50"
                                >
                                  {addingGuide ? 'Adding...' : guideEntries.length > 0 ? '+ Add Another Guide' : 'Add'}
                                </button>
                              </div>
                              {guideEntries.length > 0 && (() => {
                                const last = guideEntries[guideEntries.length - 1];
                                return (
                                  <div className="mt-2 border-t border-[#2A2F36] pt-2">
                                    <button
                                      onClick={() => setShowGuideSummary(!showGuideSummary)}
                                      className="flex items-center justify-between w-full text-[10px] font-black uppercase tracking-widest text-[#9C9384] mb-1"
                                    >
                                      <span>Last added · {guideEntries.length} total</span>
                                      <span>{showGuideSummary ? '▲' : '▼'}</span>
                                    </button>
                                    {showGuideSummary && (
                                      <div className="bg-[#1C232E] rounded-lg px-3 py-2 space-y-0.5">
                                        <p className="text-[11px] text-[#EDE6D6] font-bold">
                                          {last.details?.guide_name}
                                        </p>
                                        <p className="text-[10px] text-[#9C9384]">
                                          Tour: {last.details?.paxod_type}
                                        </p>
                                        <p className="text-[10px] text-[#C9A227] font-black">
                                          ${last.unit_price}
                                        </p>
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}
                              {guideEntries.length > 0 && (
                                <div className="mt-2 border-t border-[#2A2F36] pt-2">
                                  <button
                                    onClick={() => setShowGuideList(!showGuideList)}
                                    className="flex items-center justify-between w-full text-[10px] font-black uppercase tracking-widest text-[#9C9384]"
                                  >
                                    <span>{guideEntries.length} Added</span>
                                    <span>{showGuideList ? '▲' : '▼'}</span>
                                  </button>
                                  {showGuideList && (
                                    <div className="mt-2 space-y-1.5">
                                      {guideEntries.map((s: any, i: number) => (
                                        <div key={s.id ?? i} className="flex items-center justify-between text-xs text-[#EDE6D6] bg-[#1C232E] rounded-lg px-2 py-1.5">
                                          <span>{s.details?.guide_name} ({s.details?.paxod_type})</span>
                                          <span className="font-black text-[#C9A227]">${s.unit_price}</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                          );
                        })()}
                      </div>
                    </div>
                    );
                  })()}
                </div>
              )}

              {(canCheckOut || sel.status === 'checked_in') && isStaff && (
                <div className="border border-[#2A2F36] rounded-xl p-4 space-y-3 bg-[#1C232E]">
                  <p className="text-[10px] font-black uppercase tracking-widest text-[#9C9384]">Extra Services</p>
                  
                  {userRole === 'CEO' && (
                    <div className="space-y-2 p-3 bg-[#0B6E4F]/10 rounded-lg border border-[#0B6E4F]/30">
                      <label className="text-[10px] font-black uppercase tracking-widest text-[#0B6E4F] block mb-2">Discount (CEO Only)</label>
                      <div className="flex gap-2">
                        <input 
                          type="number" 
                          value={String(svcDiscount)} 
                          onChange={e => setSvcDiscount(parseFloat(e.target.value) || 0)}
                          placeholder="0.00"
                          className="flex-1 px-3 py-2 bg-[#1C232E] border-2 border-[#0B6E4F]/40 rounded-lg text-sm font-black text-[#EDE6D6] outline-none focus:border-[#0B6E4F]"
                        />
                        <span className="flex items-center px-2 text-xs font-bold text-[#0B6E4F]">USD</span>
                      </div>
                      <input
                        type="text"
                        value={svcDiscountReason}
                        onChange={e => setSvcDiscountReason(e.target.value)}
                        placeholder="Reason for discount"
                        className="w-full px-3 py-2 bg-[#1C232E] border-2 border-[#0B6E4F]/40 rounded-lg text-sm font-bold text-[#EDE6D6] outline-none focus:border-[#0B6E4F]"
                      />
                    </div>
                  )}
                </div>
              )}

              {isStaff && !isPOS && sel.status !== 'completed' && (() => {
                const isTab1Closed = getSettledReceiptsForSel().length > 0 || (sel.collected_amount || 0) > 0 || sel.is_prepaid || sel.is_accommodation_prepaid;
                return (
                  <div className="bg-[#0B6E4F] rounded-2xl p-5 text-[#C9A227] shadow-xl shadow-[#0B6E4F]/20 animate-in fade-in zoom-in duration-500 border border-[#0B6E4F]/40">
                    <div className="flex justify-between items-center mb-4">
                      <p className="text-[10px] font-black uppercase tracking-widest text-[#C9A227]/80">Tab Summary</p>
                      <svg className="w-5 h-5 text-[#C9A227]/60 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                    </div>
                  
                  <div className="space-y-2">
                    {(svcAmount > 0 || (isPrepaid && (sel.collected_amount || 0) === 0)) && (() => {
                      const currentMeta: any = Array.isArray(sel.meta) ? { days: sel.meta } : (sel.meta || {});
                      const lastAdjustment = parseFloat(currentMeta.last_adjustment) || 0;
                      const isExtended = lastAdjustment > 0;
                      const accKey = 'Accommodation';
                      const isExpandedState = expandedMealGroups.has(accKey);

                      return (
                        <div className="py-3 border-b border-white/10 last:border-none">
                          <div 
                            className="flex justify-between items-center cursor-pointer hover:bg-white/5 rounded-lg px-2 py-1 transition-colors"
                            onClick={() => {
                              const newExpanded = new Set(expandedMealGroups);
                              if (newExpanded.has(accKey)) {
                                newExpanded.delete(accKey);
                              } else {
                                newExpanded.add(accKey);
                              }
                              setExpandedMealGroups(newExpanded);
                            }}
                          >
                            <span className="font-bold text-sm">
                              Accommodation {isExtended && <span className="text-amber-200 ml-1 text-xs font-normal">(Extended)</span>}
                            </span>
                            <div className="flex items-center gap-2">
                              {isPrepaid && (
                                <span className="text-[9px] font-black bg-emerald-400 text-emerald-900 px-2 py-0.5 rounded-md uppercase tracking-wider">PREPAID</span>
                              )}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSvcAmount(0);
                                  setIsPrepaid(false);
                                  flash('✓ Accommodation charge cleared.');
                                }}
                                className="text-[#722F37] hover:text-[#722F37]/80 font-bold text-sm"
                              >
                                ×
                              </button>
                              <span className="font-black text-sm">${String(svcAmount.toFixed(2))}</span>
                            </div>
                          </div>
                          {isExpandedState && (
                            <div className="mt-2 pl-2 border-l-2 border-white/20 ml-2">
                              <div className="flex justify-between items-center text-sm">
                                <span className="font-medium text-slate-300">
                                  {(() => {
                                    const nights = sel.nights || (sel.check_out && sel.check_in ? Math.max(1, Math.ceil((new Date(sel.check_out).getTime() - new Date(sel.check_in).getTime()) / (1000 * 3600 * 24))) : 1);
                                    const adults = localAdults || sel?.number_of_adults || 1;
                                    const children = localChildren || sel?.number_of_children || 0;
                                    const nightlyRate = svcAmount > 0 ? (svcAmount / nights).toFixed(2) : null;

                                    return (
                                      <>
                                        Nights: {nights} × Adults: {adults}{children > 0 ? `, Children: ${children}` : ''}
                                        {nightlyRate && <span className="ml-2 opacity-60 font-normal">(${nightlyRate}/night)</span>}
                                      </>
                                    );
                                  })()}
                                </span>
                                {isPrepaid ? (
                                  <span className="text-[9px] font-black bg-emerald-400 text-emerald-900 px-2 py-0.5 rounded-md uppercase tracking-wider">PREPAID</span>
                                ) : (
                                  <span className="font-black text-sm text-slate-100">${String(svcAmount.toFixed(2))}</span>
                                )}
                              </div>
                            </div>
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
                        !o.is_paid && (
                          o.status === 'confirmed' || o.status === 'served' ||
                          (o.status === 'Pending' && o.is_manual_entry)
                        )
                      );

                      const individualMeals = acceptedOrders.map((o: any) => {
                        const adultQty = o.adult_qty || 0;
                        const childQty = o.child_qty || 0;
                        const vegAdultQty = o.veg_adults_qty || 0;
                        const vegChildQty = o.veg_children_qty || 0;

                        const adultPrice = o.type === 'lunch' ? (pricing?.lunch_price || 10) : (pricing?.dinner_price || 12);
                        const childPrice = o.type === 'lunch' ? (pricing?.lunch_child_price || 5) : (pricing?.dinner_child_price || 5);
                        const adultTotal = adultQty * adultPrice;
                        const childTotal = childQty * childPrice;

                        const mealType = o.type.charAt(0).toUpperCase() + o.type.slice(1);
                        const mealDate = o.meal_date || 'N/A';

                        const items = [];
                        if (adultQty > 0) {
                          items.push({
                            mealId: o.id,
                            mealType,
                            mealDate,
                            category: 'Adult',
                            qty: adultQty,
                            vegQty: vegAdultQty,
                            unitPrice: adultPrice,
                            price: adultTotal,
                            isManualEntry: !!o.is_manual_entry,
                          });
                        }
                        if (childQty > 0) {
                          items.push({
                            mealId: o.id,
                            mealType,
                            mealDate,
                            category: 'Child',
                            qty: childQty,
                            vegQty: vegChildQty,
                            unitPrice: childPrice,
                            price: childTotal,
                            isManualEntry: !!o.is_manual_entry,
                          });
                        }
                        return items;
                      }).flat();

                      const sItems = [
                        ...individualMeals,
                        ...activeServices.map((s: any) => {
                          const baseItem = {
                            id: s.id,
                            serviceType: s.service_type,
                            price: s.unit_price * s.quantity,
                            currency: s.currency,

                            details: s.details
                          };
                          
                          if (s.service_type === 'drinks') {
                            return { ...baseItem, name: s.details?.name || 'Drink', description: s.currency };
                          }
                          if (s.service_type === 'extra') {
                            return { ...baseItem, name: s.details?.name || 'Extra', description: '' };
                          }
                          return null;
                        }).filter(Boolean),
                        svcDiscount > 0 && { name: 'Discount', price: -svcDiscount }
                      ].filter(Boolean) as any[];

                      if (sItems.length === 0) return null;

                      // Group all meal items into a single "Food" group
                      const foodGroup = individualMeals.reduce((group: any, item: any) => {
                        group.items.push(item);
                        group.totalPrice += item.price;
                        return group;
                      }, { items: [], totalPrice: 0 });

                      // Determine if food is fully prepaid (same logic as Food Prepaid toggle)
                      const activeUnpaidMeals = activeMeals.filter((m: any) =>
                        !m.is_paid && (m.status === 'confirmed' || m.status === 'served')
                      );
                      const isFoodFullyPrepaid = activeUnpaidMeals.length > 0 &&
                        activeUnpaidMeals.every((m: any) => m.prepaid);
                      


                      const nonMealItems = sItems.filter((item: any) => !item.mealType);

                      return (
                        <>
                          {foodGroup.items.length > 0 && (() => {
                            const foodKey = 'Food';
                            const isExpanded = expandedMealGroups.has(foodKey);
                            
                            return (
                              <div className="py-3 border-b border-white/10 last:border-none">
                                <div 
                                  className="flex justify-between items-center cursor-pointer hover:bg-white/5 rounded-lg px-2 py-1 transition-colors"
                                  onClick={() => {
                                    const newExpanded = new Set(expandedMealGroups);
                                    if (newExpanded.has(foodKey)) {
                                      newExpanded.delete(foodKey);
                                    } else {
                                      newExpanded.add(foodKey);
                                    }
                                    setExpandedMealGroups(newExpanded);
                                  }}
                                >
                                  <span className="font-bold text-sm">Food</span>
                                  {isFoodFullyPrepaid ? (
                                    <span className="text-[9px] font-black bg-emerald-400 text-emerald-900 px-2 py-0.5 rounded-md uppercase tracking-wider">PREPAID</span>
                                  ) : (
                                    <span className="font-black text-sm">${foodGroup.totalPrice.toFixed(2)}</span>
                                  )}
                                </div>
                                {isExpanded && (
                                  <div className="mt-2 pl-2 border-l-2 border-white/20 ml-2">
                                    {(() => {
                                      // Group items by type and date
                                      const itemsByTypeAndDate = foodGroup.items.reduce((groups: any, item: any) => {
                                        const key = `${item.mealType}_${item.mealDate}`;
                                        if (!groups[key]) groups[key] = [];
                                        groups[key].push(item);
                                        return groups;
                                      }, {});

                                      const groups = Object.values(itemsByTypeAndDate) as any[][];
                                      return groups.map((group: any[], groupIdx: number) => {
                                        const firstItem = group[0];
                                        // safely parse YYYY-MM-DD by adding midday time to avoid UTC shift
                                        const safeDateStr = firstItem.mealDate.length === 10 && firstItem.mealDate.includes('-') 
                                          ? `${firstItem.mealDate}T12:00:00` 
                                          : firstItem.mealDate;
                                        const formattedDate = !isNaN(Date.parse(safeDateStr)) 
                                          ? new Date(safeDateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                                          : firstItem.mealDate;

                                        return (
                                          <div key={groupIdx}>
                                            <div className="mb-1 last:mb-0">
                                              <div className="font-bold text-sm mb-1.5 text-slate-200">
                                                {firstItem.mealType} — {formattedDate}
                                              </div>
                                              <div className="pl-3 border-l-2 border-white/10 space-y-1.5 mb-2">
                                                {group.map((item, itemIdx) => (
                                                  <div key={itemIdx} className="flex justify-between items-center text-sm">
                                                    <span className="font-medium text-slate-300">
                                                      Size: {item.category} <span className="ml-1 opacity-60 font-normal">{item.qty} x ${item.unitPrice.toFixed(2)}{item.vegQty > 0 ? ` (${item.vegQty} veg)` : ''}</span>
                                                    </span>
                                                    <div className="flex items-center gap-2">
                                                      {item.isManualEntry && (
                                                        <button
                                                          type="button"
                                                          onClick={async () => {
                                                            const { error } = await supabase.from('meal_requests').delete().eq('id', item.mealId);
                                                            if (error) { flash('⚠ Failed to remove item.'); return; }
                                                            setActiveMeals(activeMeals.filter((m: any) => m.id !== item.mealId));
                                                            flash('✓ Removed.');
                                                          }}
                                                          className="text-[#722F37] hover:text-[#722F37]/80 font-bold text-sm"
                                                        >
                                                          ×
                                                        </button>
                                                      )}
                                                      <span className="font-black text-sm text-slate-100">${String(item.price.toFixed(2))}</span>
                                                    </div>
                                                  </div>
                                                ))}
                                              </div>
                                            </div>
                                            {groupIdx < groups.length - 1 && (
                                              <div className="border-t border-white/10 my-2"></div>
                                            )}
                                          </div>
                                        );
                                      });
                                    })()}
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                          {nonMealItems.map((item: any, idx: number) => (
                            <div key={`nonmeal-${idx}`} className="flex justify-between items-center py-3 border-b border-white/10 last:border-none">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-sm">{item.name}</span>
                                {item.description && <span className="text-xs text-[#9C9384]">{item.description}</span>}
                              </div>
                              <div className="flex items-center gap-3">
                                <button
                                  type="button"
                                  onClick={async () => {
                                    if (!item.id) return;
                                    const { error } = await supabase
                                      .from('booking_services')
                                      .delete()
                                      .eq('id', item.id);
                                    if (error) {
                                      flash('⚠ Failed to remove service.');
                                      return;
                                    }
                                    setActiveServices(activeServices.filter((s: any) => s.id !== item.id));
                                    flash('✓ Removed.');
                                  }}
                                  className="text-[#722F37] hover:text-[#722F37]/80 font-bold text-sm"
                                >
                                  ×
                                </button>
                                <span className="font-black text-sm">${String(item.price.toFixed(2))}</span>
                              </div>
                            </div>
                          ))}
                        </>
                      );
                    })()}

                    {(() => {
                      const drinkServices = activeServices.filter((s: any) => s.service_type === 'drinks');
                      if (drinkServices.length === 0) return null;
                      const drinkTotal = drinkServices.reduce((sum: number, s: any) => sum + (s.unit_price * s.quantity), 0);
                      return (
                        <div className="flex justify-between items-center opacity-90">
                          <span className="font-bold">Drinks Tab</span>
                          <span className="font-black">${String(drinkTotal.toFixed(2))}</span>
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

                      return null; // Removed old Historical Receipts section - now using clickable Receipt History at bottom
                    })()}
                  </div>

                  <div className="mt-4 pt-4 border-t border-indigo-400 flex justify-between items-end">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <p className="text-[10px] font-black uppercase tracking-widest text-indigo-100">
                          {(gTotalWithPending ?? gTotal) > 0 ? 'Current Tab Balance' : (gTotalWithPending ?? gTotal) < 0 ? 'Refund Due to Guest' : 'Tab Settled (Zero Balance)'}
                        </p>
                        {sel.payment_status === 'paid' && (
                          <span className="font-mono text-[9px] font-black uppercase tracking-widest border border-[#2A2F36] px-2 py-0.5 bg-[#1C232E] text-[#0B6E4F]">
                            [ PAID - {svcPayList?.[0]?.method?.toUpperCase() || 'CASH'} ]
                          </span>
                        )}
                      </div>
                      <p className="text-3xl font-black tracking-tighter leading-none mb-2">
                        ${String((gTotalWithPending ?? gTotal).toFixed(2))}
                      </p>
                    </div>
                  </div>
                </div>
                );
              })()}

              {(() => {
                const hasTabItems = svcAmount > 0 || isPrepaid || activeServices.length > 0 || activeMeals.some(m => !m.is_paid && (m.status === 'confirmed' || m.status === 'served'));
                if (!isStaff || sel.status === 'completed' || (!hasTabItems && Math.abs(debtRemaining) <= 0.01)) return null;
                return (
                    <div className="bg-[#1C232E] border border-[#2A2F36] p-6 space-y-4 shadow-[4px_4px_0px_0px_rgba(92,74,46,0.3)]">
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
                            <div key={pi} className="space-y-3 p-4 bg-[#1C232E]/50 rounded-2xl border border-[#2A2F36] animate-in slide-in-from-top-2 duration-300">
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
                                    className="w-full px-4 py-3 bg-[#1C232E] border-2 border-[#2A2F36] rounded-2xl text-base font-black text-[#EDE6D6] outline-none focus:border-[#0B6E4F] transition-all shadow-sm"
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
                                        className="w-full pl-14 pr-3 py-2.5 bg-[#1C232E] border-2 border-[#2A2F36] rounded-xl text-base font-black text-[#EDE6D6] outline-none focus:border-[#0B6E4F] shadow-sm"
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
                                            : 'bg-[#1C232E] border-[#2A2F36] text-[#9C9384] hover:border-[#0B6E4F]'
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
                                      className={`w-full ${pay.currency === 'UZS' ? 'pl-11' : 'pl-8'} pr-4 py-4 bg-[#1C232E] border-2 border-[#2A2F36] rounded-3xl text-xl font-black text-[#EDE6D6] focus:border-[#0B6E4F] shadow-md`}
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
                          className="w-full py-3 border-2 border-dashed border-[#2A2F36] rounded-2xl text-[10px] font-black text-[#9C9384] uppercase tracking-widest hover:border-[#0B6E4F] hover:text-[#0B6E4F] transition-all bg-[#1C232E]/30"
                        >
                          + Add Another Currency
                        </button>

                        <div className="sticky bottom-0 left-0 right-0 p-4 bg-[#1C232E]/80 backdrop-blur-md border-t border-[#2A2F36] -mx-4 -mb-4 rounded-b-[24px] z-30 flex flex-col gap-2">
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
                              if (!isBalanceMatched && userRole !== 'CEO') {
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
                );
              })()}

              {/* FOLIO HISTORY — settled tabs (green) + active tab (indigo) */}
              {isStaff && !isPOS && sel.status !== 'completed' && (() => {
                const receipts = getSettledReceiptsForSel();
                const tabCount = receipts.length;
                if (tabCount === 0 && gTotal <= 0.01 && (sel.collected_amount || 0) === 0 && !hasPendingUnsavedServices) return null;
                return (
                  <div className="border border-[#2A2F36] rounded-2xl p-4 bg-[#1C232E]/50 space-y-3">
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
                  <div className="relative bg-[#1C232E] rounded-[32px] shadow-2xl w-full max-w-sm max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200 border border-[#2A2F36]">
                    <div ref={receiptRef}>
                      <div className="bg-[#0B6E4F] px-6 py-10 text-[#C9A227] text-center relative overflow-hidden">
                        <div className="absolute top-4 right-4 z-10">
                          <button onClick={() => setShowFinalReceipt(false)} className="text-[#C9A227]/60 hover:text-[#C9A227] transition-all text-2xl font-bold">×</button>
                        </div>
                        
                        <div className="relative z-10 flex flex-col items-center">
                          <div className="w-16 h-16 bg-[#1C232E]/20 rounded-full flex items-center justify-center mb-4 backdrop-blur-sm border border-[#2A2F36]">
                            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                          </div>
                          
                          <h3 className="text-2xl font-black uppercase tracking-tight mb-2">Final Receipt</h3>
                          
                          
                          {selectedReceipt && (
                            <div className="bg-[#1C232E]/20 backdrop-blur-md border border-[#2A2F36] rounded-lg px-3 py-1.5 text-[9px] font-black uppercase tracking-widest">
                              Settled: {new Date(selectedReceipt.settled_at || selectedReceipt.date || Date.now()).toLocaleString()}
                            </div>
                          )}
                        </div>
                      </div>

                    <div className="p-6 space-y-6">
                      <div className="space-y-4">
                        <div className="pb-4 border-b border-[#2A2F36]">
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
                                  <span className="text-slate-400 font-medium">Accommodation ×1</span>
                                  {selectedReceipt.items?.isPrepaid ? (
                                    <span className="text-[10px] font-black bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded uppercase tracking-wider">PREPAID</span>
                                  ) : (
                                    <span className="text-slate-500 font-bold">${String((selectedReceipt.items.accommodation || 0).toFixed(2))}</span>
                                  )}
                                </div>
                              )}
                              
                              {(() => {
                                const meals = selectedReceipt.items?.meals || {};
                                return Object.entries(meals).map(([type, count]: [string, any]) => {
                                  if (type.startsWith('is') || type === 'mealDetails' || type === 'lunchCharged' || type === 'dinnerCharged' || !count) return null;
                                  const isMealPrepaid = false;
                                  const price = type === 'lunch' ? (pricing?.lunch_price || 10) : (pricing?.dinner_price || 10);
                                  const charged = type === 'lunch' ? meals.lunchCharged : meals.dinnerCharged;
                                  const displayPrice = charged !== undefined ? charged : (count * price);
                                  return (
                                    <div key={type} className="flex justify-between items-center text-sm">
                                      <span className="text-slate-400 font-medium capitalize">{type} ×{String(count)}</span>
                                      {isMealPrepaid ? (
                                        <span className="text-[9px] font-black bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded uppercase tracking-wider">PREPAID</span>
                                      ) : (
                                        <span className="text-slate-500 font-bold">${String(displayPrice.toFixed(2))}</span>
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
                                  <span className="text-slate-500 font-bold">${String(selectedReceipt.items.drinks.reduce((s: number, d: any) => s + (d.price * d.quantity), 0).toFixed(2))}</span>
                                </div>
                              )}

                              <div className="flex justify-between items-center pt-4 border-t border-slate-100 mt-2">
                                <span className="text-base font-black text-slate-400">Tab Total</span>
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
                                onClick={handleSaveServices}
                                disabled={loadingAction === 'saveservices'}
                                className="text-[10px] font-black text-emerald-600 hover:text-emerald-700 flex items-center gap-1 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-100 transition-all active:scale-95 disabled:opacity-50"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
                                {loadingAction === 'save' ? 'SAVING...' : 'SAVE CHOICES'}
                              </button>
                            </div>
                            <div className="space-y-3 bg-[#1C232E]/50 rounded-2xl p-4 border border-[#2A2F36]">
                              {(svcAmount > 0 || (isPrepaid && (sel.collected_amount || 0) === 0)) && (
                                <div className="flex justify-between items-center text-sm">
                                  <span className="text-slate-400 font-medium">Accommodation ×1</span>
                                  {isPrepaid && (sel.collected_amount || 0) === 0 ? (
                                    <span className="text-[10px] font-black bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded uppercase tracking-wider">PREPAID</span>
                                  ) : (
                                    <span className="text-slate-500 font-bold">${String(svcAmount.toFixed(2))}</span>
                                  )}
                                </div>
                              )}
                              
                              {(() => {
                                // Calculate meal totals from activeMeals (Single Source of Truth)
                                const unpaidMeals = activeMeals.filter(m => 
                                  !m.is_paid && (m.status === 'confirmed' || m.status === 'served')
                                );
                                
                                const lunchMeals = unpaidMeals.filter(m => m.meal_type === 'Lunch');
                                const lunchAdultQty = lunchMeals.reduce((sum, m) => sum + (m.adult_qty || 0), 0);
                                const lunchChildQty = lunchMeals.reduce((sum, m) => sum + (m.child_qty || 0), 0);
                                const lunchTotalQty = lunchAdultQty + lunchChildQty;
                                const dinnerMeals = unpaidMeals.filter(m => m.meal_type === 'Dinner');
                                const dinnerAdultQty = dinnerMeals.reduce((sum, m) => sum + (m.adult_qty || 0), 0);
                                const dinnerChildQty = dinnerMeals.reduce((sum, m) => sum + (m.child_qty || 0), 0);
                                const dinnerTotalQty = dinnerAdultQty + dinnerChildQty;
                                
                                const items = [
                                  lunchTotalQty > 0 && { name: 'Lunch', count: lunchTotalQty, adultQty: lunchAdultQty, childQty: lunchChildQty, price: pricing.lunch_price, childPrice: pricing.lunch_child_price },
                                  dinnerTotalQty > 0 && { name: 'Dinner', count: dinnerTotalQty, adultQty: dinnerAdultQty, childQty: dinnerChildQty, price: pricing.dinner_price, childPrice: pricing.dinner_child_price },
                                  svcDiscount > 0 && { name: 'Discount', price: -svcDiscount }
                                ].filter(Boolean) as any[];

                                return items.map((item, i) => (
                                  <div key={i} className="flex justify-between items-center text-sm">
                                    <span className="text-slate-400 font-medium">{item.name} {item.count ? `×${item.count}` : ''}</span>
                                    <span className="text-slate-500 font-bold">${String((item.adultQty !== undefined ? ((item.adultQty * item.price) + (item.childQty * item.childPrice)) : (item.count ? item.count * item.price : item.price)).toFixed(2))}</span>
                                  </div>
                                ));
                              })()}

                              {(() => {
                                const drinkServices = activeServices.filter((s: any) => s.service_type === 'drinks');
                                const extraServices = activeServices.filter((s: any) => s.service_type === 'extra');
                                
                                if (drinkServices.length === 0 && extraServices.length === 0) return null;
                                
                                return (
                                  <>
                                    {drinkServices.map((s: any) => (
                                      <div key={s.id} className="flex justify-between items-center text-sm">
                                        <span className="text-slate-400 font-medium">{s.details?.name || 'Drink'} ({s.currency})</span>
                                        {s.is_paid ? (
                                          <span className="text-[9px] font-black bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded uppercase tracking-wider">PREPAID</span>
                                        ) : (
                                          <span className="text-slate-500 font-bold">${String((s.unit_price * s.quantity).toFixed(2))}</span>
                                        )}
                                      </div>
                                    ))}
                                    {extraServices.map((s: any) => (
                                      <div key={s.id} className="flex justify-between items-center text-sm">
                                        <span className="text-slate-400 font-medium">{s.details?.name || 'Extra'}</span>
                                        {s.is_paid ? (
                                          <span className="text-[9px] font-black bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded uppercase tracking-wider">PREPAID</span>
                                        ) : (
                                          <span className="text-slate-500 font-bold">${String((s.unit_price * s.quantity).toFixed(2))}</span>
                                        )}
                                      </div>
                                    ))}
                                  </>
                                );
                              })()}

                              <div className="flex justify-between items-center pt-3 border-t border-slate-200 mt-1">
                                <span className="text-sm font-black text-slate-400">Current Total</span>
                                <span className="text-base font-black text-[#6366f1]">${String((gTotalWithPending ?? gTotal).toFixed(2))}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {(() => {
                        const hasTabItems = svcAmount > 0 || isPrepaid || activeServices.length > 0 || 
                          activeMeals.some(m => !m.is_paid && (m.status === 'confirmed' || m.status === 'served'));
                        if (!hasTabItems) return null;
                        return (
                      <div className="space-y-4">
                        <button 
                            onClick={async () => {
                              if (finalizeTab) {
                                setLoadingAction('finalize');
                                try {
                                  const ok = await finalizeTab();
                                  if (ok) {
                                    // Auto-select the newly created receipt
                                    const receipts = getSettledReceiptsForSel();
                                    if (receipts.length > 0) {
                                      setSelectedReceipt(receipts[receipts.length - 1]);
                                    }
                                    setShowFinalReceipt(false);
                                  }
                                } catch (error) {
                                  console.error('Failed to finalize tab:', error);
                                  flash('⚠ Error finalizing tab');
                                } finally {
                                  setLoadingAction('');
                                }
                              }
                            }}
                            disabled={loadingAction === 'finalize' || (!isBalanceMatched && gTotal > 0)}
                            className={`w-full py-4 rounded-2xl font-black uppercase text-[11px] tracking-widest transition-all shadow-lg active:scale-95 ${(isBalanceMatched || gTotal === 0) ? 'bg-[#0B6E4F] text-[#C9A227] shadow-[#0B6E4F]/30 hover:bg-[#0B6E4F]/80' : 'bg-[#1C232E]/50 text-[#9C9384] cursor-not-allowed'}`}
                          >
                            {loadingAction === 'finalize' ? 'PROCESSING...' : gTotal === 0 ? 'SAVE RECEIPT' : isBalanceMatched ? 'SETTLE & CLOSE TAB' : 'BALANCE MISMATCH'}
                          </button>
                      </div>
                        );
                      })()}
                    </div>
                  </div>

                  <div className="p-6 pt-0 flex gap-3 no-print">
                    <button 
                      onClick={handleSaveAsImage}
                      disabled={loadingAction === 'exporting'}
                      className="flex-1 py-4 bg-[#1C232E]/50 hover:bg-[#2A1518] text-[#9C9384] rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2 border border-[#2A2F36]"
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
                      <h3 className="text-xl font-black text-black uppercase tracking-tighter mt-1">Receipt History</h3>
                    </div>
                  </div>
                  <div className="grid gap-2">
                    {getSettledReceiptsForSel().map((receipt: any, idx: number) => {
                      const isExpanded = expandedReceiptId === receipt.id;
                      return (
                        <div key={idx} className={`border border-[#2A2F36] group ${parseFloat(receipt.total_usd || 0) < 0 ? 'bg-[#722F37]/10 border-[#722F37]/30' : 'bg-[#1C232E]'} rounded-lg overflow-hidden`}>
                          <div 
                            className="p-4 cursor-pointer hover:bg-white/5 transition-colors"
                            onClick={() => setExpandedReceiptId(isExpanded ? null : receipt.id)}
                          >
                            <div className="flex justify-between items-start mb-2 border-b border-[#2A2F36] pb-2">
                              <div className="flex flex-col">
                                <span className="text-[10px] font-black text-[#9C9384] uppercase tracking-widest">
                                  {parseFloat(receipt.total_usd || 0) < 0 ? 'Settled Refund' : `Tab #${idx + 1}`}
                                </span>
                                <span className="font-mono text-[10px] text-black font-black mt-0.5">{new Date(receipt.settled_at || new Date()).toLocaleString()}</span>
                                <span className="text-[9px] font-mono text-slate-400 mt-0.5">{receipt.receipt_id || receipt.id}</span>
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
                                 <span className="text-[8px] font-mono font-black uppercase bg-[#1C232E]/50 border border-[#2A2F36] px-1.5 py-0.5 text-[#EDE6D6]">Stay: ${receipt.items.accommodation.toFixed(2)}</span>
                               )}
                               {receipt.items?.meals?.lunch > 0 && (
                                 <span className="text-[8px] font-mono font-black uppercase bg-[#1C232E]/50 border border-[#2A2F36] px-1.5 py-0.5 text-[#EDE6D6]">Lunch x{receipt.items.meals.lunch}</span>
                               )}
                               {receipt.items?.meals?.dinner > 0 && (
                                 <span className="text-[8px] font-mono font-black uppercase bg-[#1C232E]/50 border border-[#2A2F36] px-1.5 py-0.5 text-[#EDE6D6]">Dinner x{receipt.items.meals.dinner}</span>
                               )}
                               {receipt.items?.drinks?.length > 0 && (
                                 <span className="text-[8px] font-mono font-black uppercase bg-[#1C232E]/50 border border-[#2A2F36] px-1.5 py-0.5 text-[#EDE6D6]">Drinks</span>
                               )}
                               {receipt.items?.extras?.length > 0 && (
                                 <span className="text-[8px] font-mono font-black uppercase bg-[#1C232E]/50 border border-[#2A2F36] px-1.5 py-0.5 text-[#EDE6D6]">Extras</span>
                               )}
                            </div>
                          </div>
                          {isExpanded && receipt.snapshot && (
                            <div className="p-4 border-t border-[#2A2F36] bg-black/20 space-y-3">
                              <div className="space-y-2">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Receipt Snapshot</p>
                                
                                {receipt.snapshot.items?.accommodation !== undefined && (
                                  <div className="flex justify-between items-center py-2 border-b border-white/10">
                                    <span className="text-sm font-bold">Accommodation</span>
                                    <div className="flex items-center gap-2">
                                      {receipt.snapshot.items.isPrepaid && (
                                        <span className="text-[9px] font-black bg-emerald-400 text-emerald-900 px-2 py-0.5 rounded-md uppercase tracking-wider">Prepaid</span>
                                      )}
                                      <span className="font-mono font-black">${receipt.snapshot.items.accommodation.toFixed(2)}</span>
                                    </div>
                                  </div>
                                )}
                                
                                {receipt.snapshot.items?.meals && (
                                  <div className="space-y-2 py-2 border-b border-white/10">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Meals</p>
                                    {(() => {
                                      const { lineItems } = buildReceiptLineItems(receipt.snapshot, pricing, receipt.total, receipt.id);
                                      return lineItems
                                        .filter(item => item.label.includes('Lunch') || item.label.includes('Dinner'))
                                        .map((item, idx) => (
                                          <div key={idx} className="flex justify-between items-center">
                                            <span className="text-sm font-bold">{item.label}</span>
                                            <div className="flex items-center gap-2">
                                              <span className="font-mono font-black">${item.amount.toFixed(2)}</span>
                                            </div>
                                          </div>
                                        ));
                                    })()}
                                  </div>
                                )}
                                
                                {receipt.snapshot.items?.services && (
                                  <div className="space-y-2 py-2 border-b border-white/10">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Services</p>
                                  </div>
                                )}
                                
                                {receipt.snapshot.items?.extras && receipt.snapshot.items.extras.length > 0 && (
                                  <div className="space-y-2 py-2 border-b border-white/10">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Extras</p>
                                    {receipt.snapshot.items.extras.map((extra: any, i: number) => (
                                      <div key={i} className="flex justify-between items-center">
                                        <span className="text-sm font-bold">{extra.name}</span>
                                        <span className="font-mono font-black">${parseFloat(extra.price).toFixed(2)}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                
                                {receipt.snapshot.items?.drinks && receipt.snapshot.items.drinks.length > 0 && (
                                  <div className="space-y-2 py-2 border-b border-white/10">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Drinks</p>
                                    {receipt.snapshot.items.drinks.map((drink: any, i: number) => (
                                      <div key={i} className="flex justify-between items-center">
                                        <span className="text-sm font-bold">{drink.drink_name} x{drink.quantity}</span>
                                        <span className="font-mono font-black">${(drink.price * drink.quantity).toFixed(2)}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                
                                {receipt.snapshot.items?.stay_adjustment > 0 && (
                                  <div className="flex justify-between items-center py-2 border-b border-white/10">
                                    <span className="text-sm font-bold">Stay Extension Fee</span>
                                    <span className="font-mono font-black text-amber-300">+${receipt.snapshot.items.stay_adjustment.toFixed(2)}</span>
                                  </div>
                                )}
                                
                                {receipt.snapshot.payments && receipt.snapshot.payments.length > 0 && (
                                  <div className="space-y-2 py-2">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Payments</p>
                                    {receipt.snapshot.payments.map((payment: any, i: number) => (
                                      <div key={i} className="flex justify-between items-center">
                                        <span className="text-sm font-bold">{payment.method}</span>
                                        <span className="font-mono font-black">${parseFloat(payment.amount).toFixed(2)}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                
                                <div className="flex justify-between items-center py-2 border-t border-white/20 mt-2">
                                  <span className="text-sm font-black uppercase tracking-widest">Total</span>
                                  <span className="font-mono font-black text-lg">${parseFloat(receipt.total_usd || 0).toFixed(2)}</span>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
        </div>
      </div>

      {valError && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setValError(null)} />
          <div className="relative bg-[#1C232E] rounded-[32px] shadow-2xl w-full max-w-sm overflow-hidden p-8 space-y-6 text-center border border-[#2A2F36]">
            <h3 className="text-2xl font-black uppercase tracking-tight text-[#722F37]">Checkout Blocked</h3>
            <p className="text-[#9C9384] text-sm font-medium leading-relaxed">{String(valError)}</p>
            <button onClick={() => setValError(null)} className="w-full py-4 bg-[#0B6E4F] text-[#C9A227] rounded-2xl font-black uppercase hover:bg-[#0B6E4F]/80 transition-all border border-[#0B6E4F]/40">I Understand</button>
          </div>
        </div>
      )}

      {props.checkoutBlockReason && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" onClick={() => props.setCheckoutBlockReason?.(null)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative bg-[#1C232E] border border-[#2A2F36] rounded-2xl p-6 shadow-xl w-full max-w-sm animate-in fade-in zoom-in-95" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-3">
              <span className="text-2xl">⚠</span>
              <p className="text-sm font-black text-[#EDE6D6] uppercase tracking-wide">Cannot Check Out</p>
            </div>
            <p className="text-sm text-[#9C9384] mb-5">{props.checkoutBlockReason}</p>
            <button
              onClick={() => props.setCheckoutBlockReason?.(null)}
              className="w-full py-3 bg-[#0B6E4F] text-[#C9A227] font-black uppercase text-[11px] tracking-widest rounded-xl hover:bg-[#0B6E4F]/80 transition-all"
            >
              OK
            </button>
          </div>
        </div>
      )}
    </>
  );
}



