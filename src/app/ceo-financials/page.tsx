'use client';

import { useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { supabase, type Finance } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { useLanguage } from '@/lib/language-context';
import { LanguageSwitcher } from '@/components/language-switcher';
import { useRouter } from 'next/navigation';

export default function CEOFinancialsPage() {
  return (
    <ProtectedRoute allowedRoles={['CEO']}>
      <CEOFinancialCalendar />
    </ProtectedRoute>
  );
}

function CEOFinancialCalendar() {
  const { user, signOut } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [dayFinances, setDayFinances] = useState<Finance[]>([]);
  const [loading, setLoading] = useState(false);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (year: number, month: number) => {
    return new Date(year, month, 1).getDay();
  };

  const handleDayClick = async (day: number) => {
    const date = new Date(year, month, day);
    setSelectedDay(date);
    setLoading(true);

    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    try {
      const { data } = await supabase
        .from('camp_finances')
        .select('*')
        .eq('date', dateStr)
        .order('created_at', { ascending: false });

      setDayFinances(data || []);
    } catch (error) {
      console.error('Error fetching finances:', error);
      setDayFinances([]);
    } finally {
      setLoading(false);
    }
  };

  const handleFinanceClick = (finance: Finance) => {
    router.push(`/ceo-financials/detail/${finance.id}`);
  };

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <header className="bg-gradient-to-r from-indigo-800 to-purple-900 text-white shadow-2xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <a
              href="/ceo"
              className="p-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all shadow-lg"
            >
              <svg className="w-8 h-8 text-indigo-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </a>
            <div className="p-2 bg-white/10 rounded-xl backdrop-blur-sm border border-white/20">
              <svg className="w-8 h-8 text-indigo-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight">Financial Calendar</h1>
              <p className="text-xs text-indigo-300 font-bold tracking-widest uppercase opacity-80">CEO View Only</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/ceo-financials/pricing')}
              className="px-5 py-2.5 bg-emerald-600/90 hover:bg-emerald-600 rounded-xl text-xs font-black transition-all shadow-lg hover:shadow-emerald-500/20 active:scale-95 flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Pricing
            </button>
            <button
              onClick={() => router.push('/ceo-financials/deleted-records')}
              className="px-5 py-2.5 bg-amber-600/90 hover:bg-amber-600 rounded-xl text-xs font-black transition-all shadow-lg hover:shadow-amber-500/20 active:scale-95 flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Deleted Records
            </button>
            <LanguageSwitcher variant="light" />
            <button
              onClick={signOut}
              className="px-5 py-2.5 bg-rose-600/90 hover:bg-rose-600 rounded-xl text-xs font-black transition-all shadow-lg hover:shadow-rose-500/20 active:scale-95 flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-6">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="flex justify-between items-center mb-6">
            <button
              onClick={() => setCurrentDate(new Date(year, month - 1))}
              className="p-2 bg-slate-100 rounded-xl hover:bg-slate-200 transition-all"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h2 className="text-2xl font-black text-slate-800">
              {monthNames[month]} {year}
            </h2>
            <button
              onClick={() => setCurrentDate(new Date(year, month + 1))}
              className="p-2 bg-slate-100 rounded-xl hover:bg-slate-200 transition-all"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          <div className="grid grid-cols-7 gap-2 mb-2">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
              <div key={day} className="text-center text-sm font-bold text-slate-600 py-2">
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-2">
            {Array.from({ length: firstDay }).map((_, i) => (
              <div key={`empty-${i}`} />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const isToday = new Date().toDateString() === new Date(year, month, day).toDateString();
              return (
                <button
                  key={day}
                  onClick={() => handleDayClick(day)}
                  className={`min-h-[80px] p-2 rounded-xl border-2 transition-all ${
                    isToday
                      ? 'border-indigo-600 bg-indigo-50'
                      : 'border-slate-200 hover:border-indigo-400 hover:bg-indigo-50'
                  }`}
                >
                  <span className="text-sm font-bold text-slate-800">{day}</span>
                </button>
              );
            })}
          </div>
        </div>

        {selectedDay && (
          <div className="mt-6 bg-white rounded-2xl shadow-xl p-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-black text-slate-800">
                {selectedDay.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </h3>
              <button
                onClick={() => setSelectedDay(null)}
                className="p-2 hover:bg-slate-100 rounded-xl transition-all"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : (
              <>
                <div className="bg-slate-100 rounded-xl p-4 mb-6 border-2 border-slate-300">
                  <p className="text-sm font-black text-slate-900 mb-1">Net Profit</p>
                  <p className="text-3xl font-black text-slate-900">
                    {(() => {
                      const income = dayFinances.filter(f => f.type === 'income').reduce((sum, f) => sum + f.amount_uzs, 0);
                      const expenses = dayFinances.filter(f => f.type === 'expense').reduce((sum, f) => sum + f.amount_uzs, 0);
                      const net = income - expenses;
                      return `${net.toLocaleString('uz-UZ', { minimumFractionDigits: 2 })} UZS`;
                    })()}
                  </p>
                </div>

                <div className="space-y-3">
                  {dayFinances.map((finance) => (
                    <button
                      key={finance.id}
                      onClick={() => handleFinanceClick(finance)}
                      className={`w-full p-4 rounded-xl border-2 text-left transition-all hover:shadow-lg ${
                        finance.type === 'income'
                          ? 'bg-emerald-50 border-emerald-200 hover:border-emerald-400'
                          : 'bg-rose-50 border-rose-200 hover:border-rose-400'
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-bold text-slate-800">
                            {finance.type === 'income' ? finance.guest_name : finance.category}
                          </p>
                          <p className="text-sm text-slate-600">{finance.description}</p>
                        </div>
                        <p className={`font-black ${
                          finance.type === 'income' ? 'text-emerald-700' : 'text-rose-700'
                        }`}>
                          {finance.original_amount.toLocaleString()} {finance.currency}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>

                {dayFinances.length === 0 && (
                  <p className="text-center text-slate-500 italic">No transactions recorded for this day</p>
                )}
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
