'use client';
import { useState, useEffect, useRef, useMemo } from 'react';

import confetti from 'canvas-confetti';
import { supabase } from '@/lib/supabase';
import { isGcCancelled, formatSpace, handleApproveDatesLogic } from '@/utils/calendar-logic';

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
  syncWarnings: any;
  setSyncWarnings: (w: any) => void;
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
  svcCooking: boolean;
  setSvcCooking: (v: boolean) => void;
  svcCookingPrice: number;
  setSvcCookingPrice: (v: number) => void;
  svcLaundry: boolean;
  setSvcLaundry: (v: boolean) => void;
  svcLaundryPrice: number;
  setSvcLaundryPrice: (v: number) => void;
  svcDiscount: number;
  setSvcDiscount: (v: number) => void;
  svcPayList: any[];
  setSvcPayList: (v: any[]) => void;
  setPayModified: (v: boolean) => void;
  
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
  handleCheckOut: () => Promise<void>;
  handleCancel: () => Promise<void>;
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
}

export function BookingModal(props: BookingModalProps) {
  const {
    selectedItem, setSelectedItem, userRole, currentUserId, pricing, setPricing,
    loadingAction, setLoadingAction, actionMsg, flash, syncWarnings, setSyncWarnings,
    onRefresh, onUpdateBooking, onCheckIn, onCheckOut, onCancelBooking,
    svcAdults, setSvcAdults, svcChildren, setSvcChildren, svcAmount, setSvcAmount,
    isPrepaid, setIsPrepaid, isLunchPrepaid, setIsLunchPrepaid, isDinnerPrepaid, setIsDinnerPrepaid,
    svcLunch, setSvcLunch, svcLunchCount, setSvcLunchCount, svcDinner, setSvcDinner, svcDinnerCount, setSvcDinnerCount,
    svcGuide, setSvcGuide, svcGuidePrice, setSvcGuidePrice, svcGuideNames, setSvcGuideNames,
    svcTransport, setSvcTransport, svcTransList, setSvcTransList,
    svcCooking, setSvcCooking, svcCookingPrice, setSvcCookingPrice,
    svcLaundry, setSvcLaundry, svcLaundryPrice, setSvcLaundryPrice,
    svcDiscount, setSvcDiscount, svcPayList, setSvcPayList, setPayModified,
    showDrinks, setShowDrinks, drinks, selectedDrinks, setSelectedDrinks,
    extraServices, setExtraServices, newExtraName, setNewExtraName, newExtraPrice, setNewExtraPrice,
    showServices, setShowServices, showNotes, setShowNotes, showFinalReceipt, setShowFinalReceipt,
    selectedReceipt, setSelectedReceipt, editingDates, setEditingDates,
    editCheckIn, setEditCheckIn, editCheckOut, setEditCheckOut, dateAdjAmount, setDateAdjAmount,
    valError, setValError, getSettledReceiptsForSel, handleCheckIn, handleCheckOut, handleCancel,
    handleCreateFromEvent, fetchCbuRate, gTotal, debtRemaining, tPaidUsd, isBalanceMatched, today,
    gcEvents, dayEntries
  } = props;

  const isStaff = userRole === 'Manager' || userRole === 'CEO';

  if (!selectedItem) return null;
  const sel = selectedItem.booking;

  const statusColor = (s?: string) => ({
    checked_in: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
    confirmed: 'bg-amber-100 text-amber-700 border border-amber-200',
    completed: 'bg-blue-100 text-blue-700 border border-blue-200',
    cancelled: 'bg-red-100 text-red-700 border border-red-200',
    pending: 'bg-slate-100 text-slate-600 border border-slate-200',
    no_arrival: 'bg-gray-200 text-gray-600 border border-gray-300',
  }[s ?? ''] ?? 'bg-slate-100 text-slate-500');

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
  const isGracePeriodActive = false;
  const canCheckIn = sel?.status === 'confirmed' && daysUntilCheckIn <= 2 && !!onCheckIn;
  const isComingSoon = sel?.status === 'confirmed' && daysUntilCheckIn > 2;
  const isCheckOutDay = sel ? today >= sel.check_out : false;
  const canCheckOut = (sel?.status === 'checked_in' || isGracePeriodActive) && isCheckOutDay && !!onCheckOut;
  const canCancel = sel && ['confirmed', 'pending'].includes(sel.status) && !!onCancelBooking;
  const isAfterNoon = new Date().getHours() >= 12;
  const isAfterTwo = new Date().getHours() >= 14;

  const dTotal_calc = Object.entries(selectedDrinks).reduce((sum: number, [id, qty]: [string, any]) => {
    const drink = drinks.find((d: any) => d.id === parseInt(id));
    return sum + (Number(qty) * (drink?.sold_price || 0));
  }, 0);

  return (
    <>
      <div className="fixed inset-0 z-[100] flex items-center sm:items-start justify-center p-0 sm:p-4 sm:pt-16 pb-safe" onClick={() => setSelectedItem(null)}>
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
        <div className="relative bg-white sm:rounded-2xl shadow-2xl w-full sm:max-w-md h-full sm:h-auto sm:max-h-[85vh] overflow-y-auto pb-20 sm:pb-0" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl z-10">
            <p className="text-[10px] font-black uppercase tracking-widest text-indigo-500">
              {sel ? 'Booking Details' : 'Google Calendar Event'}
            </p>
            <button onClick={() => setSelectedItem(null)} className="w-8 h-8 flex items-center justify-center hover:bg-slate-100 rounded-xl transition-all text-slate-500 font-bold text-xl">×</button>
          </div>

          {!sel ? (
            <div className="p-5 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-black text-slate-900">{String(selectedItem.event?.summary)}</h2>
                  <p className="text-sm text-slate-500">{String(selectedItem.start)} → {String(selectedItem.end)}</p>
                </div>
                {selectedItem.event && isGcCancelled(selectedItem.event) && (
                  <span className="text-xs font-bold px-3 py-1 rounded-full bg-red-100 text-red-700 border border-red-200 flex items-center gap-1">
                    ✕ cancelled
                  </span>
                )}
              </div>
              {selectedItem.event?.description && !selectedItem.event.description.includes('tasks.google.com') && <p className="text-sm text-black bg-slate-50 rounded-xl p-3">{String(selectedItem.event.description)}</p>}
              {selectedItem.event?.location && <p className="text-sm text-slate-500">📍 {String(selectedItem.event.location)}</p>}
              {actionMsg && (
                <div className={`text-sm font-medium px-3 py-2 rounded-lg ${actionMsg.startsWith('⚠') ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>{String(actionMsg)}</div>
              )}
              {(() => {
                const days = Math.ceil((new Date(selectedItem.start + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime()) / 86400000);
                if (selectedItem.event && isGcCancelled(selectedItem.event)) {
                  return (
                    <div className="w-full py-3 px-4 bg-red-50 border border-red-200 rounded-xl text-sm font-bold text-red-700 text-center flex items-center justify-center gap-2">
                      <span>✕</span> Cancelled
                    </div>
                  );
                }
                return days <= 2 ? (
                  <button onClick={() => handleCreateFromEvent(true)} disabled={loadingAction === 'creating'}
                    className="w-full py-2.5 bg-emerald-600 text-white text-sm font-bold rounded-xl hover:bg-emerald-700 transition-all disabled:opacity-60 flex items-center justify-center gap-2">
                    {loadingAction === 'creating' ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : '→'}
                    Check In
                  </button>
                ) : (
                  <div className="w-full py-2.5 bg-sky-50 border border-sky-200 rounded-xl text-sm font-bold text-sky-700 text-center">
                    ⏰ Coming in {String(days)} day{days !== 1 ? 's' : ''}
                  </div>
                );
              })()}
            </div>
          ) : (
            <div className="p-5 space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-black text-slate-900">{String(sel?.guest_name || "Guest")}</h2>
                  <p className="text-sm text-slate-500 mt-0.5">{String(sel?.check_in)} → {String(sel?.check_out)}{sel?.nights ? ` · ${String(sel?.nights)}n` : ''}{(sel?.guest_count || sel?.number_of_people) ? ` · ${String(sel?.guest_count || sel?.number_of_people)} pax` : ''}</p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  {(sel.notes || sel.description) && (
                    <button 
                      onClick={() => setShowNotes(!showNotes)}
                      className="text-[10px] font-black text-indigo-600 hover:text-indigo-700 flex items-center gap-1 bg-indigo-50 px-2 py-1 rounded-lg border border-indigo-100 transition-all active:scale-95"
                    >
                      <svg className={`w-3 h-3 transition-transform ${showNotes ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                      {showNotes ? 'Hide Notes' : 'View Notes'}
                    </button>
                  )}
                  <span className={`text-xs font-bold px-3 py-1 rounded-full capitalize ${statusColor(sel.status)} flex items-center gap-1`}>
                    {statusIcon(sel.status) && <span className={statusIconColor(sel.status)}>{statusIcon(sel.status)}</span>}
                    {String(sel.status).replace('_', ' ')}
                  </span>
                </div>
              </div>

              {showNotes && (sel.notes || sel.description) && (
                <div className="bg-amber-50 rounded-[20px] p-4 border border-amber-100 shadow-sm animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 bg-amber-100 rounded-lg flex items-center justify-center text-amber-600">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    </div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-amber-600">Google Calendar Notes</p>
                  </div>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed font-medium">{String(sel.notes || sel.description)}</p>
                </div>
              )}

              {actionMsg && (
                <div className={`text-sm font-medium px-3 py-2 rounded-lg ${actionMsg.startsWith('⚠') ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>{String(actionMsg)}</div>
              )}

              {syncWarnings[sel.id] === 'deleted' && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
                  <p className="font-bold mb-0.5">⚠ Calendar event deleted</p>
                  <p className="text-xs">The linked Google Calendar event was removed. The booking remains here.</p>
                </div>
              )}

              {sel.status === 'checked_in' && sel.check_out === today && isAfterNoon && (
                <div className={`border-2 rounded-2xl p-4 flex items-center gap-4 ${isAfterTwo ? 'bg-rose-50 border-rose-200 text-rose-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${isAfterTwo ? 'bg-rose-100' : 'bg-amber-100'}`}>
                    <span className="text-2xl">⚠</span>
                  </div>
                  <div>
                    <p className="font-black uppercase tracking-widest text-xs">
                      {isAfterTwo ? 'Critical: Guest Not Checked Out' : 'Late Checkout Warning'}
                    </p>
                    <p className="text-sm font-bold opacity-80">
                      Standard checkout time is 12:00 PM. {isAfterTwo ? 'It is past 2:00 PM. Please check the guest immediately.' : 'Please coordinate with the guest.'}
                    </p>
                    {isAfterTwo && (
                      <p className="text-[10px] mt-2 font-black text-rose-600 bg-white px-2 py-1 rounded w-fit border border-rose-200">
                        CEO MESSAGE: CHECK OUT TIME IS 12 PM
                      </p>
                    )}
                  </div>
                </div>
              )}

              {syncWarnings[sel.id] === 'dates_changed' && (() => {
                const linkedEv = gcEvents.find((e: any) => e.id === sel.google_event_id);
                if (!linkedEv) return null;
                return (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2">
                    <p className="text-sm font-bold text-amber-800">⚠ Dates changed in Google Calendar</p>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-white rounded-lg p-2 border border-amber-100">
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Saved</p>
                        <p className="text-black font-bold">{String(sel.check_in)} → {String(sel.check_out)}</p>
                      </div>
                      <div className="bg-white rounded-lg p-2 border border-emerald-200">
                        <p className="text-[9px] font-black uppercase tracking-widest text-emerald-500">Calendar</p>
                        <p className="text-black font-bold">{String(linkedEv.start)} → {String(linkedEv.end)}</p>
                      </div>
                    </div>
                    {isStaff && onUpdateBooking && (
                      <button
                        onClick={async () => {
                          if (!confirm(`Approve new booking dates from Calendar: ${linkedEv.start} → ${linkedEv.end}?`)) return;
                          await handleApproveDatesLogic({
                            booking: sel,
                            gcEvents,
                            onUpdateBooking,
                            setLoadingAction,
                            setSyncWarnings,
                            flash,
                            onRefresh
                          });
                        }}
                        disabled={loadingAction === `syncdates-${sel.id}`}
                        className="w-full py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-bold rounded-lg transition-all disabled:opacity-60 flex items-center justify-center gap-2">
                        {loadingAction === `syncdates-${sel.id}` ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : '⇵'}
                        Approve dates
                      </button>
                    )}
                  </div>
                );
              })()}

              {(sel.status === 'no_arrival' || sel.status === 'cancelled') && (
                <div className={`px-4 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 select-none cursor-not-allowed ${statusColor(sel.status)}`}>
                  <span className={statusIconColor(sel.status)}>{statusIcon(sel.status)}</span>
                  <span className="capitalize">{String(sel.status).replace('_', ' ')}</span>
                  {sel.status === 'no_arrival' && <span className="text-[10px] font-medium opacity-70">· permanent</span>}
                </div>
              )}

              {sel.status === 'completed' && !isGracePeriodActive && (
                <div className={`px-4 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 select-none cursor-not-allowed ${statusColor(sel.status)}`}>
                  <span className={statusIconColor(sel.status)}>{statusIcon(sel.status)}</span>
                  <span className="capitalize">{String(sel.status).replace('_', ' ')}</span>
                </div>
              )}

              {isStaff && sel.status !== 'no_arrival' && sel.status !== 'cancelled' && (sel.status !== 'completed' || isGracePeriodActive) && (
                <div className="flex flex-wrap gap-2">
                  {sel.status === 'checked_in' && !editingDates && (
                    <div className="w-full">
                      <div className="flex items-center justify-between">
                        <div className="flex flex-col gap-1.5">
                          <span className="px-4 py-2 bg-emerald-100 text-emerald-700 text-sm font-bold rounded-xl border border-emerald-200 flex items-center gap-2">
                            ✓ Checked In
                          </span>
                        </div>
                        <button
                          onClick={() => { setEditingDates(true); setEditCheckIn(sel.check_in); setEditCheckOut(sel.check_out); }}
                          className="text-[10px] font-bold text-indigo-500 hover:text-indigo-700 underline underline-offset-2 decoration-indigo-200 transition-all">
                          Edit Dates
                        </button>
                      </div>
                    </div>
                  )}
                  {editingDates && (
                    <div className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Edit Stay Dates</p>
                        {(sel.collected_amount || 0) > 0 && (
                          <span className="text-[9px] font-black bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded uppercase">Tab Settled</span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] font-bold text-slate-400 uppercase">Check In</label>
                          <input
                            type="date"
                            value={String(editCheckIn)}
                            disabled
                            className="w-full px-2 py-1.5 text-sm rounded-lg border border-slate-200 bg-slate-100 text-slate-500 cursor-not-allowed outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-400 uppercase">Check Out</label>
                          <input
                            type="date"
                            value={String(editCheckOut)}
                            onChange={e => {
                              const v = e.target.value;
                              setEditCheckOut(v);
                              if (v === sel.check_out) setDateAdjAmount('');
                            }}
                            className="w-full px-2 py-2 text-base rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-300 text-black"
                          />
                        </div>
                      </div>

                      {editCheckOut > sel.check_out && (
                        <div className="pt-2 border-t border-slate-200 animate-in fade-in slide-in-from-top-1">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-tight mb-1 block">
                            Stay Extension Price (USD) <span className="text-rose-500">*</span>
                          </label>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-500 font-bold text-sm">+</span>
                            <input
                              type="number"
                              value={String(dateAdjAmount)}
                              onChange={e => setDateAdjAmount(e.target.value)}
                              placeholder="0.00 (required)"
                              className={`w-full pl-7 pr-3 py-2 bg-white border-2 ${!dateAdjAmount || parseFloat(dateAdjAmount) <= 0 ? 'border-rose-300 bg-rose-50' : 'border-emerald-300'} rounded-lg text-base font-black text-black focus:border-indigo-500 outline-none transition-all`}
                            />
                          </div>
                          <p className="text-[8px] text-slate-400 font-bold mt-1 uppercase italic">
                            * Required — will be added to guest tab as extra Accommodation charge.
                          </p>
                        </div>
                      )}

                      {editCheckOut < sel.check_out && (
                        <div className="pt-2 border-t border-slate-200 animate-in fade-in slide-in-from-top-1">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-tight mb-1 block">
                            Refund Amount (USD) — Optional
                          </label>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-rose-400 font-bold text-sm">−</span>
                            <input
                              type="number"
                              value={String(dateAdjAmount)}
                              onChange={e => setDateAdjAmount(e.target.value)}
                              placeholder="0.00 (leave blank if no refund)"
                              className="w-full pl-7 pr-3 py-2 bg-white border border-slate-200 rounded-lg text-base font-black text-black focus:border-rose-400 outline-none transition-all"
                            />
                          </div>
                          <p className="text-[8px] text-rose-400 font-bold mt-1 uppercase italic">
                            * If entered, this amount will be deducted from collected payments.
                          </p>
                        </div>
                      )}

                      <div className="flex gap-2">
                        <button
                          onClick={async () => {
                            if (!confirm(`Update dates to ${editCheckIn} → ${editCheckOut}?`)) return;
                            setLoadingAction('editdates');
                            try {
                              const adj = parseFloat(dateAdjAmount) || 0;
                              const isExtension = editCheckOut > sel.check_out;
                              const isShortening = editCheckOut < sel.check_out;

                              // Block save if extension with no price entered
                              if (isExtension && adj <= 0) {
                                flash('⚠ Extension price is required. Please enter the extra amount to charge.');
                                setLoadingAction('');
                                return;
                              }

                              const updates: any = { 
                                check_in: editCheckIn,
                                check_out: editCheckOut
                              };

                              if (isExtension) {
                                updates.total_price = (sel.total_price || 0) + adj;
                                setSvcAmount((parseFloat(String(svcAmount)) || 0) + adj);
                                flash(`✓ Extended to ${editCheckOut}. +$${adj} added to tab as Accommodation.`);
                              } else if (isShortening && adj > 0) {
                                updates.total_price = Math.max(0, (sel.total_price || 0) - adj);
                                updates.collected_amount = Math.max(0, (sel.collected_amount || 0) - adj);
                                flash(`✓ Stay shortened. $${adj} refund deducted from collected payments.`);
                              } else {
                                flash('✓ Dates updated.');
                              }

                                let currentMeta: any = {};
                                try {
                                  const parsed = typeof sel.special_requests === 'string'
                                    ? JSON.parse(sel.special_requests || '{}')
                                    : (sel.special_requests || {});
                                  currentMeta = Array.isArray(parsed) ? { days: parsed } : (parsed || {});
                                } catch {
                                  currentMeta = {};
                                }
                                updates.special_requests = JSON.stringify({ ...currentMeta, is_manual_dates: true, days: dayEntries });
                                if (onUpdateBooking) await onUpdateBooking(sel.id, updates);

                                flash('✓ Dates updated in System. Google Calendar remains unchanged.');
                                setEditingDates(false);
                                setDateAdjAmount('');
                                if (onRefresh) onRefresh();
                            } catch (e: any) {
                              const msg = e instanceof Error ? e.message : String(e);
                              flash(`⚠ ${msg.slice(0, 100)}`);
                            } finally {
                              setLoadingAction('');
                            }
                          }}
                          disabled={loadingAction === 'editdates' || !editCheckIn || !editCheckOut || editCheckIn > editCheckOut}
                          className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-lg transition-all disabled:opacity-60 flex items-center justify-center gap-2">
                          {loadingAction === 'editdates' ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : '✓'}
                          Save
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
                  {canCheckOut && (
                    <button onClick={async () => {
                        if (gTotal > 0.01) {
                          flash(`⚠ Guest has an open tab of $${gTotal.toFixed(2)}. Please settle Tab before checking out.`);
                          return;
                        }
                        if (!confirm(`Complete stay for ${sel.guest_name}?`)) return;
                        setLoadingAction('checkout_manual');
                        try { if (onCheckOut) await onCheckOut(sel.id); flash('✓ Guest checked out.'); setSelectedItem(null); }
                        catch { flash('⚠ Check-out failed.'); }
                        finally { setLoadingAction(''); }
                      }}
                      disabled={loadingAction === 'checkout_manual'}
                      className={`px-4 py-2 text-sm font-bold rounded-xl transition-all disabled:opacity-60 flex items-center gap-2 ${
                        gTotal > 0.01
                          ? 'bg-rose-100 border-2 border-rose-300 text-rose-700 cursor-not-allowed'
                          : 'bg-blue-600 hover:bg-blue-700 text-white'
                      }`}
                    >
                      {loadingAction === 'checkout_manual' ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : '✈'}
                      {gTotal > 0.01 ? `Open Tab $${gTotal.toFixed(2)}` : 'Check Out'}
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
                <div className="bg-white border-2 border-slate-100 rounded-[32px] p-6 shadow-xl shadow-slate-100/50 mb-6">
                  <div className="flex justify-between items-center mb-6">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-200">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                      </div>
                      <div>
                        <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight leading-tight">Add to Tab</h3>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Post new charges for this guest</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => setShowServices(!showServices)} 
                      className={`text-[10px] font-black px-5 py-2.5 rounded-xl border-2 transition-all active:scale-95 ${showServices ? 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100' : 'bg-indigo-600 text-white border-indigo-700 shadow-lg shadow-indigo-100 hover:bg-indigo-700'}`}
                    >
                      {showServices ? 'HIDE OPTIONS' : 'START NEW ORDER'}
                    </button>
                  </div>
                  
                  {!showServices && (
                    <div 
                      className="group relative flex items-center justify-center py-10 border-2 border-dashed border-slate-200 rounded-[24px] bg-slate-50/50 cursor-pointer hover:bg-white hover:border-indigo-300 transition-all duration-300 overflow-hidden" 
                      onClick={() => setShowServices(true)}
                    >
                      <div className="absolute inset-0 bg-gradient-to-br from-indigo-50/0 to-indigo-50/50 opacity-0 group-hover:opacity-100 transition-opacity" />
                      <div className="relative flex flex-col items-center">
                        <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-md mb-3 group-hover:scale-110 transition-transform">
                          <span className="text-indigo-600 text-3xl font-light">+</span>
                        </div>
                        <p className="text-[11px] font-black text-slate-500 uppercase tracking-[0.2em] group-hover:text-indigo-600 transition-colors">Select Meals or Services</p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {showServices && (sel.status === 'checked_in' || sel.status === 'confirmed') && isStaff && (
                <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300 mt-4">
                  {((sel.collected_amount || 0) === 0 || svcAmount > 0) && (
                    <div className="border border-slate-200 rounded-xl p-4 space-y-3 bg-white animate-in slide-in-from-top-2">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                            {(sel.collected_amount || 0) > 0 ? 'Stay Extension' : 'Stay Price'}
                          </p>
                          <button onClick={() => { 
                              const next = !isPrepaid;
                              setIsPrepaid(next);
                              if (next) setSvcAmount(0); 
                            }}
                            className={`px-2 py-0.5 text-[8px] font-black uppercase tracking-wider rounded-md border transition-all ${isPrepaid ? 'bg-emerald-100 text-emerald-700 border-emerald-300' : 'bg-slate-50 text-slate-400 border-slate-200 hover:border-slate-300'}`}>
                            {isPrepaid ? '✓ Pre-paid' : 'Pre-paid'}
                          </button>
                        </div>
                      </div>
                      <div className="space-y-4 pt-2">
                        {(sel.collected_amount || 0) > 0 ? (
                          <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-center justify-between mb-2">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 bg-emerald-500 rounded-full flex items-center justify-center text-white shrink-0">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                              </div>
                              <div>
                                <div className="flex items-center gap-2 mb-0.5">
                                  <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest leading-none">Stay Prepaid</p>
                                  <span className="w-1 h-1 bg-emerald-300 rounded-full" />
                                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-none">{svcAdults} Adults {svcChildren > 0 ? `· ${svcChildren} Children` : ''}</p>
                                </div>
                                <p className="text-sm font-black text-slate-900">Original Stay Settled</p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-[10px] font-bold text-slate-400 uppercase">Paid Total</p>
                              <p className="text-sm font-black text-emerald-600">${String((sel.collected_amount || 0).toFixed(2))}</p>
                            </div>
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 gap-4 pb-4 border-b border-slate-100">
                            <div className="space-y-1.5">
                              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Adults *</label>
                              <input 
                                type="number" 
                                value={String(svcAdults || '')} 
                                onChange={e => setSvcAdults(parseInt(e.target.value) || 0)}
                                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-base font-black text-black focus:border-indigo-500 outline-none transition-all"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Children</label>
                              <input 
                                type="number" 
                                value={String(svcChildren || '')} 
                                onChange={e => setSvcChildren(parseInt(e.target.value) || 0)}
                                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-base font-black text-black focus:border-indigo-500 outline-none transition-all"
                              />
                            </div>
                          </div>
                        )}

                        {/* Dashboard Lockdown: Show original price as disabled if settled */}
                        {(sel.collected_amount || 0) > 0 && (
                          <div className="space-y-1.5 opacity-60">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Base Stay Price (Locked)</label>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                              <input 
                                type="text" 
                                value={String((sel.total_price || 0).toFixed(2))}
                                disabled 
                                className="w-full pl-8 pr-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-base font-black text-slate-500 cursor-not-allowed"
                              />
                            </div>
                          </div>
                        )}

                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                            {(sel.collected_amount || 0) > 0 ? 'Stay Extension Price (USD)' : 'Stay Price (USD)'}
                          </label>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                            <input 
                              type="number" 
                              value={String(svcAmount || '')} 
                              onChange={e => setSvcAmount(parseFloat(e.target.value) || 0)}
                              disabled={isPrepaid}
                              className="w-full pl-8 pr-3 py-3 bg-slate-50 border border-slate-200 rounded-xl text-base font-black text-black focus:border-indigo-500 outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                              placeholder="0.00"
                            />
                          </div>
                          <p className="text-[8px] text-slate-400 font-bold uppercase tracking-widest italic">
                            {isPrepaid ? '* Accommodation is marked as pre-paid.' : (sel.collected_amount || 0) > 0 ? '* Tab 1 is settled. Enter fee for extra night(s) only.' : '* Enter total price for the stay.'}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="border border-slate-200 rounded-xl p-4 space-y-3 bg-white">
                    <div className="flex justify-between items-center">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Food</p>
                      <button onClick={() => {
                        const next = !(isLunchPrepaid || isDinnerPrepaid);
                        setIsLunchPrepaid(next);
                        setIsDinnerPrepaid(next);
                      }}
                        className={`px-2 py-0.5 text-[8px] font-black uppercase tracking-wider rounded-md border transition-all ${(isLunchPrepaid || isDinnerPrepaid) ? 'bg-emerald-100 text-emerald-700 border-emerald-300' : 'bg-slate-50 text-slate-400 border-slate-200 hover:border-slate-300'}`}>
                        {(isLunchPrepaid || isDinnerPrepaid) ? '✓ Pre-paid' : 'Pre-paid'}
                      </button>
                    </div>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <label className="flex items-center gap-2 cursor-pointer min-w-[80px]">
                            <input type="checkbox" checked={svcLunch} onChange={e => { setSvcLunch(e.target.checked); if (e.target.checked && svcLunchCount <= 0) setSvcLunchCount(1); }} className="w-5 h-5 border-2 border-slate-300 text-indigo-600 rounded" />
                            <span className="text-sm font-bold text-slate-900">Lunch</span>
                          </label>
                          {svcLunch && <input type="number" value={String(svcLunchCount)} onChange={e => setSvcLunchCount(parseInt(e.target.value) || 0)} placeholder="Qty"
                            className={`w-16 px-2 py-2 border-2 ${svcLunchCount <= 0 ? 'border-rose-300 bg-rose-50' : 'border-slate-200 bg-white'} rounded-lg text-base font-bold text-black focus:border-indigo-500 transition-all`} />}
                        </div>
                        <div className="flex items-center gap-2">
                          {svcLunch && pricing?.lunch_price && pricing.lunch_price > 0 && (
                            <span className={`text-xs font-bold text-slate-500 ${isLunchPrepaid ? 'line-through opacity-50' : ''}`}>${String((svcLunchCount * pricing.lunch_price).toFixed(2))}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <label className="flex items-center gap-2 cursor-pointer min-w-[80px]">
                            <input type="checkbox" checked={svcDinner} onChange={e => { setSvcDinner(e.target.checked); if (e.target.checked && svcDinnerCount <= 0) setSvcDinnerCount(1); }} className="w-5 h-5 border-2 border-slate-300 text-indigo-600 rounded" />
                            <span className="text-sm font-bold text-slate-900">Dinner</span>
                          </label>
                          {svcDinner && <input type="number" value={String(svcDinnerCount)} onChange={e => setSvcDinnerCount(parseInt(e.target.value) || 0)} placeholder="Qty"
                            className={`w-16 px-2 py-2 border-2 ${svcDinnerCount <= 0 ? 'border-rose-300 bg-rose-50' : 'border-slate-200 bg-white'} rounded-lg text-base font-bold text-black focus:border-indigo-500 transition-all`} />}
                        </div>
                        <div className="flex items-center gap-2">
                          {svcDinner && pricing?.dinner_price && pricing.dinner_price > 0 && (
                            <span className={`text-xs font-bold text-slate-500 ${isDinnerPrepaid ? 'line-through opacity-50' : ''}`}>${String((svcDinnerCount * pricing.dinner_price).toFixed(2))}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="border border-slate-200 rounded-xl p-4 space-y-3 bg-white">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Other Services</p>
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
                            }} className="w-5 h-5 border-2 border-slate-300 text-indigo-600 rounded" />
                            <div className="flex flex-col">
                              <span className="text-sm font-bold text-slate-900">Guide Service</span>
                              {pricing?.guide_price && pricing.guide_price > 0 && (
                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">System Price: ${String(pricing.guide_price)} / guide</span>
                              )}
                            </div>
                          </label>
                          {svcGuide && (
                            <div className="flex items-center gap-2">
                              <button type="button" onClick={() => setSvcGuidePrice(Math.max(0, svcGuidePrice - 5))} className="w-8 h-8 flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-black text-sm transition-all shadow-sm">－</button>
                              <div className="relative">
                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-[10px]">$</span>
                                <input type="number" value={String(svcGuidePrice)} onChange={e => setSvcGuidePrice(parseFloat(e.target.value) || 0)}
                                  className="w-20 pl-5 pr-2 py-2 bg-white border-2 border-slate-200 rounded-xl text-base font-black text-black focus:border-indigo-500 outline-none text-center" />
                              </div>
                              <button type="button" onClick={() => setSvcGuidePrice(svcGuidePrice + 5)} className="w-8 h-8 flex items-center justify-center bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-xl font-black text-sm transition-all shadow-sm">＋</button>
                            </div>
                          )}
                        </div>
                        {svcGuide && (
                          <div className="space-y-2">
                            {svcGuideNames.map((name: any, ni: number) => (
                              <div key={ni} className="flex gap-2">
                                <input type="text" value={String(name || '')} onChange={e => { const next = [...svcGuideNames]; next[ni] = e.target.value; setSvcGuideNames(next); }}
                                  placeholder={`Guide ${ni + 1} name...`}
                                  className={`flex-1 px-3 py-2 border-2 ${!String(name).trim() ? 'border-rose-300 bg-rose-50' : 'border-slate-200 bg-white'} rounded-lg text-base font-bold text-black focus:border-indigo-500 transition-all`} />
                                {svcGuideNames.length > 1 && <button type="button" onClick={() => { setSvcGuideNames(svcGuideNames.filter((_: any, i: number) => i !== ni)); setSvcGuidePrice(Math.max(0, svcGuidePrice - 40)); }}
                                  className="text-rose-500 hover:text-rose-600 font-black text-xl px-1">×</button>}
                              </div>
                            ))}
                            <button type="button" onClick={() => { setSvcGuideNames([...svcGuideNames, '']); setSvcGuidePrice(svcGuidePrice + 40); }}
                              className="w-full py-1.5 border-2 border-dashed border-slate-200 rounded-xl text-[10px] font-black text-slate-400 uppercase tracking-widest hover:border-indigo-300 hover:text-indigo-500 transition-all">+ Add Another Guide ($40)</button>
                          </div>
                        )}
                      </div>
                      <div className="space-y-2 pt-2 border-t border-slate-100">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={svcTransport} onChange={e => setSvcTransport(e.target.checked)} className="w-5 h-5 border-2 border-slate-300 text-indigo-600 rounded" />
                          <span className="text-sm font-bold text-slate-900">Transport</span>
                        </label>
                        {svcTransport && (
                          <div className="space-y-3">
                            {svcTransList.map((trans: any, ti: number) => (
                              <div key={ti} className="p-3 border border-slate-100 rounded-xl bg-slate-50/50 space-y-2">
                                <div className="flex justify-between items-center">
                                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Transfer {String(ti + 1)}</span>
                                  {svcTransList.length > 1 && <button type="button" onClick={() => setSvcTransList(svcTransList.filter((_: any, i: number) => i !== ti))} className="text-rose-600 hover:text-rose-700 font-bold text-xs">✕ Remove</button>}
                                </div>
                                <input type="text" value={String(trans.name)} onChange={e => setSvcTransList(svcTransList.map((t: any, i: number) => i === ti ? { ...t, name: e.target.value } : t))} placeholder="Driver Name..."
                                  className={`w-full px-3 py-2 border-2 ${!String(trans.name).trim() ? 'border-rose-300 bg-rose-50' : 'border-slate-200 bg-white'} rounded-lg text-base font-bold text-black focus:border-indigo-500 transition-all`} />
                                <div className="flex gap-2">
                                  <input type="text" value={String(trans.details)} onChange={e => setSvcTransList(svcTransList.map((t: any, i: number) => i === ti ? { ...t, details: e.target.value } : t))} placeholder="From/To..."
                                    className={`flex-1 px-3 py-2 border-2 ${!String(trans.details).trim() ? 'border-rose-300 bg-rose-50' : 'border-slate-200 bg-white'} rounded-lg text-base font-bold text-black focus:border-indigo-500 transition-all`} />
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[10px] font-bold text-slate-400">$</span>
                                    <input type="number" value={String(trans.price)} onChange={e => setSvcTransList(svcTransList.map((t: any, i: number) => i === ti ? { ...t, price: parseFloat(e.target.value) || 0 } : t))} placeholder="Price"
                                      className={`w-20 px-2 py-2 border-2 ${trans.price <= 0 ? 'border-rose-300 bg-rose-50' : 'border-slate-200 bg-white'} rounded-lg text-base font-bold text-black focus:border-indigo-500 transition-all`} />
                                  </div>
                                </div>
                              </div>
                            ))}
                            <button type="button" onClick={() => setSvcTransList([...svcTransList, { name: '', details: '', price: 0 }])}
                              className="w-full py-1.5 border-2 border-dashed border-slate-200 rounded-xl text-[10px] font-black text-slate-400 uppercase tracking-widest hover:border-indigo-300 hover:text-indigo-500 transition-all">+ Add Transfer</button>
                          </div>
                        )}
                      </div>
                      <div className="space-y-2 pt-2 border-t border-slate-100">
                        <div className="flex justify-between items-center">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={svcCooking} onChange={e => setSvcCooking(e.target.checked)} className="w-5 h-5 border-2 border-slate-300 text-indigo-600 rounded" />
                            <span className="text-sm font-bold text-slate-900">Cooking Class</span>
                          </label>
                          {svcCooking && <div className="flex items-center gap-2"><span className="text-xs font-bold text-slate-400">$</span>
                            <input type="number" value={String(svcCookingPrice)} onChange={e => setSvcCookingPrice(parseFloat(e.target.value) || 0)} placeholder="Price"
                              className={`w-24 px-3 py-2 border-2 ${svcCookingPrice <= 0 ? 'border-rose-300 bg-rose-50' : 'border-slate-200 bg-white'} rounded-lg text-base font-bold text-black focus:border-indigo-500 transition-all`} /></div>}
                        </div>
                      </div>
                      <div className="space-y-2 pt-2 border-t border-slate-100">
                        <div className="flex justify-between items-center">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={svcLaundry} onChange={e => setSvcLaundry(e.target.checked)} className="w-5 h-5 border-2 border-slate-300 text-indigo-600 rounded" />
                            <span className="text-sm font-bold text-slate-900">Laundry</span>
                          </label>
                          {svcLaundry && <div className="flex items-center gap-2"><span className="text-xs font-bold text-slate-400">$</span>
                            <input type="number" value={String(svcLaundryPrice)} onChange={e => setSvcLaundryPrice(parseFloat(e.target.value) || 0)} placeholder="Price"
                              className={`w-24 px-3 py-2 border-2 ${svcLaundryPrice <= 0 ? 'border-rose-300 bg-rose-50' : 'border-slate-200 bg-white'} rounded-lg text-base font-bold text-black focus:border-indigo-500 transition-all`} /></div>}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {(canCheckOut || sel.status === 'checked_in') && isStaff && (
                <div className="border border-slate-200 rounded-xl p-4 space-y-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Extra Services</p>
                  <button onClick={() => setShowDrinks(!showDrinks)} className="text-sm font-bold text-indigo-600 hover:text-indigo-700">{showDrinks ? '− Hide Drinks' : '+ Add Drinks'}</button>
                  {showDrinks && drinks.length > 0 && (
                    <div className="grid grid-cols-2 gap-2">
                      {drinks.map((d: any) => (
                        <div key={d.id} className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2">
                          <span className="text-xs text-black flex-1 truncate">{String(d.name)}</span>
                          <div className="flex items-center gap-1">
                            <button onClick={() => setSelectedDrinks({ ...selectedDrinks, [d.id]: Math.max(0, (selectedDrinks[d.id] || 0) - 1) })} className="w-5 h-5 rounded bg-slate-200 text-slate-600 text-xs font-bold hover:bg-slate-300">−</button>
                            <span className="w-5 text-center text-xs font-bold text-black">{String(selectedDrinks[d.id] || 0)}</span>
                            <button onClick={() => setSelectedDrinks({ ...selectedDrinks, [d.id]: (selectedDrinks[d.id] || 0) + 1 })} className="w-5 h-5 rounded bg-indigo-100 text-indigo-700 text-xs font-bold hover:bg-indigo-200">+</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <input type="text" value={String(newExtraName)} onChange={e => setNewExtraName(e.target.value)} placeholder="Service name"
                      className="flex-1 px-3 py-2 text-base rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-300 text-black" />
                    <input type="number" value={String(newExtraPrice)} onChange={e => setNewExtraPrice(e.target.value)} placeholder="Price"
                      className="w-20 px-3 py-2 text-base rounded-lg border border-slate-200 focus:outline-none text-black" />
                    <button onClick={() => { if (!newExtraName.trim()) return; setExtraServices([...extraServices, { name: newExtraName.trim(), price: newExtraPrice, currency: 'USD' }]); setNewExtraName(''); setNewExtraPrice(''); }}
                      className="px-3 py-2 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700">Add</button>
                  </div>
                  {extraServices.length > 0 && (
                    <div className="space-y-1">
                      {extraServices.map((s: any, i: number) => (
                        <div key={i} className="flex justify-between items-center text-xs bg-indigo-50 px-3 py-1.5 rounded-lg">
                          <span className="text-black">{String(s.name)}</span>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-indigo-700">{String(s.price)} {String(s.currency)}</span>
                            <button onClick={() => setExtraServices(extraServices.filter((_: any, j: number) => j !== i))} className="text-red-400 hover:text-red-600 font-bold">×</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {isStaff && (
                <div className="bg-indigo-600 rounded-2xl p-5 text-white shadow-xl shadow-indigo-200 animate-in fade-in zoom-in duration-500">
                  <div className="flex justify-between items-center mb-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-indigo-200">Tab Summary</p>
                    <svg className="w-5 h-5 text-indigo-300 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                  </div>
                  
                  <div className="space-y-2">
                    {(svcAmount > 0 || (isPrepaid && (sel.collected_amount || 0) === 0)) && (
                      <div className="flex justify-between items-center opacity-90 border-b border-white/20 pb-2 mb-2">
                        <span className="font-bold">Accommodation</span>
                        {isPrepaid ? (
                          <span className="text-[10px] font-black bg-emerald-400 text-emerald-900 px-2 py-0.5 rounded-md uppercase tracking-wider">Prepaid</span>
                        ) : (
                          <span className="font-black">${String(svcAmount.toFixed(2))}</span>
                        )}
                      </div>
                    )}
                    
                    {(() => {
                      const sItems = [
                        svcLunch && { name: 'Lunch', count: svcLunchCount, price: pricing.lunch_price, prepaid: isLunchPrepaid },
                        svcDinner && { name: 'Dinner', count: svcDinnerCount, price: pricing.dinner_price, prepaid: isDinnerPrepaid },
                        svcGuide && { name: 'Guide', price: svcGuidePrice, prepaid: false },
                        svcTransport && { name: 'Transport', price: svcTransList.reduce((s: number, t: any) => s + (t.price || 0), 0), prepaid: false },
                        svcLaundry && { name: 'Laundry', price: svcLaundryPrice, prepaid: false },
                        svcCooking && { name: 'Cooking Class', price: svcCookingPrice, prepaid: false }
                      ].filter(Boolean) as any[];

                      if (sItems.length === 0) return null;

                      return sItems.map((item: any, idx: number) => (
                        <div key={idx} className="flex justify-between items-center opacity-90 border-b border-white/10 pb-1 mb-1 last:border-none last:pb-0 last:mb-0">
                          <span className="font-bold">{String(item.name)} {item.count ? `x${String(item.count)}` : ''}</span>
                          {item.prepaid ? (
                            <span className="text-[9px] font-black bg-emerald-400 text-emerald-900 px-2 py-0.5 rounded-md uppercase tracking-wider">Prepaid</span>
                          ) : (
                            <span className="font-black">${String((item.count ? item.count * item.price : item.price).toFixed(2))}</span>
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
                  </div>

                  <div className="mt-4 pt-4 border-t border-indigo-400 flex justify-between items-end">
                    <div className="flex-1">
                      <p className="text-[10px] font-black uppercase tracking-widest text-indigo-100 mb-1">
                        {gTotal > 0 ? 'Current Open Tab' : 'Tab Settled (Ready)'}
                      </p>
                      <p className="text-3xl font-black tracking-tighter leading-none mb-2">
                        ${String(gTotal.toFixed(2))}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {isStaff && sel.status !== 'completed' && (
                  debtRemaining > 1.00 && (
                    <div className="bg-white border-2 border-slate-100 rounded-2xl p-5 space-y-4 shadow-sm">
                      <div className="flex justify-between items-center">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Payment Collection</p>
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
                            <div key={pi} className="space-y-3 p-4 bg-slate-50/50 rounded-2xl border border-slate-100 animate-in slide-in-from-top-2 duration-300">
                              <div className="flex justify-between items-center">
                                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Payment {String(pi + 1)}</label>
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
                                        const stillOwedUsd = Math.max(0, debtRemaining - otherRowsPaidUsd);
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
                                    className="w-full px-4 py-3 bg-white border-2 border-slate-200 rounded-2xl text-base font-black text-black outline-none focus:border-indigo-500 transition-all shadow-sm"
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
                                        className="w-full pl-14 pr-3 py-2.5 bg-white border-2 border-slate-200 rounded-xl text-sm font-black text-black outline-none focus:border-indigo-500 shadow-sm"
                                      />
                                    </div>
                                  </div>
                                )}

                                <div className="col-span-12 space-y-1.5">
                                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-tighter">Method</span>
                                  <div className="flex gap-2">
                                    {(['Cash', 'Card/Online'] as const).map((m: any) => (
                                      <button
                                        key={m}
                                        onClick={() => setSvcPayList(svcPayList.map((p: any, i: number) => i === pi ? { ...p, method: m } : p))}
                                        className={`flex-1 py-3 rounded-2xl text-xs font-black uppercase tracking-tighter transition-all border-2 ${
                                          pay.method === m 
                                            ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg' 
                                            : 'bg-white border-slate-200 text-slate-400 hover:border-indigo-100'
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
                                        const stillOwedUsd = Math.max(0, debtRemaining - otherRowsPaidUsd);
                                        const r = pay.currency === 'USD' ? 1 : (pay.currency === 'UZS' ? (pricing?.usd_to_uzs || 12500) : (pricing?.usd_to_eur || 0.92));
                                        const matchAmt = stillOwedUsd * r;
                                        setSvcPayList(svcPayList.map((p: any, i: number) => i === pi ? { ...p, amount: matchAmt > 0 ? (pay.currency === 'UZS' ? Math.round(matchAmt).toString() : matchAmt.toFixed(2)) : '' } : p));
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
                                        setPayModified(true);
                                        setSvcPayList(svcPayList.map((p: any, i: number) => i === pi ? { ...p, amount: e.target.value } : p));
                                      }}
                                      placeholder="0.00"
                                      className={`w-full ${pay.currency === 'UZS' ? 'pl-11' : 'pl-8'} pr-4 py-4 bg-white border-2 border-slate-200 rounded-3xl text-xl font-black text-black focus:border-indigo-500 shadow-md`}
                                    />
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}

                        <button
                          onClick={() => {
                            const remaining = Math.max(0, debtRemaining - tPaidUsd);
                            setSvcPayList([...svcPayList, { 
                              amount: remaining > 1.00 ? remaining.toFixed(2) : '', 
                              currency: 'USD', 
                              method: 'Cash' 
                            }]);
                          }}
                          className="w-full py-3 border-2 border-dashed border-slate-200 rounded-2xl text-[10px] font-black text-slate-400 uppercase tracking-widest hover:border-indigo-300 hover:text-indigo-500 transition-all bg-slate-50/30"
                        >
                          + Add Another Currency
                        </button>

                        <div className="sticky bottom-0 left-0 right-0 p-4 bg-white/80 backdrop-blur-md border-t border-slate-100 -mx-4 -mb-4 rounded-b-[24px] z-30 flex flex-col gap-2">
                          {!isBalanceMatched && gTotal > 0 && (
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
                                  const stillOwedUsd = Math.max(0, debtRemaining - otherRowsPaidUsd);
                                  const lastPay = svcPayList[lastIdx];
                                  const r = lastPay.currency === 'USD' ? 1 : (lastPay.currency === 'UZS' ? (pricing?.usd_to_uzs || 12500) : (pricing?.usd_to_eur || 0.92));
                                  const matchAmt = stillOwedUsd * r;
                                  setSvcPayList(svcPayList.map((p: any, i: number) => i === lastIdx ? { ...p, amount: matchAmt > 0 ? (lastPay.currency === 'UZS' ? Math.round(matchAmt).toString() : matchAmt.toFixed(2)) : '' } : p));
                                }}
                                className="text-[9px] font-black text-indigo-600 underline uppercase"
                              >
                                Auto-Fix
                              </button>
                            </div>
                          )}
                          <button
                            onClick={() => {
                              if (!isPrepaid && svcAmount <= 0 && (sel.collected_amount || 0) === 0) {
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
                            disabled={loadingAction === 'checkout' || gTotal <= 0}
                            className={`w-full py-4 rounded-2xl font-black uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2 shadow-xl ${(!isBalanceMatched || gTotal <= 0) ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none' : 'bg-indigo-600 text-white hover:bg-indigo-700 hover:scale-[1.02] active:scale-95 shadow-indigo-100'}`}
                          >
                            {loadingAction === 'checkout' ? 'Processing...' : 'Review & Pay Tab'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )
              )}

              {/* FOLIO HISTORY — settled tabs (green) + active tab (indigo) */}
              {isStaff && (() => {
                const receipts = getSettledReceiptsForSel();
                const tabCount = receipts.length;
                if (tabCount === 0 && gTotal <= 0.01 && (sel.collected_amount || 0) === 0) return null;
                return (
                  <div className="border border-slate-100 rounded-2xl p-4 bg-slate-50/50 space-y-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Guest Folio</p>
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
                          Tab {String(tabCount + 1)} — Active {gTotal > 0.01 ? `($${gTotal.toFixed(2)})` : '(Empty)'}
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
                  <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => setShowFinalReceipt(false)} />
                  <div className="relative bg-white rounded-[32px] shadow-2xl w-full max-w-sm max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200">
                      <div className="bg-[#6366f1] px-6 py-10 text-white text-center relative overflow-hidden">
                        <div className="absolute top-4 right-4 z-10">
                          <button onClick={() => setShowFinalReceipt(false)} className="text-white/40 hover:text-white transition-all text-2xl font-bold">×</button>
                        </div>
                        
                        <div className="relative z-10 flex flex-col items-center">
                          <div className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center mb-4 backdrop-blur-sm border border-white/20">
                            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                          </div>
                          
                          <h3 className="text-2xl font-black uppercase tracking-tight mb-2">Final Receipt</h3>
                          <p className="text-[10px] font-black tracking-widest text-white/60 uppercase mb-4">Receipt #{selectedReceipt?.id || 'PENDING'}</p>
                          
                          {selectedReceipt && (
                            <div className="bg-white/20 backdrop-blur-md border border-white/30 rounded-lg px-3 py-1.5 text-[9px] font-black uppercase tracking-widest">
                              Settled: {new Date(selectedReceipt.settled_at || selectedReceipt.date || Date.now()).toLocaleString()}
                            </div>
                          )}
                        </div>
                      </div>

                    <div className="p-6 space-y-6">
                      <div className="space-y-4">
                        <div className="flex justify-between items-center">
                          <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Guest</span>
                          <span className="text-base font-black text-slate-900">{String(sel.guest_name)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Stay</span>
                          <span className="text-base font-black text-slate-900 flex items-center gap-2">
                            {String(sel.check_in)}
                            <svg className="w-4 h-4 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                              Tab #{String(selectedReceipt.id)}
                            </p>
                            
                            <div className="space-y-3">
                              {((selectedReceipt.items?.accommodation || 0) > 0 || selectedReceipt.items?.isPrepaid) && (
                                <div className="flex justify-between items-center text-sm">
                                  <span className="text-slate-600 font-bold">Stay Price</span>
                                  {selectedReceipt.items?.isPrepaid ? (
                                    <span className="text-[10px] font-black bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded uppercase tracking-wider">Prepaid</span>
                                  ) : (
                                    <span className="text-slate-900 font-black">${String((selectedReceipt.items.accommodation || 0).toFixed(2))}</span>
                                  )}
                                </div>
                              )}
                              
                              {(() => {
                                const meals = selectedReceipt.items?.meals || {};
                                return Object.entries(meals).map(([type, count]: [string, any]) => {
                                  if (!count) return null;
                                  const price = type === 'lunch' ? (pricing?.lunch_price || 10) : (pricing?.dinner_price || 10);
                                  return (
                                    <div key={type} className="flex justify-between items-center text-sm">
                                      <span className="text-slate-400 font-medium capitalize">{type} ×{String(count)}</span>
                                      <span className="text-slate-500 font-bold">${String((count * price).toFixed(2))}</span>
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
                            <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest bg-indigo-50 px-2.5 py-1 rounded-md w-fit border border-indigo-100">
                              Active Tab Breakdown
                            </p>
                            <div className="space-y-3 bg-slate-50/50 rounded-2xl p-4 border border-slate-100">
                              {(svcAmount > 0 || (isPrepaid && (sel.collected_amount || 0) === 0)) && (
                                <div className="flex justify-between items-center text-sm">
                                  <span className="text-slate-600 font-bold">Stay Price</span>
                                  {isPrepaid && (sel.collected_amount || 0) === 0 ? (
                                    <span className="text-[10px] font-black bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded uppercase tracking-wider">Prepaid</span>
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
                                  svcLaundry && { name: 'Laundry', price: svcLaundryPrice },
                                  svcCooking && { name: 'Cooking Class', price: svcCookingPrice }
                                ].filter(Boolean) as any[];

                                return items.map((item, i) => (
                                  <div key={i} className="flex justify-between items-center text-sm">
                                    <span className="text-slate-400 font-medium">{item.name} {item.count ? `×${item.count}` : ''}</span>
                                    {item.prepaid ? (
                                      <span className="text-[9px] font-black bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded uppercase tracking-wider">Prepaid</span>
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

                      {(selectedReceipt || sel.status === 'completed' || (sel.status === 'checked_in' && gTotal === 0 && (sel.collected_amount || 0) > 0)) ? (
                        <div className="w-full py-5 bg-[#f0fdf4] text-emerald-700 rounded-[20px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-3 border-2 border-emerald-100 shadow-sm shadow-emerald-100/50">
                          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                          Paid & Settled
                        </div>
                      ) : (
                        <button
                          onClick={async () => {
                            const needsAccom = (sel.collected_amount || 0) === 0 && !isPrepaid && svcAmount <= 0;
                            if (needsAccom) {
                              setValError('Stay Price is missing. Please enter the guest\'s accommodation cost before proceeding.');
                              setShowFinalReceipt(false);
                              setShowServices(true);
                              return;
                            }
                            if (handleCheckOut) await handleCheckOut();
                          }}
                          disabled={loadingAction === 'checkout' || !isBalanceMatched || gTotal <= 0}
                          className={`w-full py-5 rounded-[20px] font-black uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2 shadow-lg ${(!isBalanceMatched || gTotal <= 0) ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none' : 'bg-[#6366f1] text-white hover:bg-[#4f46e5] active:scale-95 shadow-indigo-200'}`}
                        >
                          Confirm & Settle Tab
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {valError && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setValError(null)} />
          <div className="relative bg-white rounded-[32px] shadow-2xl w-full max-w-sm overflow-hidden p-8 space-y-6 text-center">
            <h3 className="text-2xl font-black uppercase tracking-tight text-rose-500">Checkout Blocked</h3>
            <p className="text-slate-600 text-sm font-medium leading-relaxed">{String(valError)}</p>
            <button onClick={() => setValError(null)} className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black uppercase hover:bg-slate-800 transition-all">I Understand</button>
          </div>
        </div>
      )}
    </>
  );
}
