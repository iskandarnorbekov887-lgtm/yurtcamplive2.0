'use client';
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { formatSpace } from '@/utils/calendar-logic';
import { LockedBookingPanel } from '@/components/LockedBookingPanel';
import * as htmlToImage from 'html-to-image';

// ============================================================================
// SECTION A: Props Interface and Local State
// ============================================================================

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
  
  // Service state (lifted from parent - keeping for compatibility)
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
  isFoodPrepaid: boolean;
  setIsFoodPrepaid: (v: boolean) => void;
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
  svcDiscountReason: string;
  setSvcDiscountReason: (v: string) => void;
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
  handleSaveServices?: () => Promise<void>;
  handleCreateFromEvent: (doCheckIn: boolean) => Promise<void>;
  fetchCbuRate: (curr: any) => Promise<void>;
  
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
  activeServices: any[];
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
    isPrepaid, setIsPrepaid, isLunchPrepaid, setIsLunchPrepaid, isDinnerPrepaid, setIsDinnerPrepaid, isFoodPrepaid, setIsFoodPrepaid,
    svcLunch, setSvcLunch, svcLunchCount, setSvcLunchCount, svcDinner, setSvcDinner, svcDinnerCount, setSvcDinnerCount,
    svcGuide, setSvcGuide, svcGuidePrice, setSvcGuidePrice, svcGuideNames, setSvcGuideNames,
    svcTransport, setSvcTransport, svcTransList, setSvcTransList,
    svcDiscount, setSvcDiscount, svcDiscountReason, setSvcDiscountReason, svcPayList, setSvcPayList,
    showDrinks, setShowDrinks, drinks, selectedDrinks, setSelectedDrinks,
    extraServices, setExtraServices, newExtraName, setNewExtraName, newExtraPrice, setNewExtraPrice,
    showServices, setShowServices, showNotes, setShowNotes, showFinalReceipt, setShowFinalReceipt,
    selectedReceipt, setSelectedReceipt, editingDates, setEditingDates,
    editCheckIn, setEditCheckIn, editCheckOut, setEditCheckOut, dateAdjAmount, setDateAdjAmount,
    valError, setValError, getSettledReceiptsForSel, handleCheckIn, handleCheckOut, handleCancel,
    handleSaveServices,
    fetchCbuRate, gTotal, gTotalWithPending, hasPendingUnsavedServices, debtRemaining, tPaidUsd, isBalanceMatched, today,
    dayEntries, finalizeTab, activeMeals, activeServices
  } = props;

  const isStaff = userRole === 'Manager' || userRole === 'CEO';
  const sel = selectedItem?.booking;

  // ============================================================================
  // LOCAL STATE (not lifted from parent)
  // ============================================================================

  const [localAdults, setLocalAdults] = useState<number | null>(null);
  const [localChildren, setLocalChildren] = useState<number | null>(null);
  const [loadingGuestCounts, setLoadingGuestCounts] = useState(false);
  const [adultsChildrenLocked, setAdultsChildrenLocked] = useState(false);

  // Meal request modal state
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

  // Refs
  const receiptRef = useRef<HTMLDivElement>(null);

  // ============================================================================
  // DATA FETCHING WITH STALENESS GUARDS
  // ============================================================================

  // Fetch guest counts with staleness guard
  useEffect(() => {
    if (!sel?.id) return;

    const fetchedForId = sel.id;
    setLoadingGuestCounts(true);
    
    supabase.from('bookings')
      .select('number_of_adults, number_of_children, guest_count_confirmed')
      .eq('id', sel.id)
      .single()
      .then(({ data, error }) => {
        // Staleness guard: discard if booking changed
        if (sel?.id !== fetchedForId) return;
        
        if (!error && data) {
          setLocalAdults(data.number_of_adults);
          setLocalChildren(data.number_of_children);
          setAdultsChildrenLocked(data.guest_count_confirmed === true);
        }
        setLoadingGuestCounts(false);
      });
  }, [sel?.id]);

  // Pre-fill meal counts from meal_requests when booking changes
  useEffect(() => {
    if (!sel?.id) return;

    const fetchedForId = sel.id;
    
    supabase
      .from('meal_requests')
      .select('meal_type, status')
      .eq('booking_id', sel.id)
      .then(({ data, error }) => {
        // Staleness guard: discard if booking changed
        if (sel?.id !== fetchedForId) return;
        
        if (!error && data) {
          const lunchCount = data.filter(m => m.meal_type === 'Lunch').length;
          const dinnerCount = data.filter(m => m.meal_type === 'Dinner').length;
          setSvcLunchCount(lunchCount);
          setSvcDinnerCount(dinnerCount);
          setSvcLunch(lunchCount > 0);
          setSvcDinner(dinnerCount > 0);
        }
      });
  }, [sel?.id, setSvcLunchCount, setSvcDinnerCount, setSvcLunch, setSvcDinner]);

  // Pre-fill meal request quantities when modal opens
  useEffect(() => {
    if (showMealRequestModal && sel) {
      setMealRequestAdultQty(sel.number_of_adults || 1);
      setMealRequestChildQty(sel.number_of_children || 0);
      setMealRequestAdultVegQty(lastVegSplit.adultVeg);
      setMealRequestChildVegQty(lastVegSplit.childVeg);
      setMealRequestDate(new Date().toISOString().split('T')[0]);
    } else if (!showMealRequestModal) {
      setMealRequestDate('');
    }
  }, [showMealRequestModal, sel, lastVegSplit]);

  // ============================================================================
  // DERIVED VALUES
  // ============================================================================

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
  const isDayGuest = isPOS || (currentMeta.guest_category === 'local' && currentMeta.local_stay_type === 'day');
  const isRoomStay = currentMeta.guest_category === 'international' || currentMeta.guest_category === 'camper';

  const daysUntilCheckIn = sel
    ? Math.ceil((new Date(sel.check_in + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime()) / 86400000)
    : 999;
  const daysUntilCheckOut = sel
    ? Math.ceil((new Date(sel.check_out + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime()) / 86400000)
    : 999;

  const canCheckIn = sel?.status === 'confirmed' && daysUntilCheckIn <= 2 && !!onCheckIn && !isDayGuest;
  const isComingSoon = sel?.status === 'confirmed' && daysUntilCheckIn > 2 && !isDayGuest;
  const canCheckOut = (sel?.status === 'checked_in') && daysUntilCheckOut <= 1 && !!onCheckOut && !isDayGuest;
  const canCancel = sel && ['confirmed', 'pending'].includes(sel.status) && !!onCancelBooking && !isDayGuest;

  const getBookingTypeInfo = () => {
    if (!sel) return null;
    const category = currentMeta.guest_category || '';
    if (category === 'pool') return { prefix: '🏊', message: 'Instant POS: Settled in UZS' };
    if (category === 'local') return { prefix: '🏠', message: 'Instant POS: Settled in UZS' };
    return { prefix: '', message: 'Standard Stay Booking' };
  };

  const typeInfo = getBookingTypeInfo();

  // ============================================================================
  // SECTION B: UNIFIED TAB CALCULATION MODULE
  // ============================================================================

  interface TabItem {
    name: string;
    description: string;
    price: number;
    isPrepaid: boolean;
    paid: boolean;
    mealId?: number;
    serviceId?: number;
    mealType?: string;
    mealDate?: string;
    category?: string;
    qty?: number;
    unitPrice?: number;
    adultQty?: number;
    childQty?: number;
    adultPrice?: number;
    childPrice?: number;
    vegQty?: number;
  }

  interface TabCalculationResult {
    accommodationTotal: number;
    extensionFee: number;
    mealDebt: number;
    serviceDebt: number;
    discountAmount: number;
    grandTotal: number;
    amountPaid: number;
    balanceRemaining: number;
    items: TabItem[];
  }

  const calculateTabTotals = useCallback((
    meals: any[],
    accommodationAmount: number,
    isAccommodationPrepaid: boolean,
    isLunchPrepaid: boolean,
    isDinnerPrepaid: boolean,
    isFoodPrepaid: boolean,
    services: any[],
    dateAdjustment: number,
    discount: number,
    pricingConfig: any
  ): TabCalculationResult => {
    const items: TabItem[] = [];

    // 1. Accommodation
    const accommodationTotal = isAccommodationPrepaid ? 0 : accommodationAmount;
    if (accommodationAmount > 0 || isAccommodationPrepaid) {
      items.push({
        name: 'Accommodation',
        description: `${localAdults || sel?.number_of_adults || 1} adult${(localAdults || sel?.number_of_adults || 1) > 1 ? 's' : ''}${(localChildren || sel?.number_of_children) ? `, ${localChildren || sel?.number_of_children} child${(localChildren || sel?.number_of_children) > 1 ? 'ren' : ''}` : ''}`,
        price: accommodationTotal,
        isPrepaid: isAccommodationPrepaid,
        paid: isAccommodationPrepaid
      });
    }

    // 2. Extension Fee
    const extensionFee = dateAdjustment > 0 ? dateAdjustment : 0;
    if (extensionFee > 0) {
      items.push({
        name: 'Stay Extension Fee',
        description: 'Reason: Additional nights added',
        price: extensionFee,
        isPrepaid: false,
        paid: false
      });
    }

    // 3. Meals (using remapped lowercase status values from syncKitchen)
    const unpaidMeals = meals.filter(m => 
      !m.is_paid && (m.status === 'confirmed' || m.status === 'served')
    );

    let mealDebt = 0;

    const lunchMeals = unpaidMeals.filter(m => m.meal_type === 'Lunch');
    const lunchAdultQty = lunchMeals.reduce((sum, m) => sum + (m.adult_qty || 0), 0);
    const lunchChildQty = lunchMeals.reduce((sum, m) => sum + (m.child_qty || 0), 0);
    const lunchTotalQty = lunchAdultQty + lunchChildQty;
    
    if (lunchTotalQty > 0) {
      const lunchPrepaid = isLunchPrepaid || isFoodPrepaid;
      const lunchAdultPrice = pricingConfig?.lunch_price || 10;
      const lunchChildPrice = pricingConfig?.lunch_child_price || 5;
      const lunchTotalPrice = (lunchAdultQty * lunchAdultPrice) + (lunchChildQty * lunchChildPrice);
      
      if (!lunchPrepaid) {
        mealDebt += lunchTotalPrice;
        items.push({
          name: 'Lunch',
          description: `×${lunchTotalQty}`,
          price: lunchTotalPrice,
          isPrepaid: lunchPrepaid,
          paid: lunchPrepaid,
          mealType: 'Lunch'
        });
      }
    }

    const dinnerMeals = unpaidMeals.filter(m => m.meal_type === 'Dinner');
    const dinnerAdultQty = dinnerMeals.reduce((sum, m) => sum + (m.adult_qty || 0), 0);
    const dinnerChildQty = dinnerMeals.reduce((sum, m) => sum + (m.child_qty || 0), 0);
    const dinnerTotalQty = dinnerAdultQty + dinnerChildQty;
    
    if (dinnerTotalQty > 0) {
      const dinnerPrepaid = isDinnerPrepaid || isFoodPrepaid;
      const dinnerAdultPrice = pricingConfig?.dinner_price || 10;
      const dinnerChildPrice = pricingConfig?.dinner_child_price || 5;
      const dinnerTotalPrice = (dinnerAdultQty * dinnerAdultPrice) + (dinnerChildQty * dinnerChildPrice);
      
      if (!dinnerPrepaid) {
        mealDebt += dinnerTotalPrice;
        items.push({
          name: 'Dinner',
          description: `×${dinnerTotalQty}`,
          price: dinnerTotalPrice,
          isPrepaid: dinnerPrepaid,
          paid: dinnerPrepaid,
          mealType: 'Dinner'
        });
      }
    }

    // 4. Services (guide, transport, drinks, extras)
    let serviceDebt = 0;

    services.forEach((s: any) => {
      const price = s.unit_price * s.quantity;
      const isPrepaid = s.is_paid;
      
      if (!isPrepaid) {
        serviceDebt += price;
      }

      if (s.service_type === 'guide') {
        items.push({
          name: 'Guide Service',
          description: s.details?.names || '1 guide',
          price,
          isPrepaid,
          paid: isPrepaid,
          serviceId: s.id
        });
      } else if (s.service_type === 'transportation') {
        items.push({
          name: 'Transport',
          description: s.details?.name || s.details?.destination || '',
          price,
          isPrepaid,
          paid: isPrepaid,
          serviceId: s.id
        });
      } else if (s.service_type === 'drinks') {
        items.push({
          name: s.details?.name || 'Drink',
          description: `${s.currency}`,
          price,
          isPrepaid,
          paid: isPrepaid,
          serviceId: s.id
        });
      } else if (s.service_type === 'extra') {
        items.push({
          name: s.details?.name || 'Extra',
          description: '',
          price,
          isPrepaid,
          paid: isPrepaid,
          serviceId: s.id
        });
      }
    });

    // 5. Discount
    const discountAmount = discount > 0 ? discount : 0;
    if (discountAmount > 0) {
      items.push({
        name: 'Discount',
        description: '',
        price: -discountAmount,
        isPrepaid: false,
        paid: false
      });
    }

    // 6. Calculate totals
    const grandTotal = accommodationTotal + extensionFee + mealDebt + serviceDebt - discountAmount;
    const amountPaid = sel?.collected_amount || 0;
    const balanceRemaining = grandTotal - amountPaid;

    return {
      accommodationTotal,
      extensionFee,
      mealDebt,
      serviceDebt,
      discountAmount,
      grandTotal,
      amountPaid,
      balanceRemaining,
      items
    };
  }, [localAdults, localChildren, sel?.number_of_adults, sel?.number_of_children, sel?.collected_amount]);

  // Use the unified calculation for receipt items
  const tabTotals = useMemo(() => {
    if (selectedReceipt) {
      // For settled receipts, use the stored items directly
      const items: TabItem[] = [];
      if ((selectedReceipt.items?.accommodation || 0) > 0 || selectedReceipt.items?.isPrepaid) {
        items.push({ name: 'Accommodation', description: `${sel?.number_of_adults || 1} adult${(sel?.number_of_adults || 1) > 1 ? 's' : ''}${sel?.number_of_children ? `, ${sel?.number_of_children} child${(sel?.number_of_children || 0) > 1 ? 'ren' : ''}` : ''}`, price: selectedReceipt.items?.isPrepaid ? 0 : (selectedReceipt.items.accommodation || 0), isPrepaid: selectedReceipt.items?.isPrepaid, paid: true });
      }
      const meals = selectedReceipt.items?.meals || {};
      Object.entries(meals).forEach(([type, count]: [string, any]) => {
        if (type.startsWith('is') || !count) return;
        const isMealPrepaid = type === 'lunch' ? meals.isLunchPrepaid : meals.isDinnerPrepaid;
        const price = type === 'lunch' ? (pricing?.lunch_price || 10) : (pricing?.dinner_price || 10);
        items.push({ name: type.charAt(0).toUpperCase() + type.slice(1), description: `×${count}`, price: isMealPrepaid ? 0 : (count * price), isPrepaid: isMealPrepaid, paid: true });
      });
      const svcs = selectedReceipt.items?.services || {};
      Object.entries(svcs).forEach(([name, price]: [string, any]) => {
        if (!price) return;
        items.push({ name: name.charAt(0).toUpperCase() + name.slice(1), description: '', price: price, isPrepaid: false, paid: true });
      });
      if (selectedReceipt.items?.stay_adjustment > 0) {
        items.push({ name: 'Stay Extension Fee', description: '', price: selectedReceipt.items.stay_adjustment, isPrepaid: false, paid: true });
      }
      if (selectedReceipt.items?.drinks?.length > 0) {
        const drinksTotal = selectedReceipt.items.drinks.reduce((s: number, d: any) => s + (d.price * d.quantity), 0);
        items.push({ name: 'Drinks', description: `${selectedReceipt.items.drinks.length} item${selectedReceipt.items.drinks.length > 1 ? 's' : ''}`, price: drinksTotal, isPrepaid: false, paid: true });
      }
      return { items, grandTotal: items.reduce((sum, i) => sum + i.price, 0), accommodationTotal: 0, extensionFee: 0, mealDebt: 0, serviceDebt: 0, discountAmount: 0, amountPaid: sel?.collected_amount || 0, balanceRemaining: 0 };
    } else {
      // For pending tabs, use the unified calculation
      return calculateTabTotals(
        activeMeals,
        svcAmount,
        isPrepaid,
        isLunchPrepaid,
        isDinnerPrepaid,
        isFoodPrepaid,
        activeServices,
        svcDateAdjustment,
        svcDiscount,
        pricing
      );
    }
  }, [selectedReceipt, sel, pricing, activeMeals, svcAmount, isPrepaid, isLunchPrepaid, isDinnerPrepaid, isFoodPrepaid, activeServices, svcDateAdjustment, svcDiscount, calculateTabTotals]);

  // ============================================================================
  // RECEIPT ITEMS CALCULATION (using unified tabTotals)
  // ============================================================================

  const receiptItems = useMemo(() => {
    if (!sel) return [];
    if (selectedReceipt) {
      const items: any[] = [];
      if ((selectedReceipt.items?.accommodation || 0) > 0 || selectedReceipt.items?.isPrepaid) {
        items.push({ name: 'Accommodation', description: `${sel?.number_of_adults || 1} adult${(sel?.number_of_adults || 1) > 1 ? 's' : ''}${sel?.number_of_children ? `, ${sel?.number_of_children} child${(sel?.number_of_children || 0) > 1 ? 'ren' : ''}` : ''}`, price: selectedReceipt.items?.isPrepaid ? 0 : (selectedReceipt.items.accommodation || 0), isPrepaid: selectedReceipt.items?.isPrepaid, paid: true });
      }
      const meals = selectedReceipt.items?.meals || {};
      Object.entries(meals).forEach(([type, count]: [string, any]) => {
        if (type.startsWith('is') || !count) return;
        const isMealPrepaid = type === 'lunch' ? meals.isLunchPrepaid : meals.isDinnerPrepaid;
        const price = type === 'lunch' ? (pricing?.lunch_price || 10) : (pricing?.dinner_price || 10);
        items.push({ name: type.charAt(0).toUpperCase() + type.slice(1), description: `×${count}`, price: isMealPrepaid ? 0 : (count * price), isPrepaid: isMealPrepaid, paid: true });
      });
      const svcs = selectedReceipt.items?.services || {};
      Object.entries(svcs).forEach(([name, price]: [string, any]) => {
        if (!price) return;
        items.push({ name: name.charAt(0).toUpperCase() + name.slice(1), description: '', price: price, isPrepaid: false, paid: true });
      });
      if (selectedReceipt.items?.stay_adjustment > 0) {
        items.push({ name: 'Stay Extension Fee', description: '', price: selectedReceipt.items.stay_adjustment, isPrepaid: false, paid: true });
      }
      if (selectedReceipt.items?.drinks?.length > 0) {
        const drinksTotal = selectedReceipt.items.drinks.reduce((s: number, d: any) => s + (d.price * d.quantity), 0);
        items.push({ name: 'Drinks', description: `${selectedReceipt.items.drinks.length} item${selectedReceipt.items.drinks.length > 1 ? 's' : ''}`, price: drinksTotal, isPrepaid: false, paid: true });
      }
      return items;
    } else {
      const items: any[] = [];
      if (svcAmount > 0 || (isPrepaid && (sel?.collected_amount || 0) === 0)) {
        items.push({ name: 'Accommodation', description: `${localAdults || sel?.number_of_adults || 1} adult${(localAdults || sel?.number_of_adults || 1) > 1 ? 's' : ''}${(localChildren || sel?.number_of_children) ? `, ${localChildren || sel?.number_of_children} child${(localChildren || sel?.number_of_children) > 1 ? 'ren' : ''}` : ''}`, price: svcAmount, isPrepaid: isPrepaid && (sel?.collected_amount || 0) === 0, paid: isPrepaid && (sel?.collected_amount || 0) === 0 });
      }
      
      // Calculate meal totals from activeMeals (Single Source of Truth)
      // Using remapped lowercase values from syncKitchen
      const unpaidMeals = activeMeals.filter(m => 
        !m.is_paid && (m.status === 'confirmed' || m.status === 'served')
      );
      
      const lunchMeals = unpaidMeals.filter(m => m.meal_type === 'Lunch');
      const lunchAdultQty = lunchMeals.reduce((sum, m) => sum + (m.adult_qty || 0), 0);
      const lunchChildQty = lunchMeals.reduce((sum, m) => sum + (m.child_qty || 0), 0);
      const lunchTotalQty = lunchAdultQty + lunchChildQty;
      if (lunchTotalQty > 0) {
        const lunchPrepaid = isLunchPrepaid || isFoodPrepaid;
        const lunchAdultPrice = pricing?.lunch_price || 10;
        const lunchChildPrice = pricing?.lunch_child_price || 5;
        const lunchTotalPrice = (lunchAdultQty * lunchAdultPrice) + (lunchChildQty * lunchChildPrice);
        items.push({ name: 'Lunch', description: `×${lunchTotalQty}`, price: lunchTotalPrice, isPrepaid: lunchPrepaid, paid: lunchPrepaid });
      }
      
      const dinnerMeals = unpaidMeals.filter(m => m.meal_type === 'Dinner');
      const dinnerAdultQty = dinnerMeals.reduce((sum, m) => sum + (m.adult_qty || 0), 0);
      const dinnerChildQty = dinnerMeals.reduce((sum, m) => sum + (m.child_qty || 0), 0);
      const dinnerTotalQty = dinnerAdultQty + dinnerChildQty;
      if (dinnerTotalQty > 0) {
        const dinnerPrepaid = isDinnerPrepaid || isFoodPrepaid;
        const dinnerAdultPrice = pricing?.dinner_price || 10;
        const dinnerChildPrice = pricing?.dinner_child_price || 5;
        const dinnerTotalPrice = (dinnerAdultQty * dinnerAdultPrice) + (dinnerChildQty * dinnerChildPrice);
        items.push({ name: 'Dinner', description: `×${dinnerTotalQty}`, price: dinnerTotalPrice, isPrepaid: dinnerPrepaid, paid: dinnerPrepaid });
      }
      
      // Add services from activeServices (guide, transport, drinks, extras)
      activeServices.forEach((s: any) => {
        const price = s.unit_price * s.quantity;
        const isPrepaid = s.is_paid;
        
        if (s.service_type === 'guide') {
          items.push({ name: 'Guide Service', description: s.details?.names || '1 guide', price, isPrepaid, paid: isPrepaid });
        } else if (s.service_type === 'transportation') {
          items.push({ name: 'Transport', description: s.details?.name || s.details?.destination || '', price, isPrepaid, paid: isPrepaid });
        } else if (s.service_type === 'drinks') {
          items.push({ name: s.details?.name || 'Drink', description: `${s.currency}`, price, isPrepaid, paid: isPrepaid });
        } else if (s.service_type === 'extra') {
          items.push({ name: s.details?.name || 'Extra', description: '', price, isPrepaid, paid: isPrepaid });
        }
      });
      
      if (svcDiscount > 0) {
        items.push({ name: 'Discount', description: '', price: -svcDiscount, isPrepaid: false, paid: false });
      }
      return items;
    }
  }, [selectedReceipt, sel, pricing, svcAmount, isPrepaid, isLunchPrepaid, isDinnerPrepaid, isFoodPrepaid, svcDiscount, localAdults, localChildren, activeMeals, activeServices]);

  // ============================================================================
  // SECTION C: ATOMIC SAVE+SETTLE FOR GUIDE/TRANSPORT
  // ============================================================================

  // Debounced insert for guide service
  const debouncedInsertGuide = useCallback(
    async (guidePrice: number, guideNames: string[]) => {
      if (!sel?.id) return;
      
      const { error } = await supabase.from('booking_services').insert({
        booking_id: sel.id,
        service_type: 'guide',
        unit_price: guidePrice,
        quantity: 1,
        currency: 'USD',
        is_paid: false,
        details: { names: guideNames.join(', ') }
      });
      
      if (error) {
        console.error('Failed to save guide service:', error);
      } else if (onRefresh) {
        onRefresh(); // Trigger re-fetch to update activeServices
      }
    },
    [sel?.id, onRefresh]
  );

  // Debounced insert for transport services
  const debouncedInsertTransport = useCallback(
    async (transList: any[]) => {
      if (!sel?.id) return;
      
      for (const t of transList) {
        if (t.name.trim() || t.details.trim() || t.price > 0) {
          const { error } = await supabase.from('booking_services').insert({
            booking_id: sel.id,
            service_type: 'transportation',
            unit_price: t.price || 0,
            quantity: 1,
            currency: 'USD',
            is_paid: false,
            details: { name: t.name, destination: t.details }
          });
          
          if (error) {
            console.error('Failed to save transport service:', error);
          }
        }
      }
      
      if (onRefresh) {
        onRefresh(); // Trigger re-fetch to update activeServices
      }
    },
    [sel?.id, onRefresh]
  );

  // Debounce hook implementation
  const useDebouncedCallback = (callback: (...args: any[]) => void, delay: number) => {
    const timeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
    
    return useCallback(
      (...args: any[]) => {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
        timeoutRef.current = setTimeout(() => {
          callback(...args);
        }, delay);
      },
      [callback, delay]
    );
  };

  const debouncedGuideInsert = useDebouncedCallback(debouncedInsertGuide, 500);
  const debouncedTransportInsert = useDebouncedCallback(debouncedInsertTransport, 500);

  // Handle guide checkbox change with debounced insert
  useEffect(() => {
    if (svcGuide && svcGuidePrice > 0 && svcGuideNames.some(n => n.trim())) {
      // Check if guide service already exists
      const existingGuide = activeServices.find((s: any) => s.service_type === 'guide');
      if (!existingGuide) {
        debouncedGuideInsert(svcGuidePrice, svcGuideNames);
      }
    }
  }, [svcGuide, svcGuidePrice, svcGuideNames, activeServices, debouncedGuideInsert]);

  // Handle transport checkbox change with debounced insert
  useEffect(() => {
    if (svcTransport && svcTransList.some(t => t.price > 0)) {
      // Check if transport services already exist
      const existingTransports = activeServices.filter((s: any) => s.service_type === 'transportation');
      if (existingTransports.length === 0) {
        debouncedTransportInsert(svcTransList);
      }
    }
  }, [svcTransport, svcTransList, activeServices, debouncedTransportInsert]);

  // ============================================================================
  // HANDLERS (to be continued in Section D)
  // ============================================================================

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

      setAdultsChildrenLocked(true);

      flash('✓ Guest count saved and locked!');
    } catch (err) {
      flash('⚠ Failed to save guest count.');
    } finally {
      setLoadingAction('');
    }
  };

  const handleSaveProgress = async () => {
    if (!sel || !onUpdateBooking) return;
    setLoadingAction('save');
    try {
      const category = currentMeta.guest_category || 'international';

      const data: any = {
        guest_count_confirmed: true,
        is_prepaid: isPrepaid,
        is_accommodation_prepaid: isPrepaid,
        is_food_prepaid: isFoodPrepaid,
        guest_category: category,
        amount: svcAmount, 
      };

      if (!sel.guest_count_confirmed) {
        data.number_of_adults = svcAdults;
        data.number_of_children = svcChildren;
      }

      if (!isPrepaid && svcAmount > 0) {
        data.collected_amount = (sel.collected_amount || 0) + svcAmount;
        data.collected_currency = 'USD';
      }

      // Drinks Tab - migrate to booking_services in full rewrite
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

      // Extra Services - migrate to booking_services in full rewrite
      data.extra_services = extraServices;

      if (sel.google_event_id || sel.source === 'System' || sel.source === 'office') {
        data.is_manually_updated = true;
      }

      await onUpdateBooking(sel.id, data);
      
      try { await supabase.rpc('reload_schema'); } catch { /* ignore if not exist */ }

      setAdultsChildrenLocked(true);

      flash('✓ Choices saved to guest file!');
    } catch (err) {
      flash('⚠ Failed to save progress.');
    } finally {
      setLoadingAction('');
    }
  };

  // ============================================================================
  // RENDER HELPERS
  // ============================================================================

  const statusColor = (s?: string) => ({
    checked_in: 'bg-[#0B6E4F]/20 text-[#0B6E4F] border border-[#0B6E4F]/40',
    confirmed: 'bg-[#B8860B]/20 text-[#B8860B] border border-[#B8860B]/40',
    completed: 'bg-[#5C4A2E]/20 text-[#5C4A2E] border border-[#5C4A2E]/40',
    cancelled: 'bg-[#722F37]/20 text-[#722F37] border border-[#722F37]/40',
    pending: 'bg-[#1C232E]/20 text-[#9C9384] border border-[#2A2F36]',
    no_arrival: 'bg-[#1C232E]/20 text-[#9C9384] border border-[#2A2F36]',
  }[s ?? ''] ?? 'bg-[#1C232E]/20 text-[#9C9384]');

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
        skipFonts: true,
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

  // ============================================================================
  // RENDER START (placeholder - full render in Section D)
  // ============================================================================

  if (!selectedItem) return null;

  // Calendar-only event (no booking) — show simplified card
  if (!sel && selectedItem?.event) {
    const ev = selectedItem.event;
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
                <p className="text-xs text-[#9C9384] mt-2 whitespace-pre-wrap bg-[#1C232E]/50 rounded-xl p-3 border border-[#2A2F36]">{ev.description}</p>
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
                  className="w-full py-3 bg-[#1C232E] hover:bg-[#2A1518] text-[#9C9384] text-[11px] font-black uppercase tracking-[0.15em] flex items-center justify-center gap-2 transition-all disabled:opacity-60 border border-[#2A2F36]"
                >
                  Create Booking Only
                </button>
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

  // ============================================================================
  // SECTION D: FULL RENDER IMPLEMENTATION
  // ============================================================================

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
            {/* Header: Guest info and status */}
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
                    className="text-[10px] font-bold text-[#0B6E4F] hover:text-[#0B6E4F] flex items-center gap-1 bg-[#0B6E4F]/10 px-2 py-1 rounded-lg border border-[#0B6E4F]/20 transition-all active:scale-95"
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

            {/* Notes panel */}
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

            {/* Status-specific displays */}
            {(sel.status === 'no_arrival' || sel.status === 'cancelled') && (
              <div className={`px-4 py-3 rounded-xl text-sm font-bold flex items-center justify-center select-none cursor-not-allowed ${statusColor(sel.status)}`}>
                <span className={statusIconColor(sel.status)}>{statusIcon(sel.status)}</span>
                <span className="capitalize">{String(sel.status).replace('_', ' ')}</span>
                {sel.status === 'no_arrival' && <span className="text-[10px] font-medium opacity-70">· permanent</span>}
              </div>
            )}

            {/* Completed status display */}
            {sel.status === 'completed' && (() => {
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
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-[#0B6E4F]/10 border border-[#0B6E4F]/30 rounded-2xl p-4">
                        <p className="text-[9px] font-black text-[#0B6E4F] uppercase tracking-widest mb-2">Paid</p>
                        <p className="text-xl font-black text-[#0B6E4F]">${String((sel.collected_amount || 0).toFixed(2))}</p>
                      </div>
                      <div className="bg-[#BA7517]/10 border border-[#BA7517]/30 rounded-2xl p-4">
                        <p className="text-[9px] font-black text-[#BA7517] uppercase tracking-widest mb-2">Unpaid</p>
                        <p className="text-xl font-black text-[#BA7517]">${String(Math.max(0, tabTotals.grandTotal - (sel.collected_amount || 0)).toFixed(2))}</p>
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

            {/* Action buttons for staff */}
            {isStaff && sel.status !== 'no_arrival' && sel.status !== 'cancelled' && sel.status !== 'completed' && (
              <div className="flex flex-wrap gap-2">
                {sel.status === 'checked_in' && !editingDates && (
                  <div className="w-full">
                    <div className="flex items-center justify-between">
                      <div className="flex flex-col gap-1.5">
                        <span className="px-4 py-2 bg-[#0B6E4F]/20 text-[#0B6E4F] text-sm font-bold rounded-xl border border-[#0B6E4F]/40 flex items-center gap-2">
                          ✓ Checked In
                        </span>
                      </div>
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

            {/* Date editing modal */}
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
                        const settledReceipts = getSettledReceiptsForSel ? getSettledReceiptsForSel() : [];
                        const isTab1Closed = settledReceipts.length > 0 || (sel.collected_amount || 0) > 0 || sel.is_prepaid || sel.is_accommodation_prepaid || sel.is_food_prepaid;
                        
                        const updates: any = { 
                          check_in: editCheckIn,
                          check_out: editCheckOut,
                          is_manually_updated: true,
                          total_price: isTab1Closed ? ((sel.total_price || 0) + svcDateAdjustment) : (svcAmount + svcDateAdjustment)
                        };

                        updates.meta = { 
                          ...currentMeta, 
                          is_manual_dates: true, 
                          days: dayEntries,
                          last_adjustment: svcDateAdjustment
                        };

                        if (onUpdateBooking) await onUpdateBooking(sel.id, updates);

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
                    className="flex-1 py-3 bg-[#047857] hover:bg-[#035e44] text-white text-xs font-black uppercase tracking-[0.2em] rounded-none transition-all disabled:opacity-60 flex items-center justify-center gap-2 border border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[2px] active:translate-y-[2px]"
                  >
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

            {/* Stay configuration */}
            {isStaff && !isPOS && sel.status !== 'completed' && (
              <div className="border border-[#2A2F36] rounded-xl p-4 space-y-4 bg-[#1C232E]">
                <p className="text-[10px] font-black uppercase tracking-widest text-[#9C9384]">Stay Configuration</p>
                
                {/* Guest count */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-[#9C9384] uppercase tracking-widest block">Adults</label>
                    <div className="flex items-center gap-2">
                      <button 
                        type="button"
                        onClick={() => setLocalAdults(Math.max(1, (localAdults || sel?.number_of_adults || 1) - 1))}
                        disabled={adultsChildrenLocked || loadingGuestCounts}
                        className="w-10 h-10 rounded-xl bg-[#1C232E]/50 text-[#9C9384] text-lg font-black hover:bg-[#2A1518] transition-all shadow-sm border border-[#2A2F36] disabled:opacity-50 disabled:cursor-not-allowed"
                      >−</button>
                      <div className="flex-1 text-center text-2xl font-black text-[#EDE6D6]">{localAdults || sel?.number_of_adults || 1}</div>
                      <button 
                        type="button"
                        onClick={() => setLocalAdults((localAdults || sel?.number_of_adults || 1) + 1)}
                        disabled={adultsChildrenLocked || loadingGuestCounts}
                        className="w-10 h-10 rounded-xl bg-[#0B6E4F]/20 text-[#0B6E4F] text-lg font-black hover:bg-[#0B6E4F]/30 transition-all shadow-sm border border-[#0B6E4F]/40 disabled:opacity-50 disabled:cursor-not-allowed"
                      >+</button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-[#9C9384] uppercase tracking-widest block">Children</label>
                    <div className="flex items-center gap-2">
                      <button 
                        type="button"
                        onClick={() => setLocalChildren(Math.max(0, (localChildren || sel?.number_of_children || 0) - 1))}
                        disabled={adultsChildrenLocked || loadingGuestCounts}
                        className="w-10 h-10 rounded-xl bg-[#1C232E]/50 text-[#9C9384] text-lg font-black hover:bg-[#2A1518] transition-all shadow-sm border border-[#2A2F36] disabled:opacity-50 disabled:cursor-not-allowed"
                      >−</button>
                      <div className="flex-1 text-center text-2xl font-black text-[#EDE6D6]">{localChildren || sel?.number_of_children || 0}</div>
                      <button 
                        type="button"
                        onClick={() => setLocalChildren((localChildren || sel?.number_of_children || 0) + 1)}
                        disabled={adultsChildrenLocked || loadingGuestCounts}
                        className="w-10 h-10 rounded-xl bg-[#0B6E4F]/20 text-[#0B6E4F] text-lg font-black hover:bg-[#0B6E4F]/30 transition-all shadow-sm border border-[#0B6E4F]/40 disabled:opacity-50 disabled:cursor-not-allowed"
                      >+</button>
                    </div>
                  </div>
                </div>

                {!adultsChildrenLocked && (
                  <button 
                    onClick={handleSaveGuestCount}
                    disabled={loadingAction === 'save'}
                    className="w-full py-3 bg-[#0B6E4F] text-[#C9A227] rounded-xl text-sm font-black uppercase tracking-[0.2em] shadow-xl shadow-[#0B6E4F]/30 hover:bg-[#0B6E4F]/80 transition-all active:scale-95 disabled:opacity-50"
                  >
                    {loadingAction === 'save' ? 'Saving...' : 'Save Guest Count'}
                  </button>
                )}

                {/* Accommodation amount */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-[#9C9384] uppercase tracking-widest block">Accommodation Amount (USD)</label>
                  <div className="flex items-center gap-2">
                    <span className="text-[#9C9384] font-bold text-lg">$</span>
                    <input 
                      type="number"
                      value={String(sel.is_accommodation_prepaid ? 0 : svcAmount)}
                      onChange={e => setSvcAmount(parseFloat(e.target.value) || 0)}
                      disabled={sel.is_accommodation_prepaid}
                      className={`flex-1 px-4 py-3 bg-[#1C232E] border border-[#2A2F36] rounded-xl text-xl font-black text-[#EDE6D6] outline-none focus:border-[#0B6E4F] transition-all ${sel.is_accommodation_prepaid ? 'opacity-50 cursor-not-allowed' : ''}`}
                    />
                  </div>
                  {sel.is_accommodation_prepaid && (
                    <p className="text-[9px] font-bold text-[#0B6E4F] uppercase tracking-wider">Prepaid — locked</p>
                  )}
                </div>

                {/* Prepaid toggle */}
                <div className="flex items-center justify-between p-4 bg-[#1C232E]/50 rounded-xl border border-[#2A2F36]">
                  <span className="text-[10px] font-black text-[#9C9384] uppercase tracking-widest">Accommodation Prepaid</span>
                  <button 
                    type="button"
                    onClick={() => !sel.is_accommodation_prepaid && setIsPrepaid(!isPrepaid)}
                    disabled={sel.is_accommodation_prepaid}
                    className={`w-12 h-6 rounded-full transition-all relative ${isPrepaid ? 'bg-[#0B6E4F]' : 'bg-[#5C4A2E]'} ${sel.is_accommodation_prepaid ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <div className={`absolute top-1 w-4 h-4 bg-[#EDE6D6] rounded-full transition-all ${isPrepaid ? 'left-7' : 'left-1'}`} />
                  </button>
                </div>

                {/* Extension fee (when tab closed) */}
                {(() => {
                  const isTab1Closed = getSettledReceiptsForSel ? getSettledReceiptsForSel().length > 0 : false;
                  if (!isTab1Closed && (sel.collected_amount || 0) === 0) return null;
                  
                  return (
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-[#BA7517] uppercase tracking-widest block">Stay Extension Fee (USD)</label>
                      <div className="flex items-center gap-2">
                        <span className="text-[#BA7517] font-bold text-lg">$</span>
                        <input 
                          type="number"
                          value={String(svcDateAdjustment)}
                          onChange={e => setSvcDateAdjustment(parseFloat(e.target.value) || 0)}
                          className="flex-1 px-4 py-3 bg-[#1C232E] border border-[#BA7517]/40 rounded-xl text-xl font-black text-[#BA7517] outline-none focus:border-[#BA7517] transition-all"
                        />
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Meal request buttons */}
            {isStaff && !isPOS && sel.status !== 'completed' && (
              <div className="flex gap-2">
                <button
                  onClick={() => { setCurrentMealType('lunch'); setShowMealRequestModal(true); }}
                  className="flex-1 py-3 bg-[#1C232E] border border-[#2A2F36] rounded-xl text-sm font-bold text-[#EDE6D6] hover:border-[#0B6E4F] hover:text-[#0B6E4F] transition-all flex items-center justify-center gap-2"
                >
                  <span className="text-lg">🍽</span>
                  Request Lunch
                </button>
                <button
                  onClick={() => { setCurrentMealType('dinner'); setShowMealRequestModal(true); }}
                  className="flex-1 py-3 bg-[#1C232E] border border-[#2A2F36] rounded-xl text-sm font-bold text-[#EDE6D6] hover:border-[#0B6E4F] hover:text-[#0B6E4F] transition-all flex items-center justify-center gap-2"
                >
                  <span className="text-lg">🌙</span>
                  Request Dinner
                </button>
              </div>
            )}

            {/* Meal request modal */}
            {showMealRequestModal && (
              <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                <div className="bg-[#1C232E] rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto border border-[#2A2F36] shadow-2xl">
                  <div className="flex items-center justify-between px-5 py-4 border-b border-[#2A2F36] sticky top-0 bg-[#1C232E] rounded-t-2xl z-10">
                    <p className="text-[10px] font-black uppercase tracking-widest text-[#0B6E4F]">
                      Request {currentMealType === 'lunch' ? 'Lunch' : 'Dinner'}
                    </p>
                    <button onClick={() => setShowMealRequestModal(false)} className="w-8 h-8 flex items-center justify-center rounded-xl transition-all text-[#EDE6D6] font-bold text-xl hover:bg-[#2A1518]">×</button>
                  </div>

                  <div className="p-5 space-y-4">
                    {/* Quantity selectors */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-[10px] font-black text-[#9C9384] uppercase tracking-widest block mb-2">Adult Qty</label>
                        <div className="flex items-center justify-center gap-4">
                          <button type="button" onClick={() => setMealRequestAdultQty(Math.max(0, mealRequestAdultQty - 1))} className="w-12 h-12 rounded-2xl bg-[#1C232E]/50 text-[#9C9384] text-xl font-black hover:bg-[#2A1518] transition-all shadow-sm border border-[#2A2F36]">－</button>
                          <div className="text-3xl font-black text-[#EDE6D6] min-w-[50px] text-center">{mealRequestAdultQty}</div>
                          <button type="button" onClick={() => setMealRequestAdultQty(mealRequestAdultQty + 1)} className="w-12 h-12 rounded-2xl bg-[#0B6E4F]/20 text-[#0B6E4F] text-xl font-black hover:bg-[#0B6E4F]/30 transition-all shadow-sm border border-[#0B6E4F]/40">＋</button>
                        </div>
                      </div>
                      {(sel?.children_under_12 || 0) > 0 && (
                        <div>
                          <label className="text-[10px] font-black text-[#9C9384] uppercase tracking-widest block mb-2">Child Qty</label>
                          <div className="flex items-center justify-center gap-4">
                            <button type="button" onClick={() => setMealRequestChildQty(Math.max(0, mealRequestChildQty - 1))} className="w-12 h-12 rounded-2xl bg-[#1C232E]/50 text-[#9C9384] text-xl font-black hover:bg-[#2A1518] transition-all shadow-sm border border-[#2A2F36]">－</button>
                            <div className="text-3xl font-black text-[#EDE6D6] min-w-[50px] text-center">{mealRequestChildQty}</div>
                            <button type="button" onClick={() => setMealRequestChildQty(mealRequestChildQty + 1)} className="w-12 h-12 rounded-2xl bg-[#0B6E4F]/20 text-[#0B6E4F] text-xl font-black hover:bg-[#0B6E4F]/30 transition-all shadow-sm border border-[#0B6E4F]/40">＋</button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Vegetarian selectors */}
                    {mealRequestAdultQty > 0 && (
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
                    )}

                    {mealRequestChildQty > 0 && (
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

                    {/* Prepaid toggle */}
                    <div className="flex items-center justify-between p-4 bg-[#1C232E]/50 rounded-2xl border border-[#2A2F36]">
                      <span className="text-[10px] font-black text-[#9C9384] uppercase tracking-widest">Include in Booking (Prepaid)</span>
                      <button 
                        type="button"
                        onClick={() => currentMealType === 'lunch' ? setIsLunchPrepaid(!isLunchPrepaid) : setIsDinnerPrepaid(!isDinnerPrepaid)}
                        className={`w-12 h-6 rounded-full transition-all relative ${(currentMealType === 'lunch' ? isLunchPrepaid : isDinnerPrepaid) ? 'bg-[#0B6E4F]' : 'bg-[#5C4A2E]'}`}
                      >
                        <div className={`absolute top-1 w-4 h-4 bg-[#EDE6D6] rounded-full transition-all ${(currentMealType === 'lunch' ? isLunchPrepaid : isDinnerPrepaid) ? 'left-7' : 'left-1'}`} />
                      </button>
                    </div>

                    {/* Date and dietary */}
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

                    {/* Prepaid indicator */}
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

                    {/* Submit button */}
                    <button type="button"
                      disabled={mealRequestAdultQty <= 0 && mealRequestChildQty <= 0}
                      onClick={async () => {
                        // Fetch latest metadata first
                        const { data: latest } = await supabase
                          .from('bookings')
                          .select('meta')
                          .eq('id', sel.id)
                          .single();

                        const latestMeta = latest?.meta || {};

                        // Insert into meal_requests
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
                        
                        const { data: insertedMeal, error: mealErr } = await supabase.from('meal_requests').insert(mealRow).select().single();

                        if (mealErr) {
                          console.error('meal_requests insert failed:', mealErr);
                          flash('⚠ Failed to send to kitchen: ' + mealErr.message);
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

            {/* Other services (guide, transport) */}
            {isRoomStay && (() => {
              const isTab1Closed = getSettledReceiptsForSel ? getSettledReceiptsForSel().length > 0 : false;
              const relevantMealsForToggle = activeMeals.filter((m: any) => 
                m.status === 'confirmed' || m.status === 'served'
              );
              const hasMeals = relevantMealsForToggle.length > 0;
              const allMealsPrepaid = relevantMealsForToggle.length > 0 && relevantMealsForToggle.every((m: any) => m.is_paid);
              return (
                <div className="border border-[#2A2F36] rounded-xl p-4 space-y-3 bg-[#1C232E]">
                  <div className="flex justify-between items-center">
                    <p className="text-[10px] font-black uppercase tracking-widest text-[#9C9384]">Other Services</p>
                    {hasMeals && (
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={async () => {
                            const newValue = !isFoodPrepaid;
                            setIsFoodPrepaid(newValue);
                            
                            if (relevantMealsForToggle.length > 0) {
                              const mealIds = relevantMealsForToggle.map((m: any) => m.id);
                              const { error } = await supabase
                                .from('meal_requests')
                                .update({ is_paid: newValue })
                                .in('id', mealIds);
                              if (error) {
                                console.error('Failed to bulk update meal prepaid status:', error);
                              } else if (onRefresh) {
                                onRefresh();
                              }
                            }
                          }}
                          className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${allMealsPrepaid ? 'bg-[#0B6E4F]' : 'bg-[#5C4A2E]'}`}
                        >
                          <span
                            className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform duration-200 ${allMealsPrepaid ? 'translate-x-5' : 'translate-x-0'}`}
                          />
                        </button>
                        {allMealsPrepaid && (
                          <span className="text-[10px] font-black bg-emerald-400 text-emerald-900 px-2 py-0.5 rounded-md uppercase tracking-wider">Prepaid</span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-1 gap-4">
                    {/* Guide service */}
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={svcGuide} onChange={async (e) => { 
                            const checked = e.target.checked;
                            setSvcGuide(checked); 
                            if (checked) { 
                              setSvcGuidePrice(pricing?.guide_price || 0); 
                              setSvcGuideNames(['']); 
                            } else {
                              // Delete existing guide service row when unchecked
                              const existingGuide = activeServices.find((s: any) => s.service_type === 'guide');
                              if (existingGuide) {
                                const { error } = await supabase.from('booking_services').delete().eq('id', existingGuide.id);
                                if (error) {
                                  console.error('Failed to delete guide service:', error);
                                } else if (onRefresh) {
                                  onRefresh();
                                }
                              }
                            }
                          }} className="w-5 h-5 border-2 border-[#2A2F36] text-[#0B6E4F] rounded" />
                          <div className="flex flex-col">
                            <span className="text-sm font-bold text-[#EDE6D6]">Guide Service</span>
                            {pricing?.guide_price && pricing.guide_price > 0 && (
                              <span className="text-[9px] font-bold text-[#9C9384] uppercase tracking-wider">System Price: ${String(pricing.guide_price)} / guide</span>
                            )}
                          </div>
                        </label>
                        {svcGuide && (
                          <div className="flex items-center gap-2">
                            <button type="button" onClick={() => setSvcGuidePrice(Math.max(0, svcGuidePrice - 5))} className="w-8 h-8 flex items-center justify-center bg-[#1C232E]/50 hover:bg-[#2A1518] text-[#9C9384] rounded-xl font-black text-sm transition-all shadow-sm border border-[#2A2F36]">－</button>
                            <div className="relative">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[#9C9384] font-bold text-[10px]">$</span>
                              <input type="number" value={String(svcGuidePrice)} onChange={e => setSvcGuidePrice(parseFloat(e.target.value) || 0)}
                                className="w-20 pl-5 pr-2 py-2 bg-[#1C232E] border-2 border-[#2A2F36] rounded-xl text-base font-black text-[#EDE6D6] focus:border-[#0B6E4F] outline-none text-center" />
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
                                className={`flex-1 px-3 py-2 border-2 ${!String(name).trim() ? 'border-[#722F37] bg-[#722F37]/10' : 'border-[#2A2F36] bg-[#1C232E]'} rounded-lg text-base font-bold text-[#EDE6D6] focus:border-[#0B6E4F] transition-all`} />
                              {svcGuideNames.length > 1 && <button type="button" onClick={() => { setSvcGuideNames(svcGuideNames.filter((_: any, i: number) => i !== ni)); setSvcGuidePrice(Math.max(0, svcGuidePrice - 40)); }}
                                className="text-[#722F37] hover:text-[#722F37]/80 font-black text-xl px-1">×</button>}
                            </div>
                          ))}
                          <button type="button" onClick={() => { setSvcGuideNames([...svcGuideNames, '']); setSvcGuidePrice(svcGuidePrice + 40); }}
                            className="w-full py-1.5 border-2 border-dashed border-[#2A2F36] rounded-xl text-[10px] font-black text-[#9C9384] uppercase tracking-widest hover:border-[#0B6E4F] hover:text-[#0B6E4F] transition-all">+ Add Another Guide ($40)</button>
                        </div>
                      )}
                    </div>
                    {/* Transport service */}
                    <div className="space-y-2 pt-2 border-t border-[#2A2F36]">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={svcTransport} onChange={async (e) => { 
                          const checked = e.target.checked;
                          setSvcTransport(checked);
                          if (!checked) {
                            // Delete all existing transport service rows when unchecked
                            const existingTransports = activeServices.filter((s: any) => s.service_type === 'transportation');
                            if (existingTransports.length > 0) {
                              const transportIds = existingTransports.map((s: any) => s.id);
                              const { error } = await supabase.from('booking_services').delete().in('id', transportIds);
                              if (error) {
                                console.error('Failed to delete transport services:', error);
                              } else if (onRefresh) {
                                onRefresh();
                              }
                            }
                          }
                        }} className="w-5 h-5 border-2 border-[#2A2F36] text-[#0B6E4F] rounded" />
                        <span className="text-sm font-bold text-[#EDE6D6]">Transport</span>
                      </label>
                      {svcTransport && (
                        <div className="space-y-3">
                          {svcTransList.map((trans: any, ti: number) => (
                            <div key={ti} className="p-3 border border-[#2A2F36] rounded-xl bg-[#1C232E]/50 space-y-2">
                              <div className="flex justify-between items-center">
                                <span className="text-[10px] font-black text-[#9C9384] uppercase tracking-widest">Transfer {String(ti + 1)}</span>
                                {svcTransList.length > 1 && <button type="button" onClick={() => setSvcTransList(svcTransList.filter((_: any, i: number) => i !== ti))} className="text-[#722F37] hover:text-[#722F37]/80 font-bold text-xs">✕ Remove</button>}
                              </div>
                              <input type="text" value={String(trans.name)} onChange={e => setSvcTransList(svcTransList.map((t: any, i: number) => i === ti ? { ...t, name: e.target.value } : t))} placeholder="Driver Name..."
                                className={`w-full px-3 py-2 border-2 ${!String(trans.name).trim() ? 'border-[#722F37] bg-[#722F37]/10' : 'border-[#2A2F36] bg-[#1C232E]'} rounded-lg text-base font-bold text-[#EDE6D6] focus:border-[#0B6E4F] transition-all`} />
                              <div className="flex gap-2">
                                <input type="text" value={String(trans.details)} onChange={e => setSvcTransList(svcTransList.map((t: any, i: number) => i === ti ? { ...t, details: e.target.value } : t))} placeholder="From/To..."
                                  className={`flex-1 px-3 py-2 border-2 ${!String(trans.details).trim() ? 'border-[#722F37] bg-[#722F37]/10' : 'border-[#2A2F36] bg-[#1C232E]'} rounded-lg text-base font-bold text-[#EDE6D6] focus:border-[#0B6E4F] transition-all`} />
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] font-bold text-[#9C9384]">$</span>
                                  <input type="number" value={String(trans.price)} onChange={e => setSvcTransList(svcTransList.map((t: any, i: number) => i === ti ? { ...t, price: parseFloat(e.target.value) || 0 } : t))} placeholder="Price"
                                    className={`w-20 px-3 py-2 border-2 ${trans.price <= 0 ? 'border-[#722F37] bg-[#722F37]/10' : 'border-[#2A2F36] bg-[#1C232E]'} rounded-lg text-base font-bold text-[#EDE6D6] focus:border-[#0B6E4F] transition-all`} />
                                </div>
                              </div>
                            </div>
                          ))}
                          <button type="button" onClick={() => setSvcTransList([...svcTransList, { name: '', details: '', price: 0 }])}
                            className="w-full py-1.5 border-2 border-dashed border-[#2A2F36] rounded-xl text-[10px] font-black text-[#9C9384] uppercase tracking-widest hover:border-[#0B6E4F] hover:text-[#0B6E4F] transition-all">+ Add Transfer</button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Extra services (drinks, extras, discount) */}
            {(canCheckOut || sel.status === 'checked_in') && isStaff && (
              <div className="border border-[#2A2F36] rounded-xl p-4 space-y-3 bg-[#1C232E]">
                <p className="text-[10px] font-black uppercase tracking-widest text-[#9C9384]">Extra Services</p>
                
                {/* Discount (CEO only) */}
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
                
                {/* Drinks */}
                <button onClick={() => setShowDrinks(!showDrinks)} className="text-sm font-bold text-[#0B6E4F] hover:text-[#0B6E4F]/80">{showDrinks ? '− Hide Drinks' : '+ Add Drinks'}</button>
                {showDrinks && drinks.length > 0 && (
                  <div className="grid grid-cols-2 gap-2">
                    {drinks.map((d: any) => (
                      <div key={d.id} className="flex items-center gap-2 bg-[#1C232E]/50 rounded-lg px-3 py-2 border border-[#2A2F36]">
                        <span className="text-xs text-[#EDE6D6] flex-1 truncate">{String(d.name)}</span>
                        <div className="flex items-center gap-1">
                          <button onClick={async () => {
                            const currentQty = selectedDrinks[d.id] || 0;
                            if (currentQty > 0) {
                              const { data: existingRows, error: fetchError } = await supabase
                                .from('booking_services')
                                .select('id')
                                .eq('booking_id', sel.id)
                                .eq('service_type', 'drinks')
                                .filter('details->>drink_id', 'eq', String(d.id))
                                .eq('is_paid', false)
                                .order('created_at', { ascending: false })
                                .limit(1);
                              if (fetchError) {
                                flash('⚠ Failed to remove drink.');
                                return;
                              }
                              if (existingRows && existingRows.length > 0) {
                                const { error: deleteError } = await supabase.from('booking_services').delete().eq('id', existingRows[0].id);
                                if (deleteError) {
                                  flash('⚠ Failed to remove drink.');
                                  return;
                                }
                              }
                              setSelectedDrinks({ ...selectedDrinks, [d.id]: currentQty - 1 });
                            }
                          }} className="w-5 h-5 rounded bg-[#1C232E]/50 text-[#9C9384] text-xs font-bold hover:bg-[#2A1518] border border-[#2A2F36]">−</button>
                          <span className="w-5 text-center text-xs font-bold text-[#EDE6D6]">{String(selectedDrinks[d.id] || 0)}</span>
                          <button onClick={async () => {
                            const { error } = await supabase.from('booking_services').insert({
                              booking_id: sel.id,
                              service_type: 'drinks',
                              unit_price: d.sold_price || d.price || 0,
                              quantity: 1,
                              currency: d.currency || 'USD',
                              details: { name: d.name, drink_id: d.id },
                              is_paid: false
                            });
                            if (error) {
                              flash('⚠ Failed to add drink.');
                              return;
                            }
                            setSelectedDrinks({ ...selectedDrinks, [d.id]: (selectedDrinks[d.id] || 0) + 1 });
                          }} className="w-5 h-5 rounded bg-[#0B6E4F]/20 text-[#0B6E4F] text-xs font-bold hover:bg-[#0B6E4F]/30 border border-[#0B6E4F]/40">+</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                
                {/* Extra services */}
                <div className="flex gap-2">
                  <input type="text" value={String(newExtraName)} onChange={e => setNewExtraName(e.target.value)} placeholder="Service name"
                    className="flex-1 px-3 py-2 text-base rounded-lg border border-[#2A2F36] bg-[#1C232E] focus:outline-none focus:ring-2 focus:ring-[#0B6E4F]/30 text-[#EDE6D6]" />
                  <input type="number" value={String(newExtraPrice)} onChange={e => setNewExtraPrice(e.target.value)} placeholder="Price"
                    className="w-20 px-3 py-2 text-base rounded-lg border border-[#2A2F36] bg-[#1C232E] focus:outline-none text-[#EDE6D6]" />
                  <button onClick={async () => {
                    if (!newExtraName.trim()) return;
                    const { error } = await supabase.from('booking_services').insert({
                      booking_id: sel.id,
                      service_type: 'extra',
                      unit_price: parseFloat(newExtraPrice) || 0,
                      quantity: 1,
                      currency: 'USD',
                      details: { name: newExtraName.trim() },
                      is_paid: false
                    });
                    if (error) {
                      flash('⚠ Failed to add extra.');
                      return;
                    }
                    setExtraServices([...extraServices, { name: newExtraName.trim(), price: newExtraPrice, currency: 'USD' }]);
                    setNewExtraName('');
                    setNewExtraPrice('');
                  }}
                    className="px-3 py-2 bg-[#0B6E4F] text-[#C9A227] text-xs font-bold rounded-lg hover:bg-[#0B6E4F]/80 border border-[#0B6E4F]/40">Add</button>
                </div>
                {extraServices.length > 0 && (
                  <div className="space-y-1">
                    {extraServices.map((s: any, i: number) => (
                      <div key={i} className="flex justify-between items-center text-xs bg-[#0B6E4F]/10 px-3 py-1.5 rounded-lg border border-[#0B6E4F]/20">
                        <span className="text-[#EDE6D6]">{String(s.name)}</span>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-[#0B6E4F]">{String(s.price)} {String(s.currency)}</span>
                          <button onClick={async () => {
                            const extra = extraServices[i];
                            const { data: existingRows, error: fetchError } = await supabase
                              .from('booking_services')
                              .select('id')
                              .eq('booking_id', sel.id)
                              .eq('service_type', 'extra')
                              .filter('details->>name', 'eq', extra.name)
                              .eq('is_paid', false)
                              .order('created_at', { ascending: false })
                              .limit(1);
                            if (fetchError) {
                              flash('⚠ Failed to remove extra.');
                              return;
                            }
                            if (existingRows && existingRows.length > 0) {
                              const { error: deleteError } = await supabase.from('booking_services').delete().eq('id', existingRows[0].id);
                              if (deleteError) {
                                flash('⚠ Failed to remove extra.');
                                return;
                              }
                            }
                            setExtraServices(extraServices.filter((_: any, j: number) => j !== i));
                          }} className="text-[#722F37] hover:text-[#722F37]/80 font-bold">×</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Tab summary */}
            {isStaff && !isPOS && sel.status !== 'completed' && (() => {
              const isTab1Closed = getSettledReceiptsForSel ? getSettledReceiptsForSel().length > 0 : false;
              return (
                <div className="bg-[#0B6E4F] rounded-2xl p-5 text-[#C9A227] shadow-xl shadow-[#0B6E4F]/20 animate-in fade-in zoom-in duration-500 border border-[#0B6E4F]/40">
                  <div className="flex justify-between items-center mb-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-[#C9A227]/80">Tab Summary</p>
                    <svg className="w-5 h-5 text-[#C9A227]/60 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                  </div>
                  
                  <div className="space-y-2">
                    {/* Accommodation */}
                    {(tabTotals.accommodationTotal > 0 || (isPrepaid && (sel?.collected_amount || 0) === 0)) && (() => {
                      const currentMeta: any = Array.isArray(sel.meta) ? { days: sel.meta } : (sel.meta || {});
                      const lastAdjustment = parseFloat(currentMeta.last_adjustment) || 0;
                      const isExtended = lastAdjustment > 0;

                      return (
                        <div className="flex justify-between items-center opacity-90 border-b border-white/20 pb-2 mb-2">
                          <span className="font-bold">
                            Accommodation {isExtended && <span className="text-amber-200">(Extended)</span>}
                          </span>
                          <div className="flex items-center gap-2">
                            {isPrepaid && (
                              <span className="text-[9px] font-black bg-emerald-400 text-emerald-900 px-2 py-0.5 rounded-md uppercase tracking-wider">PREPAID</span>
                            )}
                            <span className="font-black">${String(tabTotals.accommodationTotal.toFixed(2))}</span>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Extension fee */}
                    {tabTotals.extensionFee > 0 && (
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
                          +${tabTotals.extensionFee.toFixed(2)}
                        </span>
                      </div>
                    )}

                    {/* Meals */}
                    {(() => {
                      const acceptedOrders = activeMeals.filter((o: any) => 
                        (o.status === 'confirmed' || o.status === 'served') && !o.is_paid
                      );
                      
                      if (acceptedOrders.length === 0) return null;

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
                            prepaid: o.prepaid
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
                            prepaid: o.prepaid
                          });
                        }
                        return items;
                      }).flat();

                      const pendingGuide = svcGuide && !activeServices.some((s: any) => s.service_type === 'guide') 
                        ? { name: 'Guide', description: svcGuideNames.filter(n => n.trim()).join(', ') || 'Pending...', price: svcGuidePrice, prepaid: false, pending: true } 
                        : null;

                      const pendingTransport = svcTransport && !activeServices.some((s: any) => s.service_type === 'transportation') && svcTransList.some((t: any) => t.price > 0)
                        ? { name: 'Transport', description: svcTransList.map((t: any) => t.name).filter(Boolean).join(', ') || 'Pending...', price: svcTransList.reduce((s: number, t: any) => s + (t.price || 0), 0), prepaid: false, pending: true } 
                        : null;

                      const sItems = [
                        ...individualMeals,
                        ...activeServices.map((s: any) => {
                          const baseItem = {
                            id: s.id,
                            serviceType: s.service_type,
                            price: s.unit_price * s.quantity,
                            currency: s.currency,
                            prepaid: s.is_paid,
                            details: s.details
                          };
                          
                          if (s.service_type === 'guide') {
                            return { ...baseItem, name: 'Guide', description: s.details?.names || '1 guide' };
                          }
                          if (s.service_type === 'transportation') {
                            return { ...baseItem, name: 'Transport', description: s.details?.name || s.details?.destination || '' };
                          }
                          if (s.service_type === 'drinks') {
                            return { ...baseItem, name: s.details?.name || 'Drink', description: s.currency };
                          }
                          if (s.service_type === 'extra') {
                            return { ...baseItem, name: s.details?.name || 'Extra', description: '' };
                          }
                          return null;
                        }).filter(Boolean),
                        pendingGuide,
                        pendingTransport,
                        svcDiscount > 0 && { name: 'Discount', price: -svcDiscount, prepaid: false }
                      ].filter(Boolean);

                      return (
                        <>
                          {sItems.map((item: any, idx: number) => (
                            <div key={idx} className="flex justify-between items-center text-sm border-b border-white/10 pb-2">
                              <div className="flex flex-col">
                                <span className="font-bold text-[#EDE6D6]">{item.name}</span>
                                {item.description && <span className="text-[10px] text-white/60">{item.description}</span>}
                              </div>
                              <div className="flex items-center gap-2">
                                {item.prepaid && (
                                  <span className="text-[9px] font-black bg-emerald-400 text-emerald-900 px-2 py-0.5 rounded-md uppercase tracking-wider">PREPAID</span>
                                )}
                                {item.pending && (
                                  <span className="text-[9px] font-black bg-amber-400 text-amber-900 px-2 py-0.5 rounded-md uppercase tracking-wider">PENDING</span>
                                )}
                                <span className="font-black text-sm">${String(item.price.toFixed(2))}</span>
                              </div>
                            </div>
                          ))}
                        </>
                      );
                    })()}

                    {/* Drinks total */}
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
                  </div>

                  {/* Total and balance */}
                  <div className="mt-4 pt-4 border-t border-white/20 space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-lg">Total</span>
                      <span className="font-black text-2xl">${String(tabTotals.grandTotal.toFixed(2))}</span>
                    </div>
                    
                    {tabTotals.amountPaid > 0 && (
                      <div className="flex justify-between items-center text-sm opacity-80">
                        <span>Amount Paid</span>
                        <span className="font-bold">${String(tabTotals.amountPaid.toFixed(2))}</span>
                      </div>
                    )}

                    <div className="flex justify-between items-center">
                      <span className="font-bold text-lg">Balance</span>
                      <span className={`font-black text-2xl ${tabTotals.balanceRemaining > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                        ${String(tabTotals.balanceRemaining.toFixed(2))}
                      </span>
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="mt-6 flex gap-3">
                    <button
                      onClick={handleSaveProgress}
                      disabled={loadingAction === 'save'}
                      className="flex-1 py-3 bg-[#1C232E]/30 hover:bg-[#1C232E]/50 text-[#C9A227] rounded-xl text-sm font-bold uppercase tracking-[0.2em] transition-all disabled:opacity-50 border border-[#C9A227]/30"
                    >
                      {loadingAction === 'save' ? 'Saving...' : 'Save Progress'}
                    </button>
                    {handleCheckOut && (
                      <button
                        onClick={handleCheckOut}
                        disabled={loadingAction === 'checkout' || tabTotals.balanceRemaining > 0 && !isBalanceMatched}
                        className="flex-1 py-3 bg-[#C9A227] hover:bg-[#B8860B] text-[#1C232E] rounded-xl text-sm font-black uppercase tracking-[0.2em] transition-all disabled:opacity-50 shadow-lg shadow-[#C9A227]/30"
                      >
                        {loadingAction === 'checkout' ? 'Processing...' : 'Settle Tab'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Receipt display */}
            {showFinalReceipt && selectedReceipt && (
              <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto shadow-2xl">
                  <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 sticky top-0 bg-white rounded-t-2xl z-10">
                    <p className="text-xs font-bold uppercase tracking-widest text-gray-600">
                      Receipt #{String(selectedReceipt.id)}
                    </p>
                    <button onClick={() => setShowFinalReceipt(false)} className="w-8 h-8 flex items-center justify-center rounded-lg transition-all text-gray-600 font-bold text-xl hover:bg-gray-100">×</button>
                  </div>

                  <div ref={receiptRef} className="p-6 space-y-4">
                    <div className="text-center border-b border-gray-200 pb-4">
                      <h2 className="text-xl font-black text-gray-900 uppercase tracking-tight">Final Receipt</h2>
                      <p className="text-xs text-gray-500 mt-1">ID: {String(selectedReceipt.id)}</p>
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600 font-medium">Guest</span>
                        <span className="font-bold text-gray-900">{sel.guest_name}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600 font-medium">Stay</span>
                        <span className="font-bold text-gray-900">{sel.check_in} — {sel.check_out}</span>
                      </div>
                    </div>

                    <hr className="border-gray-200" />

                    <div className="space-y-3">
                      {receiptItems.map((item: any, idx: number) => (
                        <div key={idx} className="flex justify-between items-start text-sm">
                          <div className="flex-1">
                            <span className="font-bold text-gray-900">{item.name}</span>
                            {item.description && <span className="text-gray-500 ml-2">{item.description}</span>}
                          </div>
                          <div className="flex items-center gap-2">
                            {item.prepaid && (
                              <span className="text-[9px] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded uppercase tracking-wider">PREPAID</span>
                            )}
                            <span className="font-bold text-gray-900">${String(item.price.toFixed(2))}</span>
                          </div>
                        </div>
                      ))}
                    </div>

                    <hr className="border-gray-200" />

                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-gray-900">Total</span>
                        <span className="font-black text-xl text-gray-900">${String(tabTotals.grandTotal.toFixed(2))}</span>
                      </div>
                      {tabTotals.amountPaid > 0 && (
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-gray-600">Amount Paid</span>
                          <span className="font-bold text-gray-900">${String(tabTotals.amountPaid.toFixed(2))}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex justify-between items-center pt-2 border-t border-gray-200">
                      <span className="font-bold text-gray-900">Balance</span>
                      <span className={`font-black text-2xl ${tabTotals.balanceRemaining > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                        ${String(tabTotals.balanceRemaining.toFixed(2))}
                      </span>
                    </div>

                    <div className="text-center pt-4">
                      <p className="text-[10px] text-gray-400">Generated by Yurt Camp Management System</p>
                    </div>
                  </div>

                  <div className="flex gap-3 p-4 border-t border-gray-200 bg-gray-50 rounded-b-2xl">
                    <button onClick={handlePrint} className="flex-1 py-3 bg-gray-900 hover:bg-gray-800 text-white text-sm font-bold rounded-lg transition-all">
                      Print PDF
                    </button>
                    <button onClick={handleSaveAsImage} disabled={loadingAction === 'exporting'} className="flex-1 py-3 bg-white hover:bg-gray-100 text-gray-900 text-sm font-bold rounded-lg border border-gray-300 transition-all disabled:opacity-50">
                      {loadingAction === 'exporting' ? 'Exporting...' : 'Save Image'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Receipt history */}
            {isStaff && !isPOS && sel.status !== 'completed' && (() => {
              const settledReceipts = getSettledReceiptsForSel ? getSettledReceiptsForSel() : [];
              if (settledReceipts.length === 0) return null;

              return (
                <div className="border border-[#2A2F36] rounded-xl p-4 space-y-3 bg-[#1C232E]">
                  <div className="flex justify-between items-center">
                    <p className="text-[10px] font-black uppercase tracking-widest text-[#9C9384]">Receipt History</p>
                    <button onClick={() => setExpandedReceiptId(expandedReceiptId === 'history' ? null : 'history')} className="text-[10px] font-bold text-[#0B6E4F] hover:text-[#0B6E4F]/80">
                      {expandedReceiptId === 'history' ? '− Hide' : '+ Show'}
                    </button>
                  </div>
                  
                  {expandedReceiptId === 'history' && (
                    <div className="space-y-2">
                      {settledReceipts.map((receipt: any) => (
                        <div key={receipt.id} className="flex justify-between items-center p-3 bg-[#1C232E]/50 rounded-lg border border-[#2A2F36]">
                          <div>
                            <span className="text-xs font-bold text-[#EDE6D6]">#{String(receipt.id)}</span>
                            <span className="text-[10px] text-[#9C9384] ml-2">{new Date(receipt.created_at).toLocaleDateString()}</span>
                          </div>
                          <button 
                            onClick={() => { setSelectedReceipt(receipt); setShowFinalReceipt(true); }}
                            className="text-[10px] font-bold text-[#0B6E4F] hover:text-[#0B6E4F]/80"
                          >
                            View
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Action message */}
            {actionMsg && (
              <div className="bg-[#1C232E] text-[#EDE6D6] px-4 py-3 rounded-xl text-sm font-bold text-center animate-in fade-in border border-[#2A2F36]">
                {actionMsg}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
