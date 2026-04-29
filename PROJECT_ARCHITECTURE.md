# Isky Camp Flow - Ultimate Technical Manual
*Last Updated: 2026-04-29*

## 1. Executive Summary
**Isky Camp Flow** is a full-stack hospitality ERP (Enterprise Resource Planning) system. It bridges the gap between front-desk operations (Check-ins), sales (Bookings), logistics (Kitchen), and executive oversight (Finance).

---

## 2. Frontend Architecture (The Client Layer)

### A. Component Philosophy
- **Client vs. Server Components**: The dashboards are primarily **Client Components** (`'use client'`) because they require high interactivity (tabs, modals, real-time polling). However, the data fetching is increasingly moving towards **Server Components** where stability is prioritized.
- **Atomic UI**: The project uses a "Flat Component" structure for speed, but encapsulates complex logic into specialized files like `google-guest-agenda.tsx` and `occupancy-calendar.tsx`.

### B. Global State Management
- **AuthContext (`src/lib/auth-context.tsx`)**: 
  - *Internal Mechanism*: Uses a `onAuthStateChange` listener from `@supabase/ssr`. 
  - *Hydration*: On page load, it checks for an existing session. If found, it fetches the user's `profile` from PostgreSQL and populates the global `user` state.
  - *Race Condition Protection*: Implements a 6-second `safetyTimeout` to ensure the "Loading" spinner doesn't hang if Supabase takes too long to respond.
- **LanguageContext (`src/lib/language-context.tsx`)**: 
  - *Mechanism*: Stores a `locale` (en, uz, ru) and provides a `t()` translation function. 
  - *Persistence*: The language choice is persisted so users don't have to re-select it on every visit.

### C. Visual System & Aesthetics
- **Design Language**: Modern Glassmorphism & High-Contrast Slates.
- **Interactive Elements**: Extensive use of hover states, micro-animations (e.g., the spinning "Initializing Command Center" loader), and color-coded status badges (Confirmed = Emerald, Cancelled = Rose, Pending = Amber).

---

## 3. Backend Architecture (The Server Layer)

### A. The SSR Cookie Engine (`src/utils/supabase/`)
This is the core of how the app handles sessions in Next.js 16.
- **Cookie Persistence**: When a user logs in, the session isn't just in the browser; it's written to an HTTP-only cookie.
- **Server Access (`server.ts`)**: Server Components call `createClient()` which uses the `cookies()` API. This allows the server to know who the user is *before* the HTML is even sent to the browser.

### B. The Security Proxy (`proxy.ts`)
The project uses the Next.js 16 **Proxy pattern** instead of standard middleware for advanced routing.
- **Edge Verification**: It runs at the "edge" (closest to the user).
- **Hard Guards**: It specifically targets dashboard routes (`/ceo`, `/manager`, etc.). If a request lacks a session cookie, the Proxy issues a `307 Temporary Redirect` to `/login`.

### C. API Route Handlers (`src/app/api/`)
- **User Management (`/api/users`)**: 
  - *Security*: This is a **privileged API**. It requires the `SUPABASE_SERVICE_ROLE_KEY`. 
  - *Operations*: Handles complex tasks like creating a user in Supabase Auth and then immediately creating their corresponding row in the `profiles` table to maintain referential integrity.

---

## 4. Advanced Data & Business Logic

### A. Financial Multi-Currency Logic
The system handles three currencies: **USD**, **UZS (Sum)**, and **EUR**.
- **Exchange Math**: When a booking is completed, the system reads the `usd_to_uzs` rate from the `service_pricing` table.
- **Automatic Ledger**: On check-out, it performs the conversion and logs the `amount_uzs` (the base accounting currency) and the `original_amount` into the `camp_finances` table.
- **The Cash Box**: The `CEO Financials` page runs an aggregation query (`.reduce()`) to show the real-time physical cash counts for the USD/UZS/EUR drawers.

### B. Kitchen Intelligence (The Cook Portal)
- **Time-Aware UI**: The Cook dashboard detects the current hour (`new Date().getHours()`). 
- **Meal Logic**: 
  - Hour < 10: Shows Breakfast orders.
  - 10 <= Hour < 15: Shows Lunch orders.
  - Hour >= 15: Shows Dinner orders.
- **Dietary Safeguards**: It parses the `meal_notes` field from the `bookings` table and highlights them in **Bright Yellow** to ensure the cook sees allergies or special requests.

### C. Real-Time Synchronization
- **Polling Strategy**: To ensure all staff see the same data without overwhelming the database, dashboards implement a **5-second polling interval** (`setInterval`).
- **Conflict Resolution**: The system uses a `deDuplicate()` helper function in the dashboards to ensure that if a polling update arrives while a user is interacting, the UI doesn't flicker or show duplicate IDs.

---

## 5. Production Safeguards (Vercel Optimizations)

### A. The "Nuclear" Cache Bypass
Because Vercel is highly optimized for static content, it can sometimes cache a "Logged Out" state. 
- **The Fix**: We use `export const dynamic = 'force-dynamic'` in the Root Layout. 
- **The Result**: Every request is treated as unique. The server *must* check the cookie every time, ensuring 100% accurate auth and data.

### B. Lock Release Management
Supabase uses the `navigator.locks` API in the browser. 
- **The Fix**: In `auth-context.tsx`, we wrap the auth listener in a `useEffect` that explicitly calls `subscription.unsubscribe()`. 
- **The Result**: This prevents "Browser Tab Freezing" which occurs when too many open tabs try to grab the same authentication lock.

---

## 6. Project Directory Map (In-Depth)

- **`src/app/ceo-financials/`**:
  - `page.tsx`: The main calendar view.
  - `detail/[id]/page.tsx`: Full audit view for a specific expense/income record.
  - `booking/[id]/page.tsx`: Deep-dive into a specific guest's payment history.
- **`src/components/google-guest-agenda.tsx`**: 
  - *Complexity*: This is the most logic-heavy UI component. It manages the integration between Supabase bookings and the Google Calendar API.
- **`src/components/occupancy-calendar.tsx`**: 
  - *Logic*: Uses a grid system to map yurt IDs (rows) against dates (columns). It calculates "occupancy density" to help the Reserver optimize yurt usage.

---

## 7. Operational Checklist for New Developers
1. **Env Vars**: Ensure `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are present.
2. **Auth Patterns**: Always use `useAuth()` to access the user; never initialize a new Supabase client inside a component.
3. **Database Updates**: Use the `supabase` client provided by the context to ensure sessions are preserved.
4. **Deployment**: Always check the Vercel Build Logs to ensure the `ƒ (Dynamic)` icon appears next to all routes.
