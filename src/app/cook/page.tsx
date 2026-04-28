'use client';

import { useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { supabase, type Booking } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { useLanguage } from '@/lib/language-context';
import { LanguageSwitcher } from '@/components/language-switcher';

export default function CookPage() {
  return (
    <ProtectedRoute allowedRoles={['Cook', 'CEO']}>
      <CookPortal />
    </ProtectedRoute>
  );
}

interface MealOrder {
  yurtName: string;
  guestName: string;
  meals: {
    breakfast: boolean;
    lunch: boolean;
    dinner: boolean;
  };
}

function CookPortal() {
  const { user, signOut } = useAuth();
  const { t } = useLanguage();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [activeTab, setActiveTab] = useState<'orders' | 'grocery' | 'calendar'>('orders');
  const [groceryItems, setGroceryItems] = useState<string[]>(['']);
  const [sentToManager, setSentToManager] = useState(false);

  useEffect(() => {
    fetchData();
    // Poll for updates every 5 seconds for real-time sync
    const interval = setInterval(fetchData, 5000);

    return () => {
      clearInterval(interval);
    };
  }, []);

  const fetchData = async () => {
    const { data: bookingsData } = await supabase.from('bookings').select('*');
    setBookings(bookingsData || []);
  };

  const today = new Date().toISOString().split('T')[0];
  const currentHour = new Date().getHours();

  // Determine which meal is next
  const getCurrentMeal = () => {
    if (currentHour < 10) return 'breakfast';
    if (currentHour < 15) return 'lunch';
    return 'dinner';
  };

  const getActiveBookings = () => {
    return bookings.filter(b => {
      const checkIn = new Date(b.check_in);
      const checkOut = new Date(b.check_out);
      const now = new Date();
      return checkIn <= now && checkOut >= now && b.status === 'confirmed';
    });
  };

  const handleAddGroceryItem = () => {
    setGroceryItems([...groceryItems, '']);
  };

  const handleUpdateGroceryItem = (index: number, value: string) => {
    const newItems = [...groceryItems];
    newItems[index] = value;
    setGroceryItems(newItems);
  };

  const handleRemoveGroceryItem = (index: number) => {
    setGroceryItems(groceryItems.filter((_, i) => i !== index));
  };

  const handleSendToManager = () => {
    const validItems = groceryItems.filter(item => item.trim() !== '');
    if (validItems.length === 0) return;
    
    // In a real app, this would save to a grocery_requests table
    // For now, we'll simulate the action
    console.log('Sending to manager:', validItems);
    setSentToManager(true);
    setTimeout(() => {
      setGroceryItems(['']);
      setSentToManager(false);
    }, 3000);
  };

  const activeBookings = getActiveBookings();
  const currentMeal = getCurrentMeal();

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <header className="bg-gradient-to-r from-orange-700 to-amber-800 text-white shadow-2xl sticky top-0 z-50 backdrop-blur-md bg-opacity-95">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 rounded-xl backdrop-blur-sm border border-white/20">
              <svg className="w-8 h-8 text-orange-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight">{t('portal.cook')}</h1>
              <p className="text-[10px] text-orange-200 font-bold tracking-widest uppercase opacity-80">
                {t('cook.current_meal')}: <span className="font-black text-white">{t(currentMeal)}</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <LanguageSwitcher />
            <button
              onClick={signOut}
              className="px-5 py-2.5 bg-rose-600/90 hover:bg-rose-600 rounded-xl text-xs font-black transition-all shadow-lg hover:shadow-rose-500/20 active:scale-95 flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
              {t('btn.logout')}
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto p-6">
        <div className="flex gap-4 mb-6">
          {(['orders', 'calendar', 'grocery'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-3 rounded-lg font-medium capitalize ${
                activeTab === tab ? 'bg-orange-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'
              }`}
            >
              {tab === 'calendar' ? 'Calendar' : t(`cook.${tab === 'orders' ? 'meal_orders' : 'grocery_list'}`)}
            </button>
          ))}
        </div>

        {activeTab === 'orders' && (
          <div className="space-y-6">
            {/* Meal Notes from Bookings */}
            {activeBookings.some(b => b.meal_notes) && (
              <div className="bg-yellow-50 rounded-xl shadow p-6 border-2 border-yellow-200">
                <h2 className="text-xl font-bold mb-4 text-yellow-800">
                  🍽️ {t('cook.special_instructions')}
                </h2>
                <div className="space-y-3">
                  {activeBookings.filter(b => b.meal_notes).map((booking) => (
                    <div key={booking.id} className="bg-white rounded-lg p-4 border border-yellow-200">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-bold text-gray-900">Booking #{booking.id} - {booking.guest_name}</p>
                          <p className="text-sm text-gray-600 mt-1">{booking.meal_notes}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Current Meal Orders */}
            <div className="bg-white rounded-xl shadow p-6">
              <h2 className="text-2xl font-bold mb-4 capitalize text-orange-800">
                {currentMeal} Orders
              </h2>

              {activeBookings.length === 0 ? (
                <p className="text-gray-600 text-lg">{t('cook.no_guests')}</p>
              ) : (
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {activeBookings.map((booking) => (
                    <div
                      key={booking.id}
                      className={`border-2 rounded-xl p-6 ${booking.meal_notes ? 'border-yellow-300 bg-yellow-50' : 'border-orange-200 bg-orange-50'}`}
                    >
                      <div className="text-4xl font-bold text-orange-800 mb-2">
                        #{booking.id}
                      </div>
                      <p className="text-gray-900 font-medium text-lg">{booking.guest_name}</p>
                      <p className="text-sm text-gray-700 mt-2">
                        Stay: {booking.check_in} to {booking.check_out}
                      </p>
                      {booking.meal_notes && (
                        <p className="text-sm text-yellow-800 mt-2 font-medium">
                          ⚠️ Has special meal notes
                        </p>
                      )}
                      <div className="mt-4 flex gap-2">
                        <span className="px-3 py-1 bg-white rounded-full text-sm font-medium text-orange-700 border border-orange-200">
                          {currentMeal}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* All Day Overview */}
            <div className="bg-white rounded-xl shadow p-6">
              <h2 className="text-xl font-bold mb-4 text-gray-900">Today's Full Schedule</h2>
              <div className="grid md:grid-cols-3 gap-4">
                {['breakfast', 'lunch', 'dinner'].map((meal) => (
                  <div key={meal} className="border rounded-lg p-4">
                    <h3 className="font-bold capitalize text-lg mb-2 text-gray-900">{meal}</h3>
                    <p className="text-3xl font-bold text-orange-600">
                      {activeBookings.length}
                    </p>
                    <p className="text-sm text-gray-700">{t('cook.meals_to_prepare')}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        {activeTab === 'calendar' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-white rounded-xl shadow p-8 text-center">
              <h2 className="text-2xl font-bold text-slate-800 mb-4">Occupancy Calendar</h2>
              <p className="text-slate-600">Occupancy calendar has been moved to the dedicated Check-in section</p>
            </div>
          </div>
        )}

        {activeTab === 'grocery' && (
          <div className="bg-white rounded-xl shadow p-6 max-w-2xl">
            <h2 className="text-xl font-bold mb-4 text-gray-900">Create Grocery List</h2>
            <p className="text-gray-700 mb-4">Add items you need and send to the Manager for purchase.</p>
            
            {sentToManager && (
              <div className="mb-4 p-3 bg-green-100 text-green-700 rounded-lg">
                ✓ Grocery list sent to Manager!
              </div>
            )}

            <div className="space-y-3">
              {groceryItems.map((item, index) => (
                <div key={index} className="flex gap-2">
                  <input
                    type="text"
                    value={item}
                    onChange={(e) => handleUpdateGroceryItem(index, e.target.value)}
                    placeholder="Item name and quantity..."
                    className="flex-1 px-4 py-3 text-lg border rounded-lg focus:ring-2 focus:ring-orange-500 text-gray-900 bg-white"
                  />
                  <button
                    onClick={() => handleRemoveGroceryItem(index)}
                    className="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>

            <div className="mt-4 flex gap-4">
              <button
                onClick={handleAddGroceryItem}
                className="px-6 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium"
              >
                + Add Item
              </button>
              <button
                onClick={handleSendToManager}
                disabled={groceryItems.every(i => i.trim() === '')}
                className="flex-1 px-6 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium text-lg"
              >
                {t('cook.send_to_manager')}
              </button>
            </div>

            <div className="mt-6 p-4 bg-yellow-50 rounded-lg border border-yellow-200">
              <p className="text-sm text-yellow-800">
                <strong>Tip:</strong> Be specific with quantities (e.g., "Tomatoes - 2kg", "Eggs - 30 pieces")
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
