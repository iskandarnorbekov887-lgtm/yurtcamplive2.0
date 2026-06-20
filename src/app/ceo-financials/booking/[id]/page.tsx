'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { supabase, type Booking, type Payment } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';

export default function CEOBookingDetailPage({ params }: { params: { id: string } }) {
  return (
    <ProtectedRoute allowedRoles={['CEO']}>
      <BookingTabView bookingId={parseInt(params.id)} />
    </ProtectedRoute>
  );
}

function BookingTabView({ bookingId }: { bookingId: number }) {
  const { user } = useAuth();
  const router = useRouter();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [receipts, setReceipts] = useState<any[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // Fetch booking details
        const { data: bookingData } = await supabase
          .from('bookings')
          .select('*')
          .eq('id', bookingId)
          .single();

        if (bookingData) {
          setBooking(bookingData);
        }

        // Fetch all receipts for this booking
        const { data: receiptsData } = await supabase
          .from('booking_receipts')
          .select('*')
          .eq('booking_id', bookingId)
          .order('created_at', { ascending: false });

        setReceipts(receiptsData || []);

        // Fetch all payments for this booking
        const { data: paymentsData } = await supabase
          .from('payments')
          .select('*')
          .eq('booking_id', bookingId)
          .order('created_at', { ascending: false });

        setPayments(paymentsData || []);
      } catch (error) {
        console.error('Error fetching booking data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [bookingId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0F1419] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-[#0B6E4F] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="min-h-screen bg-[#0F1419] flex items-center justify-center">
        <p className="text-[#9C9384]">Booking not found</p>
      </div>
    );
  }

  const totalCollected = payments.reduce((sum, p) => sum + p.amount_usd_equivalent, 0);
  const totalCharged = receipts.reduce((sum, r) => sum + r.total_usd, 0);

  return (
    <div className="min-h-screen bg-[#0F1419] font-sans">
      <header className="bg-gradient-to-r from-[#0B6E4F] to-[#0B6E4F]/80 text-[#C9A227] shadow-2xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.back()}
              className="p-3 bg-[#0B6E4F] text-[#C9A227] rounded-xl hover:bg-[#0B6E4F]/80 transition-all shadow-lg border border-[#0B6E4F]/40"
            >
              <svg className="w-8 h-8 text-[#C9A227]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </button>
            <div className="p-2 bg-[#1C232E]/20 rounded-xl backdrop-blur-sm border border-[#5C4A2E]/30">
              <svg className="w-8 h-8 text-[#C9A227]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-[#EDE6D6]">Guest Tab</h1>
              <p className="text-xs text-[#C9A227]/80 font-bold tracking-widest uppercase opacity-80">CEO View Only</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-6 space-y-6">
        {/* Guest Information */}
        <div className="bg-[#1C232E] rounded-2xl shadow-xl p-8 border border-[#5C4A2E]/30">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h2 className="text-3xl font-black text-[#EDE6D6]">{booking.guest_name}</h2>
              <p className="text-sm text-[#9C9384] mt-1">
                {booking.check_in} → {booking.check_out}
              </p>
              <div className="flex gap-2 mt-3">
                <span className={`px-3 py-1 text-xs font-bold rounded-full uppercase tracking-wider ${
                  booking.status === 'completed' ? 'bg-[#0B6E4F]/20 text-[#0B6E4F]' :
                  booking.status === 'checked_in' ? 'bg-[#C9A227]/20 text-[#C9A227]' :
                  booking.status === 'cancelled' ? 'bg-[#722F37]/20 text-[#722F37]' :
                  'bg-[#1C232E]/50 text-[#9C9384]'
                }`}>
                  {booking.status}
                </span>
                <span className="px-3 py-1 text-xs font-bold rounded-full bg-[#0B6E4F]/20 text-[#0B6E4F] uppercase tracking-wider">
                  {booking.source}
                </span>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm font-black text-[#9C9384] uppercase tracking-wider">Total Charged</p>
              <p className="text-3xl font-black text-[#EDE6D6]">${totalCharged.toFixed(2)}</p>
              <p className="text-sm font-black text-[#0B6E4F] mt-1">Collected: ${totalCollected.toFixed(2)}</p>
            </div>
          </div>
        </div>

        {/* Tab History (Continuous Tab) */}
        <div className="bg-[#1C232E] rounded-2xl shadow-xl p-8 border border-[#5C4A2E]/30">
          <h3 className="text-xl font-black text-[#EDE6D6] mb-6">Tab History</h3>
          {receipts.length === 0 ? (
            <p className="text-center text-[#9C9384] italic">No tab history available</p>
          ) : (
            <div className="space-y-6">
              {receipts.map((receipt) => (
                <div key={receipt.id} className="border-2 border-[#5C4A2E]/30 rounded-xl p-6">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <p className="text-sm font-black text-[#9C9384] uppercase tracking-wider">Receipt #{receipt.receipt_id}</p>
                      <p className="text-xs text-[#9C9384]">
                        {new Date(receipt.created_at).toLocaleString()}
                      </p>
                    </div>
                    <p className="text-xl font-black text-[#EDE6D6]">${receipt.total_usd.toFixed(2)}</p>
                  </div>

                  {/* Receipt Details */}
                  {receipt.snapshot && (
                    <div className="space-y-3 mt-4 pt-4 border-t border-[#5C4A2E]/30">
                      {receipt.snapshot.accommodation && (
                        <div className="flex justify-between text-sm">
                          <span className="text-[#9C9384]">Accommodation</span>
                          <span className="text-[#EDE6D6] font-bold">${receipt.snapshot.accommodation.toFixed(2)}</span>
                        </div>
                      )}
                      {receipt.snapshot.meals && receipt.snapshot.meals.lunch > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-[#9C9384]">Lunch ({receipt.snapshot.meals.lunch})</span>
                          <span className="text-[#EDE6D6] font-bold">${(receipt.snapshot.meals.lunch * (receipt.snapshot.services?.guide_price || 0)).toFixed(2)}</span>
                        </div>
                      )}
                      {receipt.snapshot.meals && receipt.snapshot.meals.dinner > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-[#9C9384]">Dinner ({receipt.snapshot.meals.dinner})</span>
                          <span className="text-[#EDE6D6] font-bold">${(receipt.snapshot.meals.dinner * (receipt.snapshot.services?.guide_price || 0)).toFixed(2)}</span>
                        </div>
                      )}
                      {receipt.snapshot.services?.guide > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-[#9C9384]">Guide Service</span>
                          <span className="text-[#EDE6D6] font-bold">${receipt.snapshot.services.guide.toFixed(2)}</span>
                        </div>
                      )}
                      {receipt.snapshot.services?.transport > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-[#9C9384]">Transport</span>
                          <span className="text-[#EDE6D6] font-bold">${receipt.snapshot.services.transport.toFixed(2)}</span>
                        </div>
                      )}
                      {receipt.snapshot.extras && receipt.snapshot.extras.length > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-[#9C9384]">Extras</span>
                          <span className="text-[#EDE6D6] font-bold">${receipt.snapshot.extras.reduce((sum: number, e: any) => sum + e.price, 0).toFixed(2)}</span>
                        </div>
                      )}
                      {receipt.snapshot.drinks && receipt.snapshot.drinks.length > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-[#9C9384]">Drinks</span>
                          <span className="text-[#EDE6D6] font-bold">${receipt.snapshot.drinks.reduce((sum: number, d: any) => sum + (d.price * d.quantity), 0).toFixed(2)}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Payments for this receipt */}
                  {receipt.snapshot?.payments && receipt.snapshot.payments.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-[#5C4A2E]/30">
                      <p className="text-xs font-black text-[#0B6E4F] uppercase tracking-widest mb-2">Payments Received</p>
                      {receipt.snapshot.payments.map((payment: any, idx: number) => (
                        <div key={idx} className="flex justify-between text-sm py-1">
                          <span className="text-[#9C9384]">{payment.method} ({payment.currency})</span>
                          <span className="text-[#EDE6D6] font-bold">${parseFloat(payment.amount || 0).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* All Payments */}
        <div className="bg-[#1C232E] rounded-2xl shadow-xl p-8 border border-[#5C4A2E]/30">
          <h3 className="text-xl font-black text-[#EDE6D6] mb-6">All Payments</h3>
          {payments.length === 0 ? (
            <p className="text-center text-[#9C9384] italic">No payments recorded</p>
          ) : (
            <div className="space-y-3">
              {payments.map((payment) => (
                <div key={payment.id} className="flex justify-between items-center p-4 bg-[#1C232E]/50 rounded-xl border border-[#5C4A2E]/30">
                  <div>
                    <p className="font-bold text-[#EDE6D6]">{payment.method}</p>
                    <p className="text-sm text-[#9C9384]">
                      {payment.amount_original.toFixed(2)} {payment.currency_original}
                      {payment.currency_original !== 'USD' && (
                        <span className="ml-2 text-xs text-[#9C9384]">
                          (${payment.amount_usd_equivalent.toFixed(2)} USD @ {payment.exchange_rate_used})
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-[#9C9384]">
                      {new Date(payment.created_at || '').toLocaleString()}
                    </p>
                  </div>
                  <p className="text-xl font-black text-[#0B6E4F]">${payment.amount_usd_equivalent.toFixed(2)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
