# F — Technical Debt Summary for Leadership
**Author role:** CTO-Level Auditor  
**Date:** April 25, 2026  
**Classification:** Internal — Confidential

---

## Executive Summary

The Isky Yurt Camp internal operations app is a **working prototype that has outgrown its original architecture**. It successfully handles the core booking lifecycle, but carries accumulated technical debt that, if left unaddressed, will cause operational failures as the team and booking volume grow.

This is not a failing system. It is a system built fast to solve a real problem. The debt is the expected cost of that speed. The question is whether to pay it now (controlled cost) or later (emergency cost).

---

## Current State: What Works

- Booking creation, check-in, check-out, and financial recording are functional end-to-end.
- Role-based access control correctly restricts pages per staff role.
- Day-by-day service planning (meals, guides, transport) is captured and displayed.
- Multi-currency support with live exchange rates functions correctly.
- The occupancy calendar provides a clear visual overview of camp capacity.

---

## Root Causes of Debt

### 1. Built for Speed, Not Scale
The application was built iteratively by a small team (likely 1–2 developers) under operational pressure. Decisions were made to ship fast: single large component files, polling instead of websockets, JSON blobs instead of normalized tables.

### 2. No Architectural Planning at Outset
There was no upfront data model design. The `bookings` table now has 40+ columns including three copies of guest count, a column that stores two different data formats, and boolean flags duplicated across different names.

### 3. Incomplete Features Shipped as Live Code
Two features (Cook grocery list, Observer portal) are incomplete but live in production. The grocery list shows a success message but saves nothing. This erodes staff trust when they discover it.

### 4. No Test Coverage
There are no automated tests. Every change is manually tested. Regressions go undetected until a staff member reports them.

---

## Business Impact of Debt (Cost of Inaction)

| Debt Item | If Not Fixed | Business Cost |
|---|---|---|
| Dual-format `special_requests` | Cook or Manager sees wrong meal orders or missing guide | Guest dissatisfaction, operational error |
| Double checkout insert | Revenue figures inflated in financial reports | CEO sees incorrect income data; tax reporting risk |
| Fake grocery feature | Cook's grocery requests never reach Manager | Camp runs out of food supplies; staff trust lost |
| No real-time sync | Manager sees stale booking 5s after Reserver creates it | Overbooking risk in high-demand periods |
| UTC timezone bug | Neglected check-in alerts fire on wrong day | Manager misses or over-responds to alerts |
| 73KB single component | Any new feature takes 3x longer to build | Developer velocity decreases by ~40% over time |
| No error handling | Silent failures on check-in/out | Staff doesn't know operation failed; guest not properly logged |

---

## Three-Step Modernization Plan

### Step 1 — Short-Term Fixes (0–30 Days) | Effort: Low | Risk: Low

**Goal:** Stop active bleeding. No refactoring, just targeted patches.

| Action | File | Time |
|---|---|---|
| Fix UTC timezone bug (4 files) | `cook/page.tsx`, `manager/page.tsx`, `checkin/page.tsx`, `ceo/page.tsx` | 1 day |
| Disable checkout button on first click | `occupancy-calendar.tsx` | 2 hours |
| Fix single-manager notification assumption | `ceo/page.tsx` | 2 hours |
| Replace Cook grocery fake success with honest message | `cook/page.tsx` | 1 hour |
| Add `booking_id` FK + unique constraint to `camp_finances` | SQL migration | 1 day |

**Cost:** 2–3 developer days. Zero downtime. Immediate operational improvement.

---

### Step 2 — Mid-Term Refactor (30–90 Days) | Effort: Medium | Risk: Medium

**Goal:** Normalize data, prevent future corruption, split oversized files.

| Action | Scope | Time |
|---|---|---|
| Migrate `special_requests` → `booking_day_services` | DB + backfill + dual-write | 3 weeks |
| Implement Cook grocery backend (`grocery_requests` table) | DB + API + UI | 1 week |
| Split `OccupancyCalendar.tsx` (73KB) into sub-components | Frontend refactor | 2 weeks |
| Split `ReserverIncomeForm.tsx` (39KB) into sub-components | Frontend refactor | 1 week |
| Add `onAddNewBooking` to Manager and CEO portals | 2 files | 1 day |
| Fix Cook meal count to use actual `lunch_count`/`dinner_count` | `cook/page.tsx` | 2 hours |
| Add error toasts to all mutation operations | Multiple files | 3 days |
| Write 30 core automated tests | Jest + Playwright setup | 2 weeks |

**Cost:** 6–8 developer weeks. Moderate coordination required for DB migration.

---

### Step 3 — Long-Term Architecture (3–6 Months) | Effort: High | Risk: Low (if phased)

**Goal:** Build a system that can scale to 50 bookings/month, 10 concurrent staff, and new feature teams.

| Action | Technology | Benefit |
|---|---|---|
| Replace polling with Supabase Realtime WebSocket subscriptions | `supabase.channel()` | Instant updates, 90% fewer DB reads |
| Migrate to modular component architecture | React component library | New features built 3x faster |
| Introduce Supabase Edge Functions for atomic operations | Deno / TypeScript | Checkout, check-in, financial entry in one transaction |
| Add Row-Level Security audit logging | Supabase + `audit_log` table | Full accountability for who changed what and when |
| Consider separating Cook-facing app from Staff-facing app | Next.js route groups or separate deployment | Cook app can be tablet-optimized, staff app stays desktop-first |
| Establish CI/CD pipeline with automated test gate | GitHub Actions + Vercel Preview | No broken code reaches production |

**Cost:** 3–4 months of a dedicated developer. Potentially a contractor for the DB migration and real-time subscription work.

---

## Recommended Immediate Action

**Do Step 1 this week.** It takes 2–3 days and prevents the most likely operational failures:
- Double checkout inserts
- Wrong-day alerts due to timezone bug
- Staff trusting a feature (grocery) that does nothing

Everything else can be planned and scheduled. Step 1 cannot wait.

---

## Summary Metrics

| Metric | Current | Target (90 days) |
|---|---|---|
| Files > 30KB | 2 (73KB + 39KB) | 0 |
| DB polling reads/minute (5 users) | ~60 | ~5 (heartbeat only) |
| Duplicate column names for same concept | 3 (guest count) | 1 |
| Test coverage | 0% | 40% (critical paths) |
| Known active bugs | 7 | 0 |
| Non-functional features in production | 2 | 0 |
