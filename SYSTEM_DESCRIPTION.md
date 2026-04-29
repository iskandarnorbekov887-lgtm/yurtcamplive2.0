# Isky / Sayyod Yurt Camp — Internal Operations System
## Complete Technical Description (Final Stability Update)

**Generated:** April 29, 2026  
**Stack:** Next.js 16 (App Router) · TypeScript · TailwindCSS · Supabase SSR · Vercel

---

## 1. What It Is

A **staff-only internal enterprise system** for managing a luxury yurt camp in Uzbekistan. It is the single source of truth for the entire business, coordinating between sales (Reservers), kitchen (Cooks), operations (Managers), and executive oversight (CEO).

---

## 2. Tech Stack & Architecture

| Layer | Technology |
|---|---|
| **Framework** | Next.js 16 (App Router, Turbopack enabled) |
| **Auth System** | **Supabase SSR** with Singleton Pattern browser client |
| **Middleware** | **Proxy-based gatekeeper (`proxy.ts`)** for Edge-level auth protection |
| **Rendering** | **Forced Dynamic (`force-dynamic`)** to bypass Vercel caching issues |
| **Sync Strategy** | **5-second polling interval** with throttled Auth Listeners |
| **Language** | Multi-language Context (EN, UZ, RU) with shared translation keys |

---

## 3. User Roles & Security

| Role | Access Permissions |
|---|---|
| **CEO** | Full system control, Team management, Audit deletions, Global pricing. |
| **Manager** | Operational hub: approvals, check-ins/outs, and financial recording. |
| **Reserver** | Sales-focused: creating bookings and optimizing yurt occupancy. |
| **Cook** | Kitchen-focused: tracking meal counts and guest dietary notes. |

---

## 4. Portals & Dashboards

### `/login` (Auth Entry)
Standardized login using Supabase Auth. Recently updated to remove client-side redirect logic, relying entirely on the **Next.js Middleware** for higher stability.

### `/bookings` — Reserver Portal
**Primary View:** `OccupancyCalendar` (Month View).
- **Functionality**: Click any date to open the `ReserverIncomeForm`.
- **Sync**: Listens for `localStorage` events to sync booking state across multiple open tabs instantly.

### `/manager` — Manager Portal
**Core Workflow**:
1. **Approval**: Review pending bookings and confirm them.
2. **Operations**: Manage check-ins and check-outs via the calendar.
3. **Alerts**: Highlights "Neglected" bookings that are confirmed but overdue for check-in.

### `/cook` — Cook Portal
**Sections**:
1. **Orders**: Time-aware meal tracking. Automatically switches between Breakfast (AM), Lunch (Mid-day), and Dinner (PM). 
2. **Notes**: Highlights guest meal notes in yellow to prevent kitchen errors.
3. **Grocery**: Create grocery lists to send to the manager (currently console-log only).

### `/ceo` — Executive Command Center
**Automation**:
- Runs a **60-second background loop** for auto-checkout and overdue check-in alerts.
- **Team Management**: Interface to add/remove staff members via the `api/users` route handler.

### `/ceo-financials` — Financial Audit
A dedicated portal for the CEO to view the **Camp Cash Box** and verify income/expense records across USD, UZS, and EUR.

---

## 5. Major Components

### `OccupancyCalendar.tsx` (Operational Heart)
- **Visuals**: Color-coded booking bars (Yellow=Confirmed, Green=Active, Blue=Completed, Red=Overdue).
- **Details**: Clicking a booking opens a deep-dive panel with guest itineraries, service requests, and payment logs.

### `ReserverIncomeForm.tsx` (Sales Hub)
- **Logic**: Handles complex day-by-day service arrays (Lunch, Dinner, Guide, Transport) stored as JSON in the database.
- **Exchange Rates**: Live fetch of currency rates for UZS/USD conversions.

---

## 6. Resolved Architectural Issues (April 29 Update)

- **Auth Loop Fix**: Removed `router.refresh()` from the auth listener to stop the "Tab Freezing" loop on Vercel.
- **Singleton Client**: Implementation of the Singleton Pattern in `utils/supabase/client.ts` ensures only one auth lock is held, preventing race conditions in React Strict Mode.
- **Cache Eradication**: All dashboard routes now use `force-dynamic` to ensure Vercel never serves stale data.
- **Middleware Guard**: Authentication is now verified at the Edge before the page even begins to render.

---

## 7. Known Behavioral Notes

1. **`special_requests` JSON**: This column handles legacy text and new JSON arrays. The system uses a try/catch parser to support both formats.
2. **Cook counts**: Meal counts currently represent the total number of active guests, not individual meal checkboxes.
3. **Currency Base**: The system uses **UZS (Uzbek Som)** as the base accounting currency, converting all USD and EUR entries for the master ledger.

---

*This document accurately represents the system architecture as of the April 29, 2026 stability update.*
