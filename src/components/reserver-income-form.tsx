'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';

interface Props {
  selectedDate: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function ReserverIncomeForm({ selectedDate, onClose, onSuccess }: Props) {
  const { user } = useAuth();
  const currentUserId = user?.id;
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');

  const [guestNames, setGuestNames] = useState<string[]>(['']);
  const [guestCount, setGuestCount] = useState(1);
  const [childrenUnder12, setChildrenUnder12] = useState(0);
  const [nights, setNights] = useState('');
  const [lunch, setLunch] = useState(false);
  const [lunchCount, setLunchCount] = useState(0);
  const [lunchDietary, setLunchDietary] = useState('');
  const [dinner, setDinner] = useState(false);
  const [dinnerCount, setDinnerCount] = useState(0);
  const [dinnerDietary, setDinnerDietary] = useState('');
  const [drinks, setDrinks] = useState(false);
  const [drinksCount, setDrinksCount] = useState(0);
  const [laundry, setLaundry] = useState(false);
  const [laundryPrice, setLaundryPrice] = useState('');
  const [laundryCurrency, setLaundryCurrency] = useState<'UZS' | 'USD'>('UZS');
  const [guideService, setGuideService] = useState(false);
  const [guideNames, setGuideNames] = useState<string[]>(['']);
  const [guideAmount, setGuideAmount] = useState('');
  const [cookingClass, setCookingClass] = useState(false);
  const [cookingClassDescription, setCookingClassDescription] = useState('');
  const [transportation, setTransportation] = useState(false);
  const [transportationEntries, setTransportationEntries] = useState([{
    driver: '', organized: false, date: selectedDate, time: '', from: '', to: '', arrivalTime: '', price: '', description: ''
  }]);
  const [currency, setCurrency] = useState<'UZS' | 'USD' | 'EUR'>('USD');
  const [exchangeRate, setExchangeRate] = useState('1');
  const [paymentMethod, setPaymentMethod] = useState<'in_camp' | 'all_paid' | 'partially_paid'>('in_camp');
  const [amount, setAmount] = useState('');
  const [paymentNote, setPaymentNote] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    setTransportationEntries(prev => prev.map((e, i) => i === 0 ? { ...e, date: selectedDate } : e));
  }, [selectedDate]);

  const addGuestName = () => setGuestNames([...guestNames, '']);
  const removeGuestName = (index: number) => setGuestNames(guestNames.filter((_, i) => i !== index));
  const updateGuestName = (index: number, value: string) => { const u = [...guestNames]; u[index] = value; setGuestNames(u); };

  const addGuideName = () => setGuideNames([...guideNames, '']);
  const removeGuideName = (index: number) => setGuideNames(guideNames.filter((_, i) => i !== index));
  const updateGuideName = (index: number, value: string) => { const u = [...guideNames]; u[index] = value; setGuideNames(u); };

  const addTransportationEntry = () => setTransportationEntries([...transportationEntries, { driver: '', organized: false, date: selectedDate, time: '', from: '', to: '', arrivalTime: '', price: '', description: '' }]);
  const removeTransportationEntry = (index: number) => setTransportationEntries(transportationEntries.filter((_, i) => i !== index));
  const updateTransportationEntry = (index: number, field: string, value: any) => { const u = [...transportationEntries]; u[index] = { ...u[index], [field]: value }; setTransportationEntries(u); };

  const getTodayRate = async () => {
    try { const res = await fetch('https://api.exchangerate-api.com/v4/latest/USD'); const data = await res.json(); if (data.rates?.UZS) setExchangeRate(data.rates.UZS.toString()); }
    catch { alert('Failed to fetch exchange rate'); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setSubmitting(true); setMessage('');
    const validGuestNames = guestNames.filter(n => n.trim());
    if (validGuestNames.length === 0) { setMessage('Error: At least one guest name is required'); setSubmitting(false); return; }
    try {
      const amountValue = parseFloat(amount || '0');
      const rateValue = parseFloat(exchangeRate || '1');
      const amountUZS = currency === 'UZS' ? amountValue : amountValue * rateValue;
      const total_price = currency === 'USD' ? amountValue : amountUZS / rateValue;

      const { error } = await supabase.from('bookings').insert([{
        yurt_id: null, // Reserver bookings don't require specific yurt
        guest_name: validGuestNames.join(', '),
        check_in: selectedDate || new Date().toISOString().split('T')[0],
        check_out: selectedDate || new Date().toISOString().split('T')[0], // Default to same day, will be editable
        total_price: total_price || 0,
        number_of_people: guestCount,
        payment_status: 'Unpaid',
        source: 'Manual',
        status: 'confirmed',
        notes: description || null,
        meal_notes: null,
        transportation: null,
        meal_preference: null,
        guide_required: guideService,
        special_requests: null,
        created_by_role: 'Reserver',
        approved_by_manager: false,
        created_by_id: currentUserId || '',
        created_at: new Date().toISOString(),
        last_edited_by_id: currentUserId || '',
        last_edited_at: new Date().toISOString(),
        yurt_requests: null, // Will be added as a separate input field
        // Service fields
        guest_count: guestCount,
        children_under_12: childrenUnder12,
        nights: nights || null,
        guide_service: guideService,
        guide_names: guideService ? `${guideNames.filter((n) => n.trim()).join(', ')}${guideAmount ? ` (Amount: ${guideAmount} USD)` : ''}` : null,
        guide_amount: guideAmount,
        has_transportation: transportation,
        transportation_details: transportation ? transportationEntries.map((entry, index) => `Trip ${index + 1}: Driver: ${entry.driver || 'N/A'} | Date: ${entry.date ? new Date(entry.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric' }) : 'N/A'} | Time: ${entry.time || 'N/A'} | From: ${entry.from || 'N/A'} | To: ${entry.to || 'N/A'} | Arrival Time: ${entry.arrivalTime || 'N/A'}${entry.price ? ` | Price: ${entry.price} USD` : ''}${entry.description ? ` | Description: ${entry.description}` : ''}`).join(' | ') : null,
        lunch: lunch,
        lunch_count: lunchCount,
        lunch_dietary: lunchDietary || null,
        dinner: dinner,
        dinner_count: dinnerCount,
        dinner_dietary: dinnerDietary || null,
        drinks: drinks,
        drinks_count: drinksCount,
        laundry: laundry,
        laundry_price: laundryPrice,
        laundry_currency: laundryCurrency,
        payment_method: paymentMethod,
        payment_note: paymentNote || null,
        currency: currency,
        exchange_rate: rateValue,
        amount: amountValue,
        description: description,
        cooking_class: cookingClass,
        cooking_class_description: cookingClassDescription || null,
      }]);
      if (error) throw error;
      setMessage('Booking saved successfully!'); setTimeout(() => { onSuccess(); resetForm(); }, 1000);
    } catch (err: any) { setMessage(`Error: ${err.message}`); } finally { setSubmitting(false); }
  };

  const resetForm = () => {
    setGuestNames(['']); setGuestCount(1); setChildrenUnder12(0); setNights(''); setGuideService(false); setGuideNames(['']); setGuideAmount('');
    setTransportation(false); setTransportationEntries([{ driver: '', organized: false, date: selectedDate, time: '', from: '', to: '', arrivalTime: '', price: '', description: '' }]);
    setLunch(false); setLunchCount(0); setLunchDietary(''); setDinner(false); setDinnerCount(0); setDinnerDietary(''); setDrinks(false); setDrinksCount(0); setLaundry(false); setLaundryPrice(''); setLaundryCurrency('UZS');
    setCookingClass(false); setCookingClassDescription('');
    setCurrency('USD'); setExchangeRate('1'); setPaymentMethod('in_camp'); setAmount(''); setPaymentNote(''); setDescription('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl p-6 overflow-y-auto max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-black text-slate-800">New Booking</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl transition-all"><svg className="w-6 h-6 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
        </div>
        {message && <div className={`mb-4 p-3 rounded-lg text-sm ${message.includes('Error') ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>{message}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Guest Names */}
          <div>
            <label className="block text-sm font-black text-slate-900 mb-2">Guest Names *</label>
            {guestNames.map((name, index) => (
              <div key={index} className="flex gap-2 mb-2">
                <input type="text" value={name} onChange={(e) => updateGuestName(index, e.target.value)} placeholder={`Guest ${index + 1} name`}
                  className="flex-1 px-4 py-2 border-2 border-slate-300 rounded-xl focus:border-emerald-500 text-slate-900 font-semibold text-sm" />
                {guestNames.length > 1 && <button type="button" onClick={() => removeGuestName(index)} className="px-3 py-2 bg-rose-600 text-white rounded-xl hover:bg-rose-700 font-bold text-xs">✕</button>}
              </div>
            ))}
            <button type="button" onClick={addGuestName} className="mt-1 flex items-center gap-1 text-sm text-emerald-600 font-bold"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>Add Guest</button>
          </div>

          {/* Counts */}
          <div className="grid grid-cols-3 gap-4">
            <div><label className="block text-sm font-black text-slate-900 mb-2">Total Guests</label>
              <input type="number" min="1" value={guestCount} onChange={(e) => setGuestCount(parseInt(e.target.value) || 1)} className="w-full px-4 py-2 border-2 border-slate-300 rounded-xl focus:border-emerald-500 text-slate-900 font-semibold text-sm" /></div>
            <div><label className="block text-sm font-black text-slate-900 mb-2">Children Under 12</label>
              <input type="number" min="0" value={childrenUnder12} onChange={(e) => setChildrenUnder12(parseInt(e.target.value) || 0)} className="w-full px-4 py-2 border-2 border-slate-300 rounded-xl focus:border-emerald-500 text-slate-900 font-semibold text-sm" /></div>
            <div><label className="block text-sm font-black text-slate-900 mb-2">Nights</label>
              <input type="number" min="0" value={nights} onChange={(e) => setNights(e.target.value)} placeholder="Number of nights" className="w-full px-4 py-2 border-2 border-slate-300 rounded-xl focus:border-emerald-500 text-slate-900 font-semibold text-sm" /></div>
          </div>

          {/* Services */}
          <div className="border-2 border-slate-200 rounded-xl p-4 space-y-3">
            <h3 className="font-black text-slate-900 text-sm">Services and Food</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="flex items-center gap-3 cursor-pointer mb-2">
                  <input type="checkbox" checked={lunch} onChange={(e) => { setLunch(e.target.checked); if (e.target.checked && lunchCount === 0) setLunchCount(1); }} className="w-5 h-5 rounded border-2 border-slate-300 text-emerald-600" />
                  <span className="text-slate-900 font-semibold text-sm">Lunch</span>
                  {lunch && <input type="number" min="1" value={lunchCount} onChange={(e) => setLunchCount(parseInt(e.target.value) || 1)} className="w-16 px-2 py-1 border-2 border-slate-300 rounded-lg text-sm font-semibold" />}
                </label>
                {lunch && (
                  <input
                    type="text"
                    value={lunchDietary}
                    onChange={(e) => setLunchDietary(e.target.value)}
                    placeholder="Dietary request (vegetarian, special request)"
                    className="w-full px-3 py-2 border-2 border-slate-300 rounded-lg text-sm font-bold text-black"
                  />
                )}
              </div>
              <div>
                <label className="flex items-center gap-3 cursor-pointer mb-2">
                  <input type="checkbox" checked={dinner} onChange={(e) => { setDinner(e.target.checked); if (e.target.checked && dinnerCount === 0) setDinnerCount(1); }} className="w-5 h-5 rounded border-2 border-slate-300 text-emerald-600" />
                  <span className="text-slate-900 font-semibold text-sm">Dinner</span>
                  {dinner && <input type="number" min="1" value={dinnerCount} onChange={(e) => setDinnerCount(parseInt(e.target.value) || 1)} className="w-16 px-2 py-1 border-2 border-slate-300 rounded-lg text-sm font-semibold" />}
                </label>
                {dinner && (
                  <input
                    type="text"
                    value={dinnerDietary}
                    onChange={(e) => setDinnerDietary(e.target.value)}
                    placeholder="Dietary request (vegetarian, special request)"
                    className="w-full px-3 py-2 border-2 border-slate-300 rounded-lg text-sm font-bold text-black"
                  />
                )}
              </div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={drinks} onChange={(e) => { setDrinks(e.target.checked); if (e.target.checked && drinksCount === 0) setDrinksCount(1); }} className="w-5 h-5 rounded border-2 border-slate-300 text-emerald-600" />
                <span className="text-slate-900 font-semibold text-sm">Drinks</span>
                {drinks && <input type="number" min="1" value={drinksCount} onChange={(e) => setDrinksCount(parseInt(e.target.value) || 1)} className="w-16 px-2 py-1 border-2 border-slate-300 rounded-lg text-sm font-semibold" />}
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={laundry} onChange={(e) => setLaundry(e.target.checked)} className="w-5 h-5 rounded border-2 border-slate-300 text-emerald-600" />
                <span className="text-slate-900 font-semibold text-sm">Laundry</span>
              </label>
            </div>
            {laundry && (
              <div className="flex gap-2 items-center">
                <input type="number" min="0" step="0.01" value={laundryPrice} onChange={(e) => setLaundryPrice(e.target.value)} placeholder="Laundry price" className="flex-1 px-4 py-2 border-2 border-slate-300 rounded-xl focus:border-emerald-500 text-slate-900 font-semibold text-sm" />
                <select value={laundryCurrency} onChange={(e) => setLaundryCurrency(e.target.value as 'UZS' | 'USD')} className="px-4 py-2 border-2 border-slate-300 rounded-xl focus:border-emerald-500 text-slate-900 font-semibold text-sm">
                  <option value="UZS">UZS</option><option value="USD">USD</option>
                </select>
              </div>
            )}
          </div>

          {/* Guide */}
          <div className="border-2 border-slate-200 rounded-xl p-4 space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={guideService} onChange={(e) => setGuideService(e.target.checked)} className="w-5 h-5 rounded border-2 border-slate-300 text-emerald-600" />
              <span className="text-slate-900 font-semibold text-sm">Guide Service</span>
            </label>
            {guideService && (
              <div className="space-y-3">
                {guideNames.map((name, index) => (
                  <div key={index} className="flex gap-2">
                    <input type="text" value={name} onChange={(e) => updateGuideName(index, e.target.value)} placeholder={`Guide ${index + 1} name`} className="flex-1 px-4 py-2 border-2 border-slate-300 rounded-xl focus:border-emerald-500 text-slate-900 font-semibold text-sm" />
                    {guideNames.length > 1 && <button type="button" onClick={() => removeGuideName(index)} className="px-3 py-2 bg-rose-600 text-white rounded-xl hover:bg-rose-700 font-bold text-xs">✕</button>}
                  </div>
                ))}
                <button type="button" onClick={addGuideName} className="flex items-center gap-1 text-sm text-emerald-600 font-bold"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>Add Guide</button>
                <div><label className="block text-xs font-bold text-slate-600 mb-1">Guide Amount (USD)</label>
                  <input type="number" min="0" step="0.01" value={guideAmount} onChange={(e) => setGuideAmount(e.target.value)} placeholder="Enter guide amount in USD" className="w-full px-4 py-2 border-2 border-slate-300 rounded-xl focus:border-emerald-500 text-slate-900 font-semibold text-sm" /></div>
              </div>
            )}
          </div>

          {/* Cooking Class */}
          <div className="border-2 border-slate-200 rounded-xl p-4 space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={cookingClass} onChange={(e) => setCookingClass(e.target.checked)} className="w-5 h-5 rounded border-2 border-slate-300 text-emerald-600" />
              <span className="text-slate-900 font-semibold text-sm">Cooking Class</span>
            </label>
            {cookingClass && (
              <textarea
                value={cookingClassDescription}
                onChange={(e) => setCookingClassDescription(e.target.value)}
                placeholder="Description (optional)"
                rows={2}
                className="w-full px-4 py-2 border-2 border-slate-300 rounded-xl focus:border-emerald-500 text-slate-900 font-semibold text-sm"
              />
            )}
          </div>

          {/* Transportation */}
          <div className="border-2 border-slate-200 rounded-xl p-4 space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={transportation} onChange={(e) => setTransportation(e.target.checked)} className="w-5 h-5 rounded border-2 border-slate-300 text-emerald-600" />
              <span className="text-slate-900 font-semibold text-sm">Transportation</span>
            </label>
            {transportation && (
              <div className="space-y-4">
                {transportationEntries.map((entry, index) => (
                  <div key={index} className="p-4 border-2 border-slate-200 rounded-xl space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-bold text-slate-700">Trip {index + 1}</span>
                      {transportationEntries.length > 1 && <button type="button" onClick={() => removeTransportationEntry(index)} className="px-3 py-1 bg-rose-600 text-white rounded-lg hover:bg-rose-700 font-bold text-xs">✕ Remove</button>}
                    </div>
                    <div><label className="block text-xs font-bold text-slate-600 mb-1">Driver Name</label>
                      <input type="text" value={entry.driver} onChange={(e) => updateTransportationEntry(index, 'driver', e.target.value)} placeholder="Enter driver name" className="w-full px-4 py-2 border-2 border-slate-300 rounded-xl focus:border-emerald-500 text-slate-900 font-semibold text-sm" /></div>
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input type="checkbox" checked={entry.organized} onChange={(e) => updateTransportationEntry(index, 'organized', e.target.checked)} className="w-5 h-5 rounded border-2 border-slate-300 text-emerald-600" />
                      <span className="text-slate-900 font-semibold text-sm">Need to organize driver</span>
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <div><label className="block text-xs font-bold text-slate-600 mb-1">Date</label>
                        <input type="date" value={entry.date} onChange={(e) => updateTransportationEntry(index, 'date', e.target.value)} className="w-full px-4 py-2 border-2 border-slate-300 rounded-xl focus:border-emerald-500 text-slate-900 font-semibold text-sm" /></div>
                      <div><label className="block text-xs font-bold text-slate-600 mb-1">Pickup Time</label>
                        <div className="flex gap-2">
                          <select value={entry.time.split(':')[0] || ''} onChange={(e) => updateTransportationEntry(index, 'time', `${e.target.value}:${entry.time.split(':')[1] || '00'}`)} className="flex-1 px-4 py-2 border-2 border-slate-300 rounded-xl focus:border-emerald-500 text-slate-900 font-semibold text-sm">
                            <option value="">Hour</option>{Array.from({ length: 24 }, (_, i) => <option key={i} value={i.toString().padStart(2, '0')}>{i.toString().padStart(2, '0')}</option>)}
                          </select>
                          <select value={entry.time.split(':')[1] || ''} onChange={(e) => updateTransportationEntry(index, 'time', `${entry.time.split(':')[0] || '00'}:${e.target.value}`)} className="flex-1 px-4 py-2 border-2 border-slate-300 rounded-xl focus:border-emerald-500 text-slate-900 font-semibold text-sm">
                            <option value="">Min</option>{Array.from({ length: 60 }, (_, i) => <option key={i} value={i.toString().padStart(2, '0')}>{i.toString().padStart(2, '0')}</option>)}
                          </select>
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div><label className="block text-xs font-bold text-slate-600 mb-1">From</label>
                        <input type="text" value={entry.from} onChange={(e) => updateTransportationEntry(index, 'from', e.target.value)} placeholder="Pickup location" className="w-full px-4 py-2 border-2 border-slate-300 rounded-xl focus:border-emerald-500 text-slate-900 font-semibold text-sm" /></div>
                      <div><label className="block text-xs font-bold text-slate-600 mb-1">To</label>
                        <input type="text" value={entry.to} onChange={(e) => updateTransportationEntry(index, 'to', e.target.value)} placeholder="Destination" className="w-full px-4 py-2 border-2 border-slate-300 rounded-xl focus:border-emerald-500 text-slate-900 font-semibold text-sm" /></div>
                    </div>
                    <div><label className="block text-xs font-bold text-slate-600 mb-1">Arrival Time</label>
                      <div className="flex gap-2">
                        <select value={entry.arrivalTime.split(':')[0] || ''} onChange={(e) => updateTransportationEntry(index, 'arrivalTime', `${e.target.value}:${entry.arrivalTime.split(':')[1] || '00'}`)} className="flex-1 px-4 py-2 border-2 border-slate-300 rounded-xl focus:border-emerald-500 text-slate-900 font-semibold text-sm">
                          <option value="">Hour</option>{Array.from({ length: 24 }, (_, i) => <option key={i} value={i.toString().padStart(2, '0')}>{i.toString().padStart(2, '0')}</option>)}
                        </select>
                        <select value={entry.arrivalTime.split(':')[1] || ''} onChange={(e) => updateTransportationEntry(index, 'arrivalTime', `${entry.arrivalTime.split(':')[0] || '00'}:${e.target.value}`)} className="flex-1 px-4 py-2 border-2 border-slate-300 rounded-xl focus:border-emerald-500 text-slate-900 font-semibold text-sm">
                          <option value="">Min</option>{Array.from({ length: 60 }, (_, i) => <option key={i} value={i.toString().padStart(2, '0')}>{i.toString().padStart(2, '0')}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="flex gap-2 items-center">
                      <input type="number" min="0" step="0.01" value={entry.price} onChange={(e) => updateTransportationEntry(index, 'price', e.target.value)} placeholder="Transportation price" className="flex-1 px-4 py-2 border-2 border-slate-300 rounded-xl focus:border-emerald-500 text-slate-900 font-semibold text-sm" />
                      <span className="text-slate-900 font-semibold text-sm">USD</span>
                    </div>
                    <div><label className="block text-xs font-bold text-slate-600 mb-1">Description</label>
                      <textarea value={entry.description} onChange={(e) => updateTransportationEntry(index, 'description', e.target.value)} placeholder="Enter description for this trip" rows={2} className="w-full px-4 py-2 border-2 border-slate-300 rounded-xl focus:border-emerald-500 text-slate-900 font-semibold text-sm" /></div>
                  </div>
                ))}
                <button type="button" onClick={addTransportationEntry} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 font-bold text-sm w-full justify-center">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>Add Another Trip
                </button>
              </div>
            )}
          </div>

          {/* Payment Method */}
          <div className="border-2 border-slate-200 rounded-xl p-4 space-y-4">
            <label className="block text-sm font-black text-slate-900">Payment Method *</label>
            <div className="space-y-3">

              {/* Option 1: To be paid in the camp */}
              <div className={`rounded-xl border-2 p-3 transition-all ${paymentMethod === 'in_camp' ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200'}`}>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="radio" name="paymentMethod" checked={paymentMethod === 'in_camp'} onChange={() => setPaymentMethod('in_camp')} className="w-5 h-5 border-2 border-slate-300 text-emerald-600" />
                  <span className="text-slate-900 font-bold">To be paid in the camp</span>
                </label>
                {paymentMethod === 'in_camp' && (
                  <div className="mt-3 space-y-3">
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <label className="block text-xs font-bold text-slate-600 mb-1">Amount *</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={amount}
                          onChange={(e) => setAmount(e.target.value)}
                          placeholder="Enter amount"
                          className="w-full px-3 py-2 border-2 border-slate-300 rounded-lg text-sm font-bold text-black focus:border-emerald-500"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-600 mb-1">Currency *</label>
                        <select
                          value={currency}
                          onChange={(e) => { setCurrency(e.target.value as 'UZS' | 'USD' | 'EUR'); setExchangeRate(e.target.value === 'UZS' ? '1' : exchangeRate); }}
                          className="px-3 py-2 border-2 border-slate-300 rounded-lg text-sm font-bold text-black focus:border-emerald-500"
                        >
                          <option value="USD">USD</option>
                          <option value="UZS">UZS</option>
                          <option value="EUR">EUR</option>
                        </select>
                      </div>
                    </div>
                    {currency !== 'UZS' && (
                      <div>
                        <label className="block text-xs font-bold text-slate-600 mb-1">Exchange Rate (to UZS)</label>
                        <div className="flex gap-2">
                          <input type="number" step="0.01" value={exchangeRate} onChange={(e) => setExchangeRate(e.target.value)} placeholder={`1 ${currency} = ? UZS`} className="flex-1 px-3 py-2 border-2 border-slate-300 rounded-lg text-sm font-bold text-black" />
                          <button type="button" onClick={getTodayRate} className="px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-bold text-xs whitespace-nowrap">Get Today's Rate</button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Option 2: All paid */}
              <div className={`rounded-xl border-2 p-3 transition-all ${paymentMethod === 'all_paid' ? 'border-blue-500 bg-blue-50' : 'border-slate-200'}`}>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="radio" name="paymentMethod" checked={paymentMethod === 'all_paid'} onChange={() => setPaymentMethod('all_paid')} className="w-5 h-5 border-2 border-slate-300 text-blue-600" />
                  <span className="text-slate-900 font-bold">All paid</span>
                </label>
                {paymentMethod === 'all_paid' && (
                  <div className="mt-3">
                    <label className="block text-xs font-bold text-slate-600 mb-1">Message (optional)</label>
                    <textarea
                      value={paymentNote}
                      onChange={(e) => setPaymentNote(e.target.value)}
                      placeholder="Optional note..."
                      rows={2}
                      className="w-full px-3 py-2 border-2 border-slate-300 rounded-lg text-sm font-bold text-black focus:border-blue-500"
                    />
                  </div>
                )}
              </div>

              {/* Option 3: Partially paid */}
              <div className={`rounded-xl border-2 p-3 transition-all ${paymentMethod === 'partially_paid' ? 'border-amber-500 bg-amber-50' : 'border-slate-200'}`}>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="radio" name="paymentMethod" checked={paymentMethod === 'partially_paid'} onChange={() => setPaymentMethod('partially_paid')} className="w-5 h-5 border-2 border-slate-300 text-amber-600" />
                  <span className="text-slate-900 font-bold">Partially paid</span>
                </label>
                {paymentMethod === 'partially_paid' && (
                  <div className="mt-3">
                    <label className="block text-xs font-bold text-slate-600 mb-1">Message <span className="text-red-500">*</span></label>
                    <textarea
                      value={paymentNote}
                      onChange={(e) => setPaymentNote(e.target.value)}
                      placeholder="Describe what has been paid and what is remaining..."
                      rows={2}
                      className="w-full px-3 py-2 border-2 border-slate-300 rounded-lg text-sm font-bold text-black focus:border-amber-500"
                      required
                    />
                  </div>
                )}
              </div>

            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-black text-slate-900 mb-2">Additional Notes (optional)</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Additional notes..." rows={3} className="w-full px-4 py-3 border-2 border-slate-300 rounded-xl focus:border-emerald-500 text-slate-900 font-bold text-black" />
          </div>

          {/* Submit */}
          <div className="flex gap-4 pt-4">
            <button type="button" onClick={onClose} className="flex-1 px-6 py-3 bg-slate-100 text-slate-700 rounded-xl font-bold hover:bg-slate-200 transition-all">Cancel</button>
            <button type="submit" disabled={submitting} className="flex-1 px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all disabled:opacity-50">
              {submitting ? 'Saving...' : 'Create Booking'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
