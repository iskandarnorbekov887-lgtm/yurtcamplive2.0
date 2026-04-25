# A — Feature Brief: Booking & Check-in Module
**Author role:** Senior Product Engineer  
**Date:** April 25, 2026  
**App:** Isky/Sayyod Yurt Camp Internal Ops (Next.js · TypeScript · TailwindCSS · Supabase)

---

## Goals

1. Provide a reliable, role-appropriate interface for the full booking lifecycle: creation → confirmation → check-in → check-out → financial recording.
2. Eliminate data ambiguity caused by the dual-purpose `special_requests` column.
3. Ensure every role sees exactly what they need and nothing more.
4. Make day-by-day service planning (meals, guides, transport) a first-class data structure — not a JSON blob in a text column.
5. Prevent double financial entries on checkout.
6. Give Managers and CEOs the ability to create bookings from their own portals.

---

## Personas

| Persona | Portal | Primary Job |
|---|---|---|
| **Reserver** | `/bookings` | Creates bookings, enters full service plan, tracks occupancy |
| **Manager** | `/manager` | Approves/rejects bookings, performs check-in/out, records payments, oversees services |
| **CEO** | `/ceo` | Full visibility, financial oversight, staff management, iCal import, delete approvals |
| **Cook** | `/cook` | Views today's meal orders, sees dietary notes per guest |

---

## User Stories

### Reserver

**US-R1.** As a Reserver, I want to click any day on the occupancy calendar and immediately open a booking form with that date pre-filled as check-in, so I don't have to re-enter the date manually.

**US-R2.** As a Reserver, I want to see a visual day-by-day breakdown of the stay while filling the form, so I can enter meal, guide, and transport details per day without confusion.

**US-R3.** As a Reserver, I want to be warned if a booking for the same guest name already exists on overlapping dates, so I can avoid duplicate entries.

**US-R4.** As a Reserver, I want to record the payment method (in-camp / all paid / partial) and currency at the time of booking creation.

**US-R5.** As a Reserver, I want to add multiple guest names to a single booking so group bookings are accurately represented.

### Manager

**US-M1.** As a Manager, I want to see a list of bookings where the check-in date has passed but guests are not yet checked in (neglected check-ins), so I can take action immediately.

**US-M2.** As a Manager, I want to check in a guest with a single button tap from the calendar detail panel, with a confirmation prompt.

**US-M3.** As a Manager, I want to check out a guest and have the financial record created automatically, so I never have to create it manually.

**US-M4.** As a Manager, I want to edit a booking's check-in/out dates, guest count, and services from the calendar detail panel.

**US-M5.** As a Manager, I want to record how much the guest paid (amount + currency) at checkout, so the financial records are accurate.

**US-M6.** As a Manager, I want to create a new booking directly from my portal without switching to the Reserver page.

### CEO

**US-C1.** As a CEO, I want to see all bookings in the calendar including iCal-imported events from external platforms (e.g. Booking.com), so I have a unified view.

**US-C2.** As a CEO, I want to approve or deny a Manager's request to delete a financial record, with a notification that the request was processed.

**US-C3.** As a CEO, I want to see my full staff list (name, email, role) in one view.

### Cook

**US-K1.** As a Cook, I want to see the exact number of meals to prepare for today (breakfast/lunch/dinner separately), based on confirmed meal orders from bookings — not just active guest count.

**US-K2.** As a Cook, I want to see dietary restrictions and special meal notes per guest clearly, so I don't miss them.

---

## Acceptance Criteria

### Booking Creation (US-R1 through US-R5)

- [ ] Clicking a calendar day opens the booking form with `check_in` pre-populated and the mini calendar positioned on that month.
- [ ] Clicking "Add Booking" in the header opens the form with an empty `check_in`; the user picks both dates from the mini calendar.
- [ ] The mini calendar blocks selecting `check_out` before or equal to `check_in`.
- [ ] Nights count is calculated automatically as `check_out - check_in` in days and displayed as a badge.
- [ ] The form shows one day card per day of stay (from check-in to check-out inclusive).
- [ ] Each day card contains: Lunch (bool + count + dietary), Dinner (bool + count + dietary), Guide service (bool + guide names), Cooking class (bool + description), Transportation (bool + entries), Special request (text).
- [ ] Submitting the form creates one row in `bookings` and one row per day in `booking_day_services` (proposed new table — see Data Model).
- [ ] If the same guest name appears in a booking within ±7 days, a warning banner is shown with an option to dismiss and proceed.
- [ ] All form fields use black text on white/light backgrounds.

### Check-in (US-M2)

- [ ] Check-in button is only visible on bookings with `status = 'confirmed'` AND `check_in = today`.
- [ ] Pressing check-in shows a confirmation dialog: "Are you sure you want to check in [guest name]?"
- [ ] On confirm, `status` is set to `checked_in` in Supabase.
- [ ] UI immediately reflects new status without requiring a page refresh.
- [ ] If check-in fails, an error toast is shown. The status does not change.

### Check-out (US-M3, US-M5)

- [ ] Check-out button is only visible for `status = 'checked_in'` bookings.
- [ ] On confirm, exactly ONE row is inserted into `camp_finances`. If an identical row already exists (same `booking_id`, `type = 'income'`, `category = 'Booking'`), the insert is skipped and a warning is shown.
- [ ] `status` is updated to `completed`.
- [ ] If the financial insert fails, the status update does NOT proceed (atomic operation).

### Neglected Check-ins (US-M1)

