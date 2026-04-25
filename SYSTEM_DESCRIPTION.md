# Isky / Sayyod Yurt Camp — Internal Operations System
## Complete Technical Description (Brutally Honest)

**Generated:** April 25, 2026  
**Stack:** Next.js (App Router) · TypeScript · TailwindCSS · Supabase (PostgreSQL + Auth)

---

## 1. What It Is

A **staff-only internal web application** for managing a yurt camp (glamping business) in Uzbekistan.  
It is NOT customer-facing. Guests never interact with it.  
The system manages the full guest lifecycle: booking → check-in → check-out → financial recording.

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js (App Router, `'use client'` components) |
| Language | TypeScript |
| Styling | TailwindCSS (utility-first, no component library) |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth + custom role column on `profiles` table |
| Icons | Inline SVG (no icon library) |
| Calendar Import | ical.js (for iCal/ICS file parsing) |
| Exchange Rates | exchangerate-api.com (live fetch on form open) |
| Fallback | Local in-memory client (`local-supabase.ts`) when Supabase is not configured |

---

## 3. User Roles

| Role | Access Level |
|---|---|
| **CEO** | Full access to everything |
| **Manager** | Check-in/out, booking management, financials, yurt status |
| **Reserver** | Create bookings, view occupancy calendar |
| **Cook** | View meal orders for current guests, grocery list |

Roles are stored in a `profiles` table linked to Supabase Auth user IDs.  
Every page is wrapped in `<ProtectedRoute allowedRoles={[...]}>` which redirects unauthorized users.

---

## 4. Pages & Routes

### `/` (Root)
- 102-byte file. Likely redirects to login.

### `/login`
- Authentication page. Supabase email/password login.

### `/bookings` — Reserver Portal
**Roles:** Reserver, CEO, Manager  
**Features:**
- Month-view occupancy calendar (`OccupancyCalendar` component)
- Click any day → opens `ReserverIncomeForm` modal with that date pre-filled as check-in
- "Add Booking" button in calendar header → opens form without pre-filled date (manual date selection)
- Full bookings table below the calendar (all bookings, all statuses)
- Can cancel bookings
- Can edit bookings (if role allows)
- 5-second polling + localStorage cross-tab sync

### `/manager` — Manager Portal
**Roles:** Manager, CEO  
**3 Tabs:**
1. **Check-in** — `OccupancyCalendar` with check-in/check-out actions. No ability to create new bookings from here.
2. **Bookings** — Two panels:
   - "Attention Needed": Bookings that are confirmed but check-in day has passed, or it's after 6PM on check-in day. Clicking switches to the Check-in tab.
   - "Pending Bookings": Bookings with `status = 'pending'`. Approve (→ `confirmed`) or Reject (→ `cancelled`). Shows meal notes if present.
3. **Financials** — A card with a link to `/financials`. Nothing embedded.

**Missing:** Cannot create new bookings from this portal.

### `/ceo` — CEO Dashboard
**Roles:** CEO only  
**3 Tabs:**
1. **Check-in** — Full `OccupancyCalendar` with all actions. Optional iCal overlay (replaces internal bookings with iCal events when enabled). Sync button to refresh iCal events manually.
2. **Team** — Table of all staff (name, email, role) from `profiles` table.
3. **Financials** — Link card to `/ceo-financials`.

**Header extras:**
- Settings button → modal for iCal URL configuration and calendar preference (internal vs iCal). Saved to `localStorage`.
- Notification bell → dropdown showing up to 10 notifications. Supports delete request approval workflow.
- Language switcher

**Automation (runs every 60 seconds):**
- Auto-checkout: if it's past noon and a guest's check-out date is today and status is `checked_in`, automatically marks them `completed`
- Overdue check-in alert: logs a warning if a confirmed booking's check-in was 1-2 days ago

**Missing:** Cannot create new bookings from CEO page.

### `/checkin` — Check-in & Check-out Portal
**Roles:** CEO, Manager, Cook  
**Features:**
- Just the `OccupancyCalendar` component
- Manager/CEO can check in and check out guests
- Cook can only view (no check-in/out buttons, no editing)

### `/cook` — Cook Portal
**Roles:** Cook, CEO  
**3 Tabs:**
1. **Orders** — Shows current meal orders based on time of day (breakfast before 10AM, lunch before 3PM, dinner otherwise). Displays all guests currently checked in with meal notes if any. Shows breakfast/lunch/dinner counts — but the count is just the number of active bookings, NOT the actual requested meal count.
2. **Calendar** — Shows a placeholder message. Dead tab.
3. **Grocery** — Text input list to create a grocery list. "Send to Manager" button logs to console only. **Does not save to database. Completely non-functional.**

