'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

type Language = 'en' | 'uz';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const translations = {
  en: {
    // Auth
    'login.title': 'Isky Camp Flow',
    'login.subtitle': 'Next-Gen Isky Camp Management',
    'login.email': 'Email Address',
    'login.password': 'Password',
    'login.signin': 'Sign In',
    'login.signup': 'Sign Up',
    'login.no_account': "Don't have an account? Sign up",
    'login.has_account': 'Already have an account? Sign in',
    'login.manager_default': 'New accounts default to Manager role.',
    
    // Portals
    'portal.ceo': 'CEO Command Center',
    'portal.manager': 'Manager Portal',
    'portal.cook': 'Cook Portal',
    
    // Tabs
    'tab.occupancy': 'Check-in & Out',
    'tab.finance': 'Finance',
    'tab.team': 'Team',
    
    // Buttons
    'btn.logout': 'Log Out',
    'btn.new_booking': 'New Booking',
    'btn.reset_data': 'Reset All Data',
    'btn.check_in': 'Check In',
    'btn.check_out': 'Check Out',
    'btn.save_record': 'Save Record',
    'btn.saving': 'Saving...',
    'btn.record_transaction': 'Record Transaction',
    
    // Calendar
    'cal.beds': 'BEDS',
    'cal.camps': 'ISKY CAMPS',
    'cal.total_capacity': 'TOTAL CAPACITY',
    'cal.available': 'AVAILABLE',
    'cal.partial': 'PARTIAL',
    'cal.full': 'FULL',
    'cal.occupancy': 'OCCUPANCY',
    'cal.fiscal_ledger': 'Fiscal Ledger',
    'cal.monthly_expenditure': 'MONTHLY EXPENDITURE',
    'cal.spent': 'SPENT',
    'cal.no_expenses': 'No Expenses',
    
    // Manifests
    'manifest.guest': 'GUEST MANIFEST',
    'manifest.financial': 'FINANCIAL MANIFEST',
    'manifest.total_spent': 'TOTAL SPENT',
    'manifest.groceries': 'GROCERIES',
    'manifest.party_size': 'PARTY SIZE',
    'manifest.total_rate': 'TOTAL RATE',
    
    // Tables
    'table.name': 'NAME',
    'table.email': 'CONTACT EMAIL',
    'table.role': 'CLEARANCE ROLE',
    'table.item': 'ITEM SPECIFICATION',
    'table.valuation': 'VALUATION',
    'table.category': 'CATEGORY',
    'table.date': 'DATE',
    'table.camp': 'ISKY CAMP',
    'table.dates': 'DATES',
    'table.status': 'STATUS',
    'table.price': 'PRICE',
    
    // Forms
    'form.guest_name': 'Guest Name',
    'form.check_in': 'Check-in Date',
    'form.check_out': 'Check-out Date',
    'form.total_price': 'Total Price',
    'form.camp_select': 'Select Isky Camp',
    'form.source': 'Source',
    'form.notes': 'Special Notes',
    'form.meal_notes': 'Dietary Requirements',
    'form.num_people': 'Number of People',
    'form.transportation': 'Transportation Details',
    'form.meal_preference': 'Meal Preference',
    'form.guide_required': 'Guide Required',
    'form.special_requests': 'Special Requests',
    'form.payment.partial': 'Partial',
    'form.select_category': 'Select category',
    'form.enter_amount': 'Enter amount',
    'form.enter_amount_uzs': 'Enter amount in UZS',
    'form.describe_transaction': 'Describe the transaction...',
    'form.enter_worker_name': 'Enter or select worker name',
    'form.selected_date': 'Selected Date',
    'form.select_date_from_calendar': 'Select date from calendar below',
    'form.meal_notes_example': 'e.g., No peanuts, Extra spicy',
    'form.transport_from': 'From',
    'form.transport_to': 'To',
    'form.driver_name': 'Driver Name',
    'form.price_usd': 'Price (USD)',
    'form.guide_name': 'Guide Name',
    'form.discount_reason': 'Reason for discount',
    
    // Status
    'status.confirmed': 'Confirmed',
    'status.pending': 'Pending',
    'status.cancelled': 'Cancelled',
    'status.paid': 'Paid',
    'status.unpaid': 'Unpaid',
    'status.checked_in': 'Checked In',
    'status.completed': 'Completed',
    
    // Messages
    'msg.record_saved': 'Record saved successfully!',
    'msg.please_enter_valid_amount': 'Please enter a valid amount',
    'msg.please_enter_worker_name': 'Please enter a worker name for workers income',
    'msg.error': 'Error',
    'msg.no_transactions_for_date': 'No transactions for this date',
    'msg.zero_burn_logged': 'Zero Burn Logged',
    'msg.collected_today': 'Collected Today',
    'msg.uzs_collected_today': 'UZS Collected Today',
    'msg.cash_box': 'Camp Cash Box',
    'msg.physical_drawer_contents': 'Physical drawer contents',
    'msg.usd_total': 'USD Total',
    'msg.uzs_total': 'UZS (Sum)',
    'msg.eur_total': 'EUR Total',
    'msg.burn_expenditure': 'Burn Expenditure',
    'msg.line_items': 'line items',
    'msg.receipt_saved_image': 'Receipt saved as image!',
    'msg.failed_save_image': 'Failed to save image. Try the "Print PDF" button instead.',
    'msg.stay_dates_updated': 'Stay dates and adjustment updated.',
    'msg.error_adjustment': 'Error executing adjustment',
    'msg.sync_kitchen_failed': 'Saved locally but failed to sync to kitchen',
    'msg.failed_add_tab': 'Failed to add to tab.',
    'msg.failed_add_service': 'Failed to add service.',

    // Manager Specific
    'manager.checkin': 'Check-in / Check-out',
    'manager.expenses': 'Log Expenses',
    'manager.bookings': 'Attention Needed',
    'manager.today_checkins': "Today's Check-ins",
    'manager.today_checkouts': "Today's Check-outs",
    'manager.camp_overview': 'Isky Camp Status Overview',
    'manager.no_checkins': 'No check-ins today',
    'manager.no_checkouts': 'No check-outs today',
    'manager.mark_checked_in': 'Mark Checked In',
    'manager.needs_cleaning': 'Needs Cleaning',
    'manager.cleaned': 'Cleaned',
    
    // Cook Specific
    'cook.meal_orders': 'Meal Orders',
    'cook.grocery_list': 'Grocery List',
    'cook.current_meal': 'Current meal',
    'cook.special_instructions': 'Special Meal Instructions',
    'cook.no_guests': 'No guests currently staying',
    'cook.meals_to_prepare': 'meals to prepare',
    'cook.send_to_manager': 'Send to Manager',
    
    // Dates
    'month.0': 'January', 'month.1': 'February', 'month.2': 'March', 'month.3': 'April',
    'month.4': 'May', 'month.5': 'June', 'month.6': 'July', 'month.7': 'August',
    'month.8': 'September', 'month.9': 'October', 'month.10': 'November', 'month.11': 'December',
    'day.0': 'SUN', 'day.1': 'MON', 'day.2': 'TUE', 'day.3': 'WED', 'day.4': 'THU', 'day.5': 'FRI', 'day.6': 'SAT',
  },
  uz: {
    // Auth
    'login.title': 'Isky Camp Oqimi',
    'login.subtitle': 'Isky Camplarni boshqarishning yangi avlodi',
    'login.email': 'Elektron pochta',
    'login.password': 'Parol',
    'login.signin': 'Kirish',
    'login.signup': 'Roʻyxatdan oʻtish',
    'login.no_account': "Hisobingiz yo'qmi? Ro'yxatdan o'ting",
    'login.has_account': 'Hisobingiz bormi? Kiring',
    'login.manager_default': 'Yangi hisoblar standart boʻyicha Menejer roliga ega.',
    
    // Portals
    'portal.ceo': 'Boshqaruv Markazi (CEO)',
    'portal.manager': 'Menejer Portali',
    'portal.cook': 'Oshpaz Portali',
    
    // Tabs
    'tab.occupancy': 'Kelish / Ketish',
    'tab.finance': 'Moliya',
    'tab.team': 'Jamoa',
    
    // Buttons
    'btn.logout': 'Chiqish',
    'btn.new_booking': 'Yangi band qilish',
    'btn.reset_data': "Ma'lumotlarni tozalash",
    'btn.check_in': 'Kelish',
    'btn.check_out': 'Ketish',
    'btn.save_record': 'Saqlash',
    'btn.saving': 'Saqlanmoqda...',
    'btn.record_transaction': 'Tranzaksiyani yozish',
    
    // Calendar
    'cal.beds': 'OʻRINLAR',
    'cal.camps': 'ISKY CAMPLAR',
    'cal.total_capacity': 'UMUMIY SIGʻIM',
    'cal.available': 'BOʻSH',
    'cal.partial': 'QISMAN',
    'cal.full': 'TOʻLIQ',
    'cal.occupancy': 'BANDLIK',
    'cal.fiscal_ledger': 'Moliya daftari',
    'cal.monthly_expenditure': 'OYLIK XARAJAT',
    'cal.spent': 'SARFLANDI',
    'cal.no_expenses': 'Xarajatlar yoʻq',
    
    // Manifests
    'manifest.guest': 'MEHMONLAR ROʻYXATI',
    'manifest.financial': 'MOLIYAVIY HISOBOT',
    'manifest.total_spent': 'UMUMIY SARF',
    'manifest.groceries': 'MAHSULOTLAR',
    'manifest.party_size': 'ODAMLAR SONI',
    'manifest.total_rate': 'UMUMIY NARX',
    
    // Tables
    'table.name': 'ISM',
    'table.email': 'EMAIL',
    'table.role': 'DARAJA',
    'table.item': 'MAHSULOT NOMI',
    'table.valuation': 'QIYMATI',
    'table.category': 'TOIFA',
    'table.date': 'SANA',
    'table.camp': 'ISKY CAMP',
    'table.dates': 'SANALAR',
    'table.status': 'HOLAT',
    'table.price': 'NARX',
    
    // Forms
    'form.guest_name': 'Mehmon ismi',
    'form.check_in': 'Kelish sanasi',
    'form.check_out': 'Ketish sanasi',
    'form.total_price': 'Umumiy narxi',
    'form.camp_select': 'Isky Campni tanlang',
    'form.source': 'Manba',
    'form.notes': 'Maxsus eslatmalar',
    'form.meal_notes': 'Parhez talablari',
    'form.num_people': 'Odamlar soni',
    'form.transportation': 'Transport maʼlumotlari',
    'form.meal_preference': 'Ovqatlanish afzalligi',
    'form.guide_required': 'Gid kerak',
    'form.special_requests': 'Maxsus soʻrovlar',
    'form.payment.partial': 'Qisman toʻlangan',
    'form.select_category': 'Kategoriyani tanlang',
    'form.enter_amount': 'Summani kiriting',
    'form.enter_amount_uzs': 'Summani UZS da kiriting',
    'form.describe_transaction': 'Tranzaksiyani tasvirlang...',
    'form.enter_worker_name': 'Ishchi nomini kiriting yoki tanlang',
    'form.selected_date': 'Tanlangan sana',
    'form.select_date_from_calendar': 'Quyidagi kalendaridan sanani tanlang',
    'form.meal_notes_example': 'masalan, yongʻoqsiz, qoʻshimcha achchiq',
    'form.transport_from': 'Qayerdan',
    'form.transport_to': 'Qayerga',
    'form.driver_name': 'Haydovchi ismi',
    'form.price_usd': 'Narxi (USD)',
    'form.guide_name': 'Gid ismi',
    'form.discount_reason': 'Chegirma sababi',
    
    // Status
    'status.confirmed': 'Tasdiqlangan',
    'status.pending': 'Kutilmoqda',
    'status.cancelled': 'Bekor qilingan',
    'status.paid': "To'langan",
    'status.unpaid': "To'lanmagan",
    'status.checked_in': 'Kelgan',
    'status.completed': 'Tugallangan',
    
    // Messages
    'msg.record_saved': 'Yozuv muvaffaqiyatli saqlandi!',
    'msg.please_enter_valid_amount': 'Iltimos, toʻgʻri summani kiriting',
    'msg.please_enter_worker_name': 'Iltimos, ishchi nomini kiriting',
    'msg.error': 'Xato',
    'msg.no_transactions_for_date': 'Bu sana uchun tranzaksiyalar yoʻq',
    'msg.zero_burn_logged': 'Xarajatlar yoʻq',
    'msg.collected_today': 'Bugun yigʻilgan',
    'msg.uzs_collected_today': 'Bugun yigʻilgan UZS',
    'msg.cash_box': 'Kassa qutisi',
    'msg.physical_drawer_contents': 'Jismoniy quti mazmuni',
    'msg.usd_total': 'USD jami',
    'msg.uzs_total': 'UZS (soʻm)',
    'msg.eur_total': 'EUR jami',
    'msg.burn_expenditure': 'Xarajatlar',
    'msg.line_items': 'bandlar',
    'msg.receipt_saved_image': 'Chek rasm sifatida saqlandi!',
    'msg.failed_save_image': 'Rasmni saqlash muvaffaqiyatsiz. Buning oʻrniga "PDF chop etish" tugmasini sinib koʻring.',
    'msg.stay_dates_updated': 'Qolish sanalari va tuzatish yangilandi.',
    'msg.error_adjustment': 'Tuzatishni bajarishda xato',
    'msg.sync_kitchen_failed': 'Mahalliy saqlandi, lekin oshxona bilan sinxronizatsiya qilinmadi',
    'msg.failed_add_tab': 'Qoʻshish muvaffaqiyatsiz.',
    'msg.failed_add_service': 'Xizmatni qoʻshish muvaffaqiyatsiz.',

    // Manager Specific
    'manager.checkin': 'Kelish / Ketish',
    'manager.expenses': 'Xarajatlarni kiritish',
    'manager.bookings': 'E\'tibor kerak',
    'manager.today_checkins': 'Bugungi kelishlar',
    'manager.today_checkouts': 'Bugungi ketishlar',
    'manager.camp_overview': 'Isky Camplar holati',
    'manager.no_checkins': 'Bugun kelishlar yoʻq',
    'manager.no_checkouts': 'Bugun ketishlar yoʻq',
    'manager.mark_checked_in': 'Keldi deb belgilash',
    'manager.needs_cleaning': 'Tozalash kerak',
    'manager.cleaned': 'Tozalangan',
    
    // Cook Specific
    'cook.meal_orders': 'Taom buyurtmalari',
    'cook.grocery_list': 'Mahsulotlar roʻyxati',
    'cook.current_meal': 'Hozirgi taom',
    'cook.special_instructions': 'Maxsus taom koʻrsatmalari',
    'cook.no_guests': 'Hozirda mehmonlar yoʻq',
    'cook.meals_to_prepare': 'taom tayyorlash kerak',
    'cook.send_to_manager': 'Menejerga yuborish',
    
    // Dates
    'month.0': 'Yanvar', 'month.1': 'Fevral', 'month.2': 'Mart', 'month.3': 'Aprel',
    'month.4': 'May', 'month.5': 'Iyun', 'month.6': 'Iyul', 'month.7': 'Avgust',
    'month.8': 'Sentabr', 'month.9': 'Oktabr', 'month.10': 'Noyabr', 'month.11': 'Dekabr',
    'day.0': 'YAK', 'day.1': 'DUSH', 'day.2': 'SESH', 'day.3': 'CHOR', 'day.4': 'PAY', 'day.5': 'JUM', 'day.6': 'SHA',
  }
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = useState<Language>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('language') as Language;
      if (saved === 'en' || saved === 'uz') {
        return saved;
      }
      // Fallback for invalid or 'ru' values
      if (saved === 'ru') {
        localStorage.removeItem('language');
      }
    }
    return 'en';
  });

  const handleSetLanguage = (lang: Language) => {
    setLanguage(lang);
    if (typeof window !== 'undefined') {
      localStorage.setItem('language', lang);
    }
  };

  const t = (key: string) => {
    return translations[language][key as keyof typeof translations['en']] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage: handleSetLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
