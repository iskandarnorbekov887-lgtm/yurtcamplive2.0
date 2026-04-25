# J — Product Requirements Document: Scalable Rewrite
**Author role:** Growth-Oriented Product Manager  
**Date:** April 25, 2026  
**Document type:** PRD — Internal Platform v2.0  
**Codename:** Camp OS

---

## Vision

Replace the current monolithic staff operations app with a **real-time, normalized, modular platform** that can support:
- Multiple camp locations
- 20+ concurrent staff users
- External booking platform integrations (Booking.com, Airbnb)
- A mobile-first Cook/Driver interface
- Financial reporting with export to accounting software

---

## Problem Statement

The current system (`v1`) works for a single camp with 4–6 yurts and a small team. It has proven the product-market fit. As the business grows, the following hard limits will cause operational failures:

1. A single `bookings` table column (`special_requests`) carries two incompatible data formats.
2. No real-time updates — max 5-second lag between staff members.
3. Two features (Cook grocery, Observer portal) are shipped as UI chrome with no backend.
4. One 73KB React component handles half the application's UI — unmaintainable.
5. No automated tests — every deployment is a manual risk.

---

## Scope

### In Scope (v2 MVP)
- All existing booking lifecycle features (create, edit, cancel, check-in, check-out)
- Normalized `booking_day_services` data model
- Real-time updates via Supabase subscriptions
- Cook grocery list (functional backend)
- Fully working iCal import with yurt assignment
- Financial recording with `booking_id` FK
- Role-based access control maintained
- Automated test suite (60+ tests)

### Out of Scope (v2 MVP — future)
- Multi-location support
- Booking.com / Airbnb API integration
- Guest-facing portal
- Mobile app (native)
- Accounting software export

---

## Personas

| Persona | Primary Device | Primary Need |
|---|---|---|
| Reserver (Sayyod) | Desktop | Create bookings fast, see occupancy at a glance |
| Manager | Tablet / Desktop | Check in/out, resolve issues, record payments |
| CEO | Desktop | Financial overview, team visibility, decision-making |
| Cook | Tablet / Phone | See today's meal orders, submit grocery lists |

---

## MVP Requirements

### Must Have (P0)

| ID | Requirement |
|---|---|
| P0-01 | Booking creation with normalized day-by-day services (`booking_day_services`) |
| P0-02 | Real-time calendar updates (< 500ms from change to all connected clients) |
| P0-03 | Atomic check-out: financial record + status update in single transaction (Edge Function) |
| P0-04 | Double-checkout prevention at database level (unique constraint) |
| P0-05 | Functional Cook grocery backend (save, notify Manager, track purchase status) |
| P0-06 | Manager and CEO can create bookings from their own portals |
| P0-07 | UTC timezone fix across all date operations |
| P0-08 | Correct meal counts on Cook portal (SUM of lunch_count/dinner_count, not active booking count) |
| P0-09 | Error feedback on all mutation failures |
| P0-10 | 60+ automated tests, all passing in CI |

### Should Have (P1)