### `/financials` — Financial Recording
Not read. Accessible to Manager role.

### `/ceo-financials` — CEO Financial Calendar
Not read. Accessible to CEO role.

### `/messages` — Empty directory. Feature does not exist.
### `/observer` — Empty directory. Feature does not exist.
### `/unauthorized` — Shown when a user accesses a route their role doesn't permit.

---

## 5. Core Components

### `OccupancyCalendar.tsx` — 73KB, ~1,300 lines

The largest and most complex file. Handles:
- Monthly calendar grid rendering (5-6 weeks)
- Color-coded booking bars per day (multi-lane layout for overlapping bookings)
- Booking status colors:
  - Yellow = upcoming (confirmed)
  - Green = checked in
  - Blue = completed/checked out
  - Red = cancelled or neglected check-in
  - Grey = no arrival
- Clicking a booking bar → side panel with full booking details
- Booking detail panel (Google Calendar-style card layout):
  - Guest name + people/nights/yurts summary
  - Check-in to check-out date range
  - Day-by-day itinerary (meals, guide, transport, notes)
  - Yurt requests
  - Payment collection input (for Manager)
  - Per-day services editing panel (for Manager)
  - Drinks tab management popup
  - Extra services popup
  - Edit mode with save
  - Check-in / Check-out / Cancel action buttons
  - No Arrival button
  - Cook-specific editing panel
- "Add Booking" button in header (Reserver portal only)
- Clicking an empty day → list of bookings on that day

**State variables (partial list):** `cur`, `sel`, `selectedDay`, `loadingAction`, `isEditing`, `editData`, `showEditRequestModal`, `editRequestData`, `showDrinksPopup`, `showExtraServicesPopup`, `drinks`, `selectedDrinks`, `newExtraService`, `collectedAmount`, `collectedCurrency`

### `ReserverIncomeForm.tsx` — 39KB, ~530 lines

Modal booking creation form. Features:
- Multiple guest names (dynamic list)
- Total guests count
- Children under 12 count
- Inline mini calendar for check-in + check-out date selection
  - When opened from calendar date click: check-in is pre-set and locked; only pick check-out
  - When opened from "Add Booking" button: pick both check-in and check-out from the mini calendar
  - Double-click a selected date to reset
- Yurt Request text field
- Day-by-day service cards (one card per night/day of stay):
  - Lunch checkbox
  - Dinner checkbox
  - Food dietary/request notes
  - Guide service checkbox + guide names
  - Cooking class checkbox + description
  - Transportation checkbox + per-transport entries (driver, pickup time, from, to, arrival time, price)
  - Special request text at bottom of each day card
- Payment section:
  - Method: In-Camp / All Paid / Partially Paid
  - Currency: USD / UZS / EUR
  - Amount (optional)
  - Exchange rate (auto-fetched or manual)
  - Payment note
- General notes/description
- Duplicate booking detection with bypass option
- Submits to `bookings` table in Supabase

---

## 6. Database Tables (inferred from code)

| Table | Purpose |
|---|---|
| `profiles` | Staff accounts with roles |
| `bookings` | All booking records |
| `yurts` | Yurt inventory (name, status, type, capacity) |
| `camp_finances` | Financial records (income/expense) |
| `notifications` | In-app notifications (delete requests, approvals) |
| `deleted_records` | Archive of deleted financial records |
| `drinks` | Drinks menu (name, price, currency, available) |

---

## 7. Booking Data Model (Key Fields)

```
id, guest_name, check_in, check_out, total_price,
status: confirmed | checked_in | completed | cancelled | pending | no_arrival,
payment_status: Paid | Partial | Unpaid,
number_of_people, guest_count, num_people (3 fields for the same thing),
nights, children_under_12,
yurt_id (null for Reserver-created bookings),
special_requests (DUAL PURPOSE: plain text OR JSON day-by-day services array),
notes, meal_notes, description,
guide_service, guide_names, guide_required (overlapping fields),
has_transportation, transportation_details,
lunch, lunch_count, lunch_dietary,
dinner, dinner_count,
drinks, drinks_count, drinks_tab,
cooking_class, cooking_class_description,
laundry, laundry_price, laundry_currency,
payment_method, currency, amount, exchange_rate,
yurt_requests,
extra_services (JSON array),
collected_amount, collected_currency,
created_by_role, created_by_id, created_at,
last_edited_by_id, last_edited_by_role, last_edited_at,
approved_by_manager, source
```

---

## 8. Sync Strategy

