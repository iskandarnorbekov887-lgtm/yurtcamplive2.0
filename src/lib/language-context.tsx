'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

type Language = 'en' | 'uz';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
  getLocale: () => string;
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
    'form.expense': 'Expense',
    'form.income': 'Income',
    'form.transactions': 'Transactions',
    'form.financial_tracker': 'Financial Tracker',
    'form.manager_recording': 'Manager Recording',
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
    'msg.confirm_cancel_trip': 'Are you sure you want to cancel this trip?',
    'msg.confirm_checkout': 'Are you sure you want to check out',
    'msg.confirm_checkin': 'Confirm Check In',
    'msg.upcoming_guest': 'Upcoming Guest',
    'msg.cancel_meal_request': 'Cancel this',
    'msg.meal_request_for': 'request for',
    'msg.saving': 'Saving...',
    'msg.confirm_extension': 'Confirm Extension',
    'msg.no_bookings': 'No bookings',
    'msg.no_bookings_day': 'No bookings for this day',
    'msg.please_fill_all_drink_fields': 'Please fill all drink fields',
    'msg.drink_purchase_saved': 'Drink purchase saved successfully!',
    'msg.drink_tab_closed': 'Drink tab closed successfully!',

    // Manager Notifications
    'notif.title': 'Notifications',
    'notif.none': 'No notifications',
    'notif.show_more': 'Show More',
    'notif.more_suffix': 'more',

    // Manager Grocery
    'grocery.purchase_mode': 'Grocery Purchase Mode',
    'grocery.review_subtitle': 'Review and update the list from the Kitchen',
    'grocery.new_request': 'New Request',
    'grocery.no_active': 'No active grocery requests',
    'grocery.mark_purchased': 'Mark as Purchased',
    'grocery.waiting_verification': 'Waiting for Kitchen Verification...',

    // Unified Folio
    'folio.title': 'Unified Guest Folio',
    'folio.fiscal_status': 'Fiscal Status',
    'folio.prepaid_office': '[ PREPAID - OFFICE ]',
    'folio.open_camp': '[ OPEN - CAMP ]',
    'folio.service_breakdown': 'Service Breakdown',
    'folio.accommodation': 'Accommodation',
    'folio.catering_accepted': 'Catering (Accepted)',
    'folio.gross_total': 'Gross Total',
    'folio.balance_sheet': 'Balance Sheet',
    'folio.settled_amount': 'Settled Amount',
    'folio.current_live_tab': 'Current Live Tab',
    'folio.prepaid': 'PREPAID',
    'folio.pending_settlement': '⚠ Pending Settlement at Camp',
    'folio.audit_trail': 'Audit Trail: Kitchen & Services',
    'folio.live_sync': 'Live Sync',
    'folio.no_kitchen_activity': 'No kitchen activity recorded.',
    'folio.nights_label': 'Nights',
    'folio.adults_label': 'Adults',
    'folio.lunch': 'Lunch',
    'folio.dinner': 'Dinner',
    'folio.size_label': 'Size',
    'folio.tab_settled': 'TAB SETTLED (ZERO BALANCE)',
    'folio.refund_due_to_guest': 'Refund Due to Guest',

    // Navigation
    'nav.calendar': 'Calendar',
    'nav.meals': 'Meals',
    'nav.logistics': 'Logistics',
    'nav.stores': 'Stores',
    'nav.fiscal_recording': 'Fiscal Recording',
    'nav.guest_calendar': 'Guest Calendar',
    'nav.catering': 'Catering',
    'nav.ceo_executive': 'CEO Executive',

    // Guest Agenda
    'agenda.title': 'Guest Agenda',
    'agenda.subtitle': "Today's guest management portal",
    'agenda.add_booking': '+ Add Booking',
    'agenda.upcoming_active': 'Upcoming & Active',
    'agenda.checked_in': 'Checked In',
    'agenda.arriving_soon': 'Arriving Soon',
    'agenda.arriving': 'Arriving',
    'agenda.in_stay': 'In Stay',
    'agenda.todays_operations': "Today's Operations",
    'agenda.daily_schedule': 'Daily Schedule',

    // Calendar View
    'calview.title': 'Calendar View',
    'calview.subtitle': 'Private Booking Calendar',
    'calview.today': 'Today',
    'calview.more_suffix': 'more',
    'calview.all_bookings': 'All Bookings',
    'calview.legend_confirmed': 'Confirmed',
    'calview.legend_checked_in': '✓ Checked In',
    'calview.legend_checked_out': '✈ Checked Out',
    'calview.legend_cancelled': '✕ Cancelled',
    'calview.legend_local': '🏠 Local',
    'calview.legend_pool': 'Pool',
    'calview.legend_calendar': '📅 Calendar',

    // Google Calendar Event
    'gcal.event_title': 'GOOGLE CALENDAR EVENT',
    'gcal.calendar_only': 'CALENDAR ONLY — NO BOOKING YET',
    'gcal.calendar_only_desc': 'Create a booking from this event to manage check-in, services, and payments.',
    'gcal.create_booking_checkin': '→CREATE BOOKING & CHECK IN',
    'gcal.create_booking_only': 'CREATE BOOKING ONLY',

    // Booking Modal
    'booking.details': 'BOOKING DETAILS',
    'booking.standard_stay': 'STANDARD STAY BOOKING',
    'booking.hide_notes': 'Hide Notes',
    'booking.show_notes': 'Show Notes',
    'booking.checked_in': 'Checked In',
    'booking.check_out_guest': 'CHECK OUT GUEST',
    'booking.stay_notes': 'BOOKING & STAY NOTES',
    'booking.edit_dates': 'Edit Dates',
    'booking.add_to_tab': 'ADD TO TAB',
    'booking.post_new_charges': 'POST NEW CHARGES FOR THIS GUEST',

    'booking.other_services': 'OTHER SERVICES',
    'booking.food_prepaid': 'Food Prepaid',
    'booking.quick_add_lunch': 'QUICK ADD LUNCH',
    'booking.quick_add_dinner': 'QUICK ADD DINNER',
    'booking.adults': 'Adults',
    'booking.children': 'Children',
    'booking.additional_services': 'ADDITIONAL SERVICES',
    'booking.transportation': 'TRANSPORTATION',
    'booking.guide_service': 'GUIDE SERVICE',
    'booking.add': 'ADD',
    'booking.tab_summary': 'TAB SUMMARY',
    'booking.food': 'Food',
    'booking.current_tab_balance': 'CURRENT TAB BALANCE',

    'booking.payment_collection': 'PAYMENT COLLECTION',
    'booking.remaining': 'REMAINING:',
    'booking.payment_n': 'PAYMENT',
    'booking.pay_in': 'PAY IN',
    'booking.method': 'METHOD',
    'booking.cash': 'CASH',
    'booking.online': 'ONLINE',
    'booking.money_to_collect_usd': 'MONEY TO COLLECT (USD)',
    'booking.match_balance': 'MATCH BALANCE',
    'booking.add_another_currency': '+ ADD ANOTHER CURRENCY',
    'booking.balance_mismatch': 'BALANCE MISMATCH:',
    'booking.auto_fix': 'AUTO-FIX',
    'booking.review_pay_tab': 'REVIEW & PAY TAB',
    'booking.guest_folio': 'GUEST FOLIO',
    'booking.tab_active': 'Tab',
    'booking.active': 'Active',
    'booking.cannot_checkout_unsettled': 'GUEST CANNOT CHECK OUT UNTIL ACTIVE TAB IS SETTLED',

    // Stay Configuration
    'stay.config_title': 'STAY CONFIGURATION',
    'stay.original_prepaid': 'ORIGINAL STAY PREPAID',
    'stay.children_under_12': 'CHILDREN UNDER 12',
    'stay.accommodation_label': 'ACCOMMODATION',
    'stay.paid_badge': 'PAID',
    'stay.extension_fee': 'Extension Fee (USD)',
    'stay.save_guest_count': 'Save Guest Count',
    'stay.edit': 'Edit',

    // Receipt
    'receipt.title': 'FINAL RECEIPT',
    'receipt.guest': 'GUEST',
    'receipt.stay_period': 'STAY PERIOD',
    'receipt.tab_breakdown': 'TAB #{n} BREAKDOWN',
    'receipt.save_choices': 'SAVE CHOICES',
    'receipt.current_total': 'Current Total',
    'receipt.settle_close_tab': 'SETTLE & CLOSE TAB',
    'receipt.save_image': 'SAVE IMAGE',
    'receipt.print_pdf': 'PRINT PDF',
    'receipt.qty_suffix': '×',
    'receipt.settled': 'Settled',
    'receipt.tab_total': 'Tab Total',
    'receipt.payments_received': 'Payments Received',
    'receipt.total_paid_usd': 'Total Paid (USD Equiv.)',
    'receipt.drinks': 'Drinks',
    'receipt.discount': 'Discount',
    'receipt.drink': 'Drink',
    'receipt.extra': 'Extra',

    // Drinks
    'drinks.title': 'Drink Inventory',
    'drinks.subtitle': 'Manage drink stock and pricing',
    'drinks.add_drink': 'Add Drink',
    'drinks.name': 'Name',
    'drinks.icon': 'Icon',
    'drinks.price': 'Price',
    'drinks.quantity': 'Quantity',
    'drinks.stock': 'Stock',
    'drinks.edit_drink': 'Edit Drink',
    'drinks.add_new_drink': 'Add New Drink',
    'drinks.update': 'Update',
    'drinks.add': 'Add',
    'drinks.cancel': 'Cancel',
    'drinks.no_drinks': 'No drinks in inventory',
    'drinks.edit': 'Edit',
    'drinks.delete': 'Delete',
    'drinks.confirm_delete': 'Are you sure you want to delete this drink?',
    'drinks.loading': 'Loading drinks...',
    'drinks.pos_title': 'Drinks Point of Sale',
    'drinks.pos_subtitle': 'Sell drinks to walk-in customers',
    'drinks.select_drink': 'Select Drink',
    'drinks.sell': 'Sell',
    'drinks.selling': 'Selling...',
    'drinks.sale_error': 'Failed to complete sale',
    'drinks.out_of_stock': 'Not enough stock available',
    'drinks.total': 'Total',
    'drinks.recent_sales': 'Recent Sales',
    'drinks.no_sales': 'No sales today',
    'drinks.add_to_tab': 'Add Drink to Tab',
    'drinks.select': 'Select',
    'drinks.close': 'Close',
    'drinks.inventory_tab': 'Inventory',
    'drinks.pos_tab': 'Point of Sale',
    'drinks.current_tab': 'Current Tab',
    'drinks.tab_empty': 'Tab is empty',
    'drinks.closing': 'Closing...',
    'drinks.close_tab': 'Close Tab',
    'drinks.register_purchase': 'Register Drink Purchase',
    'drinks.unit_type': 'Unit Type',
    'drinks.unit_glass': 'Glass',
    'drinks.unit_half_liter': '0.5L',
    'drinks.unit_liter': '1L',
    'drinks.unit_bottle': 'Bottle',
    'drinks.unit_can': 'Can',
    'drinks.buy_price': 'Buy Price',
    'drinks.sell_price': 'Sell Price',
    'drinks.add_purchase': 'Add Purchase',
    'drinks.sell_drinks': 'Sell Drinks',
    'drinks.select_existing': 'Select Existing Drink',
    'drinks.add_new': 'Add New Drink',
    'drinks.current_stock': 'Current Stock',
    'drinks.existing_drinks': 'Existing Drinks',
    'drinks.restock_button': 'Restock',
    'drinks.quantity_to_add': 'Quantity to Add',
    'drinks.category': 'Category',
    'drinks.category_non_alcoholic': 'Non-alcoholic',
    'drinks.category_alcoholic': 'Alcoholic',
    'drinks.category_saqlangan_ichimliklar': 'Soft Drinks',
    'drinks.category_piva': 'Beer',
    'drinks.category_vino': 'Wine',
    'drinks.category_aroq': 'Vodka',
    'drinks.unit': 'Unit',
    'drinks.unit_custom': 'Custom',
    'drinks.unit_0_3l_banka': '0.3L banka',
    'drinks.unit_0_5L': '0.5L',
    'drinks.unit_1L': '1L',
    'drinks.unit_1_5L': '1.5L',
    'drinks.unit_2L': '2L',
    'drinks.unit_shisha': 'shisha/bottle',

    // POS
    'pos.title': 'Point of Sale',
    'pos.cart': 'Cart',
    'pos.empty_cart': 'Cart is empty',
    'pos.total': 'Total',
    'pos.checkout': 'Checkout',
    'pos.payments': 'Payments',
    'pos.add_payment': 'Add Payment',
    'pos.payments_total': 'Payments Total',
    'pos.confirm_checkout': 'Confirm Checkout',
    'pos.sale_success': 'Sale completed successfully!',
    'pos.price_not_set': 'Price not set',
    'pos.sales_history': 'Sales History',
    'pos.no_sales': 'No sales yet',

    // Storage/Inventory
    'storage.title': 'Storage / Inventory',
    'storage.low_stock': 'Low Stock',

    // Navigation
    'nav.drinks': 'Drinks',

    // Transaction Categories
    'txn.category_groceries': 'Groceries',
    'txn.category_workers_income': 'Workers Income',
    'txn.category_gas': 'Gas for Car',
    'txn.category_other_expenses': 'Other Expenses',
    'txn.tab_drinks': 'Drinks',
    'txn.date_format_month_short': 'M',

    // Calendar
    'calendar.today': 'Today',
    'calendar.title': 'Calendar',

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
    'form.expense': 'Xarajat',
    'form.income': 'Daromad',
    'form.transactions': 'Tranzaksiyalar',
    'form.financial_tracker': 'Moliyaviy kuzatuv',
    'form.manager_recording': 'Menejer yozuvi',
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
    'msg.confirm_cancel_trip': 'Bu sayrni bekor qilishga ishonchingiz komilmi?',
    'msg.confirm_checkout': 'Chiqishga ishonchingiz komilmi',
    'msg.confirm_checkin': 'Kelishni tasdiqlash',
    'msg.upcoming_guest': 'Kelayotgan mehmon',
    'msg.cancel_meal_request': 'Bekor qilish',
    'msg.meal_request_for': 'uchun soʻrov',
    'msg.saving': 'Saqlanmoqda...',
    'msg.confirm_extension': 'Uzaytirishni tasdiqlash',
    'msg.no_bookings': 'Band qilishlar yoʻq',
    'msg.no_bookings_day': 'Bu kun uchun band qilishlar yoʻq',
    'msg.please_fill_all_drink_fields': 'Iltimos, barcha ichimlik maydonlarini toʻldiring',
    'msg.drink_purchase_saved': 'Ichimlik xaridi muvaffaqiyatli saqlandi!',
    'msg.drink_tab_closed': 'Ichimlik hisobi muvaffaqiyatli yopildi!',

    // Manager Notifications
    'notif.title': 'Bildirishnomalar',
    'notif.none': 'Bildirishnomalar yoʻq',
    'notif.show_more': 'Koʻproq koʻrsatish',
    'notif.more_suffix': 'ta',

    // Manager Grocery
    'grocery.purchase_mode': 'Mahsulot xarid rejimi',
    'grocery.review_subtitle': 'Oshxonadan kelgan roʻyxatni koʻrib chiqing va yangilang',
    'grocery.new_request': 'Yangi soʻrov',
    'grocery.no_active': 'Faol mahsulot soʻrovlari yoʻq',
    'grocery.mark_purchased': 'Xarid qilindi deb belgilash',
    'grocery.waiting_verification': 'Oshxona tasdigʻini kutmoqda...',

    // Unified Folio
    'folio.title': 'Yagona mehmon hisobi',
    'folio.fiscal_status': 'Moliyaviy holat',
    'folio.prepaid_office': '[ OLDINDAN TOʻLANGAN - OFIS ]',
    'folio.open_camp': '[ OCHIQ - LAGER ]',
    'folio.service_breakdown': 'Xizmatlar tafsiloti',
    'folio.accommodation': 'Turar joy',
    'folio.catering_accepted': 'Ovqatlanish (Qabul qilingan)',
    'folio.gross_total': 'Umumiy summa',
    'folio.balance_sheet': 'Balans varaqasi',
    'folio.settled_amount': 'Toʻlangan summa',
    'folio.current_live_tab': 'Joriy hisob',
    'folio.prepaid': 'OLDINDAN TOʻLANGAN',
    'folio.pending_settlement': '⚠ Lagerda hisob-kitob kutilmoqda',
    'folio.audit_trail': 'Tekshiruv jurnali: Oshxona va xizmatlar',
    'folio.live_sync': 'Jonli sinxronizatsiya',
    'folio.no_kitchen_activity': 'Oshxona faoliyati qayd etilmagan.',
    'folio.nights_label': 'Kechalar',
    'folio.adults_label': 'Kattalar',
    'folio.lunch': 'Tushlik',
    'folio.dinner': 'Kechki ovqat',
    'folio.size_label': 'Hajmi',
    'folio.tab_settled': 'HISOB YOPILDI (NOL BALANS)',
    'folio.refund_due_to_guest': 'Mehmonga qaytariladigan summa',

    // Navigation
    'nav.calendar': 'Kalendar',
    'nav.meals': 'Ovqatlar',
    'nav.logistics': 'Logistika',
    'nav.stores': 'Ombor',
    'nav.fiscal_recording': 'Moliyaviy yozuv',
    'nav.guest_calendar': 'Mehmonlar kalendari',
    'nav.catering': 'Ovqatlanish',
    'nav.ceo_executive': 'CEO Boshqaruvi',

    // Guest Agenda
    'agenda.title': 'Mehmonlar kun tartibi',
    'agenda.subtitle': 'Bugungi mehmonlarni boshqarish portali',
    'agenda.add_booking': '+ Band qilish qoʻshish',
    'agenda.upcoming_active': 'Kelayotgan va faol',
    'agenda.checked_in': 'Kelgan',
    'agenda.arriving_soon': 'Tez orada keladi',
    'agenda.arriving': 'Kelmoqda',
    'agenda.in_stay': 'Yashamoqda',
    'agenda.todays_operations': 'Bugungi ishlar',
    'agenda.daily_schedule': 'Kunlik jadval',

    // Calendar View
    'calview.title': 'Kalendar koʻrinishi',
    'calview.subtitle': 'Xususiy band qilish kalendari',
    'calview.today': 'Bugun',
    'calview.more_suffix': 'ta koʻproq',
    'calview.all_bookings': 'Barcha band qilishlar',
    'calview.legend_confirmed': 'Tasdiqlangan',
    'calview.legend_checked_in': '✓ Kelgan',
    'calview.legend_checked_out': '✈ Ketgan',
    'calview.legend_cancelled': '✕ Bekor qilingan',
    'calview.legend_local': '🏠 Mahalliy',
    'calview.legend_pool': 'Basseyn',
    'calview.legend_calendar': '📅 Kalendar',

    // Google Calendar Event
    'gcal.event_title': 'GOOGLE KALENDAR HODISASI',
    'gcal.calendar_only': 'FAQAT KALENDAR — HALI BAND QILINMAGAN',
    'gcal.calendar_only_desc': 'Kelish, xizmatlar va toʻlovlarni boshqarish uchun ushbu hodisadan band qilish yarating.',
    'gcal.create_booking_checkin': '→BAND QILISH VA KELISHNI TASDIQLASH',
    'gcal.create_booking_only': 'FAQAT BAND QILISH YARATISH',

    // Booking Modal
    'booking.details': 'BAND QILISH MAʼLUMOTLARI',
    'booking.standard_stay': 'STANDART YASHASH BAND QILISH',
    'booking.hide_notes': 'Eslatmalarni yashirish',
    'booking.show_notes': 'Eslatmalarni koʻrsatish',
    'booking.checked_in': 'Kelgan',
    'booking.check_out_guest': 'MEHMONNI CHIQARISH',
    'booking.stay_notes': 'BAND QILISH VA YASHASH ESLATMALARI',
    'booking.edit_dates': 'Sanalarni tahrirlash',
    'booking.add_to_tab': 'HISOBGA QOʻSHISH',
    'booking.post_new_charges': 'BU MEHMON UCHUN YANGI XARAJAT KIRITISH',

    'booking.other_services': 'BOSHQA XIZMATLAR',
    'booking.food_prepaid': 'Ovqat oldindan toʻlangan',
    'booking.quick_add_lunch': 'TEZKOR TUSHLIK QOʻSHISH',
    'booking.quick_add_dinner': 'TEZKOR KECHKI OVQAT QOʻSHISH',
    'booking.adults': 'Kattalar',
    'booking.children': 'Bolalar',
    'booking.additional_services': 'QOʻSHIMCHA XIZMATLAR',
    'booking.transportation': 'TRANSPORT',
    'booking.guide_service': 'GID XIZMATI',
    'booking.add': 'QOʻSHISH',
    'booking.tab_summary': 'HISOB XULOSASI',
    'booking.food': 'Ovqat',
    'booking.current_tab_balance': 'JORIY HISOB BALANSI',

    'booking.payment_collection': 'TOʻLOV YIGʻISH',
    'booking.remaining': 'QOLGAN:',
    'booking.payment_n': 'TOʻLOV',
    'booking.pay_in': 'VALYUTA',
    'booking.method': 'USUL',
    'booking.cash': 'NAQD',
    'booking.online': 'ONLAYN',
    'booking.money_to_collect_usd': 'YIGʻISH KERAK BOʻLGAN SUMMA (USD)',
    'booking.match_balance': 'BALANSGA MOSLASH',
    'booking.add_another_currency': '+ BOSHQA VALYUTA QOʻSHISH',
    'booking.balance_mismatch': 'BALANS NOMOSLIGI:',
    'booking.auto_fix': 'AVTO-TUZATISH',
    'booking.review_pay_tab': 'HISOBNI TEKSHIRISH VA TOʻLASH',
    'booking.guest_folio': 'MEHMON HISOBI',
    'booking.tab_active': 'Hisob',
    'booking.active': 'Faol',
    'booking.cannot_checkout_unsettled': 'FAOL HISOB TOʻLANMAGUNCHA MEHMON CHIQA OLMAYDI',

    // Stay Configuration
    'stay.config_title': 'YASHASH SOZLAMALARI',
    'stay.original_prepaid': 'ASOSIY YASHASH OLDINDAN TOʻLANGAN',
    'stay.children_under_12': '12 YOSHGACHA BOLALAR',
    'stay.accommodation_label': 'TURAR JOY',
    'stay.paid_badge': 'TOʻLANGAN',
    'stay.extension_fee': 'Uzaytirish toʻlovi (USD)',
    'stay.save_guest_count': 'Mehmon sonini saqlash',
    'stay.edit': 'Tahrirlash',

    // Receipt
    'receipt.title': 'YAKUNIY CHEK',
    'receipt.guest': 'MEHMON',
    'receipt.stay_period': 'YASHASH MUDDATI',
    'receipt.tab_breakdown': '#{n}-HISOB TAFSILOTI',
    'receipt.save_choices': 'TANLOVLARNI SAQLASH',
    'receipt.current_total': 'Joriy summa',
    'receipt.settle_close_tab': 'HISOBNI YOPISH VA TOʻLASH',
    'receipt.save_image': 'RASM SIFATIDA SAQLASH',
    'receipt.print_pdf': 'PDF CHOP ETISH',
    'receipt.qty_suffix': 'x',
    'receipt.settled': 'Toʻlangan',
    'receipt.tab_total': 'Hisob jami',
    'receipt.payments_received': 'Qabul qilingan toʻlovlar',
    'receipt.total_paid_usd': 'Jami toʻlangan (USD ekvivalenti)',
    'receipt.drinks': 'Ichimliklar',
    'receipt.discount': 'Chegirma',
    'receipt.drink': 'Ichimlik',
    'receipt.extra': 'Qoʻshimcha',

    // Drinks
    'drinks.title': 'Ichimliklar ombori',
    'drinks.subtitle': 'Ichimliklar zaxirasi va narxlarini boshqarish',
    'drinks.add_drink': 'Ichimlik qo\'shish',
    'drinks.name': 'Nomi',
    'drinks.icon': 'Belgi',
    'drinks.price': 'Narx',
    'drinks.quantity': 'Miqdor',
    'drinks.stock': 'Zaxira',
    'drinks.edit_drink': 'Ichimlikni tahrirlash',
    'drinks.add_new_drink': 'Yangi ichimlik qo\'shish',
    'drinks.update': 'Yangilash',
    'drinks.add': 'Qo\'shish',
    'drinks.cancel': 'Bekor qilish',
    'drinks.no_drinks': 'Omborda ichimliklar yo\'q',
    'drinks.edit': 'Tahrirlash',
    'drinks.delete': 'O\'chirish',
    'drinks.confirm_delete': 'Bu ichimlikni o\'chirmoqchimisiz?',
    'drinks.loading': 'Ichimliklar yuklanmoqda...',
    'drinks.pos_title': 'Ichimliklar savdo punkti',
    'drinks.pos_subtitle': 'Yurib kelgan mijozlarga ichimlik sotish',
    'drinks.select_drink': 'Ichimlikni tanlang',
    'drinks.sell': 'Sotish',
    'drinks.selling': 'Sotilmoqda...',
    'drinks.sale_error': 'Sotishni tugatish muvaffaqiyatsiz',
    'drinks.out_of_stock': 'Yetarli zaxira yo\'q',
    'drinks.total': 'Jami',
    'drinks.recent_sales': 'So\'nggi sotuvlar',
    'drinks.no_sales': 'Bugun sotuvlar yo\'q',
    'drinks.add_to_tab': 'Ichimlikni hisobga qo\'shish',
    'drinks.select': 'Tanlash',
    'drinks.close': 'Yopish',
    'drinks.inventory_tab': 'Ombor',
    'drinks.pos_tab': 'Savdo punkti',
    'drinks.current_tab': 'Hozirgi hisob',
    'drinks.tab_empty': 'Hisob bo\'sh',
    'drinks.closing': 'Yopilmoqda...',
    'drinks.close_tab': 'Hisobni yopish',
    'drinks.register_purchase': 'Ichimlik xaridini ro\'yxatga olish',
    'drinks.unit_type': 'Birlik turi',
    'drinks.unit_glass': 'Stakan',
    'drinks.unit_half_liter': '0.5L',
    'drinks.unit_liter': '1L',
    'drinks.unit_bottle': 'Shisha',
    'drinks.unit_can': 'Banka',
    'drinks.buy_price': 'Sotib olish narxi',
    'drinks.sell_price': 'Sotish narxi',
    'drinks.add_purchase': 'Xaridni qo\'shish',
    'drinks.sell_drinks': 'Ichimliklarni sotish',
    'drinks.select_existing': 'Mavjud ichimlikni tanlang',
    'drinks.add_new': 'Yangi ichimlik qo\'shish',
    'drinks.current_stock': 'Hozirgi zaxira',
    'drinks.existing_drinks': 'Mavjud ichimliklar',
    'drinks.restock_button': 'Qayta to\'ldirish',
    'drinks.quantity_to_add': 'Qo\'shiladigan miqdor',
    'drinks.category': 'Kategoriya',
    'drinks.category_non_alcoholic': 'Alkogolsiz',
    'drinks.category_alcoholic': 'Alkogolli',
    'drinks.category_saqlangan_ichimliklar': 'Saqlangan ichimliklar',
    'drinks.category_piva': 'Piva',
    'drinks.category_vino': 'Vino',
    'drinks.category_aroq': 'Aroq',
    'drinks.unit': 'Birlik',
    'drinks.unit_custom': 'Boshqa',
    'drinks.unit_0_3l_banka': '0.3L banka',
    'drinks.unit_0_5L': '0.5L',
    'drinks.unit_1L': '1L',
    'drinks.unit_1_5L': '1.5L',
    'drinks.unit_2L': '2L',
    'drinks.unit_shisha': 'shisha/bottle',

    // POS
    'pos.title': 'Sotish nuqtasi',
    'pos.cart': 'Savat',
    'pos.empty_cart': 'Savat bo\'sh',
    'pos.total': 'Jami',
    'pos.checkout': 'To\'lov',
    'pos.payments': 'To\'lovlar',
    'pos.add_payment': 'To\'lov qo\'shish',
    'pos.payments_total': 'To\'lovlar jami',
    'pos.confirm_checkout': 'To\'lovni tasdiqlash',
    'pos.sale_success': 'Sotish muvaffaqiyatli yakunlandi!',
    'pos.price_not_set': 'Narx belgilanmagan',
    'pos.sales_history': 'Sotilganlar tarixi',
    'pos.no_sales': 'Hozircha sotilmagan',

    // Storage/Inventory
    'storage.title': 'Ombor / Zaxira',
    'storage.low_stock': 'Kam zaxira',

    // Navigation
    'nav.drinks': 'Ichimliklar',

    // Transaction Categories
    'txn.category_groceries': 'Oziq-ovqat',
    'txn.category_workers_income': 'Ishchilar maoshi',
    'txn.category_gas': 'Mashina uchun yoqilgʻi',
    'txn.category_other_expenses': 'Boshqa xarajatlar',
    'txn.tab_drinks': 'Ichimliklar',
    'txn.date_format_month_short': 'oy',

    // Calendar
    'calendar.today': 'Bugun',
    'calendar.title': 'Kalendar',

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
    return 'uz';
  });

  const handleSetLanguage = (lang: Language) => {
    setLanguage(lang);
    if (typeof window !== 'undefined') {
      localStorage.setItem('language', lang);
    }
  };

  const t = (key: string) => {
    // Try current language first
    const currentLangValue = translations[language][key as keyof typeof translations['en']];
    if (currentLangValue) return currentLangValue;
    
    // Fallback to English if current language is missing the key
    const englishValue = translations['en'][key as keyof typeof translations['en']];
    if (englishValue) {
      console.warn(`Translation key "${key}" missing in ${language}, using English fallback`);
      return englishValue;
    }
    
    // Both languages missing - log warning and return placeholder
    console.warn(`Translation key "${key}" missing in both ${language} and English`);
    return `[MISSING: ${key}]`;
  };

  const getLocale = () => language === 'uz' ? 'uz-UZ' : 'en-US';

  return (
    <LanguageContext.Provider value={{ language, setLanguage: handleSetLanguage, t, getLocale }}>
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