| ID | Requirement |
|---|---|
| P1-01 | iCal import with yurt assignment (not hardcoded to yurt #1) |
| P1-02 | Accessible calendar (ARIA labels, keyboard navigation, focus trapping in modals) |
| P1-03 | Audit log table with triggers on booking changes |
| P1-04 | `OccupancyCalendar` split into ≤ 6 focused components |
| P1-05 | `ReserverIncomeForm` split into ≤ 4 focused components |
| P1-06 | Multi-manager notification support |
| P1-07 | Guest data erasure workflow (GDPR) |
| P1-08 | Session-aware date handling (timezone from user profile, not server) |

### Nice to Have (P2)

| ID | Requirement |
|---|---|
| P2-01 | Mobile-optimized Cook view (separate layout breakpoint) |
| P2-02 | Booking conflict detection (same yurt, overlapping dates) |
| P2-03 | Early checkout flow (update check_out date before confirming checkout) |
| P2-04 | Export financial records to CSV/Excel |
| P2-05 | Observer portal (read-only real-time dashboard) |
| P2-06 | Messages feature between staff roles |

---

## Milestones

| Milestone | Target | Deliverables |
|---|---|---|
| **M0: Foundation** | Week 2 | DB schema migration complete, test infrastructure set up, CI/CD pipeline active |
| **M1: Data Layer** | Week 4 | `booking_day_services` live, backfill complete, dual-write validated |
| **M2: Real-time** | Week 6 | All polling replaced with Supabase subscriptions on all pages |
| **M3: Checkout Safety** | Week 7 | Atomic checkout Edge Function, unique constraint, double-insert test passing |
| **M4: Cook Backend** | Week 8 | Grocery request save/read/notify live in Cook + Manager portals |
| **M5: Component Refactor** | Week 10 | Calendar and form components split, no file > 20KB |
| **M6: Test Suite** | Week 11 | 60+ tests, 100% pass rate, integrated into CI |
| **M7: UAT** | Week 12 | Staff acceptance testing, bug fix sprint |
| **M8: v2 Launch** | Week 13 | Full production deployment, legacy `v1` retired |

---

## Architecture Decisions

### Real-Time

Replace `setInterval(fetchData, 5000)` with:

```typescript
// Per-page subscription pattern
supabase
  .channel(`bookings-${userRole}`)
  .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, fetchData)
  .on('postgres_changes', { event: '*', schema: 'public', table: 'booking_day_services' }, fetchData)
  .subscribe();
```

### Atomic Checkout (Supabase Edge Function)

```typescript
// supabase/functions/checkout/index.ts
Deno.serve(async (req) => {
  const { bookingId, collectedAmount, currency } = await req.json();

  const client = createClient(supabaseUrl, supabaseKey, { auth: { ... } });

  // Run in a transaction via RPC
  const { error } = await client.rpc('atomic_checkout', {
    p_booking_id: bookingId,
    p_amount: collectedAmount,
    p_currency: currency,
  });

  return new Response(JSON.stringify({ error }), { status: error ? 500 : 200 });
});
```

```sql
CREATE OR REPLACE FUNCTION atomic_checkout(
  p_booking_id BIGINT,
  p_amount     NUMERIC,
  p_currency   TEXT
) RETURNS VOID AS $$
BEGIN
  -- Check booking is checked_in
  IF NOT EXISTS (
    SELECT 1 FROM bookings WHERE id = p_booking_id AND status = 'checked_in'
  ) THEN
    RAISE EXCEPTION 'Booking is not in checked_in state';
  END IF;

  -- Insert finance record (unique constraint prevents double-insert)
  INSERT INTO camp_finances (booking_id, type, category, original_amount, currency, ...)
  VALUES (p_booking_id, 'income', 'Booking', p_amount, p_currency, ...);

  -- Update booking status
  UPDATE bookings SET status = 'completed' WHERE id = p_booking_id;
END;
$$ LANGUAGE plpgsql;
```

### Component Architecture

```
src/
  components/
    calendar/
      OccupancyCalendar.tsx        (orchestrator, < 200 lines)
      CalendarGrid.tsx             (month grid rendering)
      BookingBar.tsx               (single booking bar)
      BookingDetailPanel.tsx       (side panel)
      BookingActions.tsx           (check-in/out/cancel buttons)
      BookingItinerary.tsx         (day-by-day services display)
      BookingPayment.tsx           (payment collection)
    forms/
      ReserverIncomeForm.tsx       (orchestrator)
      GuestSection.tsx             (names, count, children)
      DatePickerCalendar.tsx       (mini calendar)
      DayServiceCard.tsx           (per-day service inputs)
      PaymentSection.tsx           (currency, amount, method)
    cook/
      MealOrdersTab.tsx
      GroceryTab.tsx
        GroceryForm.tsx
        GroceryRequestCard.tsx
```

---

## Risk Register (Summary)

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Backfill migration corrupts legacy bookings | Low | Critical | Full backup before run; transaction-wrapped; partial failure logged not crashed |
| Real-time subscriptions add complexity to teardown/cleanup | Medium | Low | Strict `useEffect` cleanup pattern enforced in code review |
| Edge Function cold starts delay checkout | Low | Medium | Keep function warm with scheduled ping; fallback to client-side with retry |
| Staff resistant to UI changes | Medium | Medium | Ship behind feature flag; run parallel for 2 weeks |
| Test suite flakiness blocks CI | Medium | High | Mock all network calls; freeze `Date.now()`; isolate polling |

---

## Success Metrics

| Metric | v1 Baseline | v2 Target |
|---|---|---|
| Data freshness (time to see change) | 0–5 seconds | < 500ms |
| DB reads per minute (5 users) | ~60 | ~5 |
| Test coverage (critical paths) | 0% | ≥ 80% |
| Largest single file | 73KB | ≤ 20KB |
| Known active bugs | 7 | 0 |
| Non-functional features | 2 | 0 |
| Duplicate finance entries | Possible | Impossible (DB constraint) |
| Time to onboard new developer | 3+ days | 1 day (docs + tests) |

---

## Rough Backlog (Epics)

### Epic 1: Data Normalization
- Migrate `special_requests` → `booking_day_services` (Doc B)
- Consolidate duplicate guest count fields
- Add `booking_id` FK to `camp_finances`
- Unique constraint on checkout finance record

### Epic 2: Real-Time Platform
- Replace all `setInterval` with Supabase channel subscriptions
- Add connection state indicator ("Live" / "Reconnecting...")
- Implement optimistic UI updates for check-in/out

### Epic 3: Atomic Operations
- Checkout Edge Function with PostgreSQL transaction
- Check-in Edge Function (simpler — just status update + audit log)
- Retry logic with exponential backoff on network failure

### Epic 4: Cook Grocery
- `grocery_requests` + `grocery_items` tables (Doc G)
- Cook: create, view history, see status
- Manager: acknowledge, mark purchased
- Notification on submit

### Epic 5: Component Refactor
- Split `OccupancyCalendar.tsx` into 6 components
- Split `ReserverIncomeForm.tsx` into 4 components
- Add Storybook stories for each component (optional)

### Epic 6: Test Suite
- Unit tests: date utilities, calculations, status logic
- Integration tests: all booking flows (Playwright)
- RBAC tests: all role/page combinations
- CI pipeline with GitHub Actions + Vercel Preview

### Epic 7: Accessibility & Polish
- ARIA labels on calendar
- Keyboard navigation
- Focus trapping in modals
- Replace `window.confirm()` with custom dialog
- Status icons alongside color coding

### Epic 8: Compliance
- Audit log table with Postgres triggers
- Guest data erasure workflow
- Privacy notice on login page
- Financial record retention policy enforced in DB