All pages use **polling every 5 seconds** with `setInterval(fetchData, 5000)`.  
Additionally, `localStorage` events are listened for to sync across browser tabs instantly.  
Supabase real-time websocket subscriptions are **NOT used**.  
This means every logged-in user sends a full database read every 5 seconds indefinitely.

---

## 9. Known Bugs & Issues

### Critical

1. **`special_requests` column dual-purpose**  
   Stores both plain text (old bookings) and JSON (new day-by-day services). Same column, two formats. The calendar attempts `JSON.parse()` and silently falls back on failure. Old bookings show raw JSON strings in some views.

2. **No double-checkout protection**  
   Clicking "Check Out" twice inserts two rows into `camp_finances` for the same booking. No guard exists.

3. **Cook grocery list is fake**  
   `handleSendToManager()` runs `console.log(...)` only. Shows a success message but saves nothing. No `grocery_requests` table exists.

4. **Single-manager assumption in notification system**  
   Delete approval sends a notification to the manager fetched via `.eq('role', 'Manager').single()`. If there are 2+ managers, this query throws an error and the entire checkout/delete approval flow breaks.

### Moderate

5. **Date timezone inconsistency**  
   `localDateStr()` helper exists to fix a UTC-offset bug (midnight UTC = previous day in UTC+5). But the Cook page, Manager page, and checkin page still use `new Date().toISOString().split('T')[0]`, which is the broken version.

6. **Three field names for guest count**  
   `number_of_people`, `num_people`, and `guest_count` all exist. Code does `sel.num_people || sel.number_of_people || sel.guest_count` throughout.

7. **iCal import hardcodes `yurt_id: 1`**  
   Every iCal-imported event is assigned to yurt #1 regardless of what the event is for.

8. **Managers and CEO cannot create bookings**  
   `onAddNewBooking` is only passed to `OccupancyCalendar` on the `/bookings` (Reserver) page. Manager and CEO calendar views have no way to create new bookings.

9. **Yurt column shows "Yurt null" for Reserver bookings**  
   All Reserver bookings save `yurt_id: null`. The bookings table renders `Yurt null` for those rows.

### Minor

10. **Console noise**: `"🔄 [Role] Fetched bookings: X"` logged every 5 seconds per user. CEO also logs `"⏰ CEO Polling..."` every 5 seconds.

11. **Mixed languages**: Day labels say `"1-kun – 24 April"` mixing Uzbek ("kun" = day) with English.

12. **UI inconsistency**: CEO/Manager/Cook pages have gradient-colored headers. Reserver page has a plain white header. Different visual language.

13. **Dead Cook calendar tab**: Shows only `"Occupancy calendar has been moved to the dedicated Check-in section"`. It's a tab that does nothing.

14. **Observer and Messages pages**: Directories exist in the codebase but are completely empty. No functionality.

15. **Cook meal counts are wrong**: The "Today's Full Schedule" shows `activeBookings.length` for breakfast, lunch, and dinner counts — it shows total active guests, not actual meal orders. All three meals always show the same number.

---

## 10. What Is Working End-to-End

| Flow | Status |
|---|---|
| Login / role routing | ✅ Works |
| Reserver creates booking with day-by-day services | ✅ Works |
| Manager views and edits bookings | ✅ Works |
| Manager checks in / checks out guests | ✅ Works |
| CEO views full dashboard | ✅ Works |
| CEO approves/denies delete requests via notifications | ✅ Works |
| iCal import and overlay on CEO calendar | ✅ Works |
| Financial record auto-created on checkout | ✅ Works |
| Multi-currency with live exchange rate | ✅ Works |
| Duplicate booking detection with bypass | ✅ Works |
| Auto-checkout at noon (CEO page only) | ✅ Works |
| Neglected check-in highlighting on calendar | ✅ Works |
| Language switching | ✅ Works |
| Cook views active guest meal orders | ⚠️ Partially works (counts are wrong) |
| Cook sends grocery list to Manager | ❌ Fake — console.log only |
| Messages feature | ❌ Does not exist |
| Observer feature | ❌ Does not exist |

---

## 11. File Size Reference

| File | Size | Notes |
|---|---|---|
| `occupancy-calendar.tsx` | ~73KB | Single component, extremely large |
| `reserver-income-form.tsx` | ~39KB | Single component, very large |
| `ceo/page.tsx` | ~737 lines | Large page with embedded logic |
| `manager/page.tsx` | ~294 lines | Moderate |
| `bookings/page.tsx` | ~169 lines | Reasonable |
| `cook/page.tsx` | ~308 lines | Moderate |
| `checkin/page.tsx` | ~153 lines | Small |

---

*End of description.*