- [ ] A booking is shown in "Attention Needed" if: `status = 'confirmed'` AND (`check_in < today` OR (`check_in = today` AND current hour >= 18)).
- [ ] Clicking the attention card switches to the Check-in tab and highlights the booking on the calendar.

---

## Data Model References

### Current `bookings` table (problematic fields)

```
special_requests   TEXT   -- stores EITHER plain text OR JSON array of day services
guest_count        INT    -- duplicate of number_of_people and num_people
guide_required     BOOL   -- duplicate of guide_service
```

### Proposed addition: `booking_day_services` table

See document **B — Database Schema** for full DDL.

### Fields that need deprecation

| Field | Problem | Action |
|---|---|---|
| `special_requests` | Dual-purpose (text + JSON) | Migrate to `booking_day_services`, keep column for read-only legacy display |
| `num_people` | Duplicate of `number_of_people` | Deprecate, use `guest_count` as canonical |
| `guide_required` | Duplicate of `guide_service` | Deprecate, use `guide_service` |

---

## API / DB Changes Required

1. **New table:** `booking_day_services` — one row per day per booking (see Doc B).
2. **Add `booking_id` FK to `camp_finances`** — enables double-insert prevention and audit traceability.
3. **Add unique constraint:** `UNIQUE(booking_id)` or `UNIQUE(booking_id, type, category)` on `camp_finances` to prevent duplicate checkout entries at DB level.
4. **Extend `OccupancyCalendar` props:** Add `onAddNewBooking` to Manager and CEO calendar instances.
5. **Backfill migration:** Parse existing `special_requests` JSON rows into `booking_day_services`. (See Doc B for script.)

---

## UI/UX Considerations

- The booking detail panel in `OccupancyCalendar` is 73KB in a single file. It must be split into sub-components: `BookingHeader`, `BookingItinerary`, `BookingActions`, `BookingPayment`.
- The mini calendar must show check-in date in a distinct but similar green shade vs check-out.
- Double-tap reset on mini calendar is an undiscoverable gesture — add a "Reset dates" text button below the calendar.
- Day cards should be collapsible when a day has no services entered (reduce visual noise for long stays).
- The Cook meal orders page must show actual `lunch_count` and `dinner_count` from booking data — not `activeBookings.length`.
- All input/display text must be black on light backgrounds (not slate-400 or grey variants on user data).

---

## Non-Functional Requirements

| Requirement | Target |
|---|---|
| Page load time | < 2 seconds on 4G |
| Calendar render | < 100ms for month view with 50 bookings |
| Data freshness | Max 5s stale (current polling). Goal: real-time via Supabase subscriptions |
| Concurrent users | Support 10 simultaneous staff users without degradation |
| Uptime | 99.5% during camp operating hours (May–September) |
| Data retention | Booking records kept indefinitely. Finance records kept 7 years (Uzbekistan tax law) |
| Security | All routes server-verified by role. No booking data exposed without auth |

---

## Edge Cases

1. **Check-in and check-out on same day** — `nights = 0`. System should allow this (day-visitor scenario). Financial record should still be created.
2. **Booking spanning month boundary** — Calendar must render bars that span across weeks correctly. ✅ Currently handled.
3. **Guest checks out early** — Manager needs to update `check_out` date before clicking check-out. Edit mode must allow changing dates on `checked_in` bookings.
4. **iCal event conflicts with internal booking on same dates** — No conflict detection exists. Should show a visual warning on calendar when two bars overlap for the same yurt.
5. **Multiple guides per day** — Currently stored as comma-separated string. Should be an array in `booking_day_services`.
6. **Transport with no price** — Price field is optional. Financial record should still be created without transport revenue.
7. **Exchange rate changes between booking and checkout** — The rate at booking creation may differ from checkout day. The finance record should record the rate at checkout, not at booking.
8. **Cancelled booking financial record** — If a booking was cancelled after check-in, the finance record should be voided or flagged, not deleted silently.

---

## Areas Requiring Refactoring (Prioritized)

### Priority 1 — CRITICAL
- **`special_requests` dual-purpose field** → Migrate to `booking_day_services` table (Doc B).
- **No idempotency guard on checkout** → Add `booking_id` FK + unique constraint on `camp_finances`.

### Priority 2 — HIGH
- **`OccupancyCalendar.tsx` (73KB)** → Break into 5-6 focused sub-components.
- **`ReserverIncomeForm.tsx` (39KB)** → Extract DayCard, PaymentSection, GuestSection.
- **Cook meal counts** → Replace `activeBookings.length` with actual `SUM(lunch_count)` query.

### Priority 3 — MEDIUM
- **Polling → Supabase real-time** → Replace `setInterval(fetchData, 5000)` with `supabase.channel()` subscriptions.
- **Manager/CEO cannot create bookings** → Pass `onAddNewBooking` to their calendar instances.
- **Date timezone inconsistency** → Centralize all date-to-string operations through `localDateStr()`.

### Priority 4 — LOW
- **Cook grocery list** → Implement `grocery_requests` table and real backend (Doc G).
- **Messages/Observer pages** → Decide: build or remove the routes.
- **Single-manager assumption in notifications** → Support multiple managers.

---

## Testing Plan

See document **D — Test Plan** for full test cases.

Summary:
- Unit tests: date utilities, lane assignment algorithm, nights calculation
- Integration tests: booking creation flow, check-in/out flow, financial record creation
- RBAC tests: each role sees/cannot-see correct buttons and routes
- Regression: double checkout insert prevention
