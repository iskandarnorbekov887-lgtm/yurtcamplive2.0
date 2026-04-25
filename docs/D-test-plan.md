# D — Automated Test Plan & Test Cases
**Author role:** QA Lead (Next.js / Supabase)  
**Date:** April 25, 2026  
**Total Test Cases:** 65

---

## Test Data Assumptions

| Entity | Value |
|---|---|
| Test camp location timezone | UTC+5 (Uzbekistan) |
| Active yurts | 4 yurts (IDs: 1, 2, 3, 4) |
| Staff accounts | CEO (ceo@test.com), Manager (mgr@test.com), Reserver (res@test.com), Cook (cook@test.com) |
| Test booking | guest_name: "Test Guest", check_in: tomorrow, check_out: tomorrow+2, status: confirmed |
| Exchange rate | 1 USD = 12,800 UZS (mocked in tests) |
| Polling interval | Mocked to manual trigger in unit tests |
| iCal URL | Mock HTTP server returning a valid .ics file |

---

## Testing Approach

### Unit Tests
- Framework: **Jest + React Testing Library**
- Scope: pure functions, date utilities, form calculations, lane assignment algorithm
- No Supabase calls (all mocked with `jest.mock('@/lib/supabase')`)

### Integration Tests
- Framework: **Playwright** (end-to-end in real browser)
- Scope: full user flows — login → action → verify in DB
- Uses Supabase test project (separate from production)
- Each test resets state via SQL setup scripts

### Flakiness Sources
- **5-second polling** — tests must not depend on automatic refresh; use `fetchData()` call assertions or trigger manually
- **Multi-tab sync** — uses `localStorage` events; test by firing `StorageEvent` manually in test
- **Timezone** — always freeze `Date.now()` in unit tests to a fixed UTC+5 timestamp
- **Auto-checkout** — 60-second interval; mock `setInterval` and call the callback manually

---

## Section 1: Booking Creation Flow (TC-01 to TC-15)

| TC | Test Case | Type | Expected Result |
|---|---|---|---|
| TC-01 | Click a calendar day → form opens with check_in pre-filled | Integration | Modal visible, check_in = clicked date, mini calendar on correct month |
| TC-02 | Click "Add Booking" header button → form opens with empty dates | Integration | Modal visible, check_in = '', mini calendar on current month |
| TC-03 | Pick check-in from mini calendar (manual mode) | Integration | check_in date highlighted green, check_out still empty |
| TC-04 | Pick check-out after check-in | Integration | check_out highlighted, nights badge shows correct count |
| TC-05 | Pick check-out before check-in → not allowed | Integration | click ignored, no check-out set |
| TC-06 | Double-click check-in → resets both dates | Integration | Both dates cleared, "tap a date to start" hint visible |
| TC-07 | Double-click check-out → resets only check-out | Integration | check-in still shown, check_out cleared |
| TC-08 | `nights` badge calculation — 1 night | Unit | `checkOut - checkIn = 1` → badge shows "1n" |
| TC-09 | `nights` badge calculation — 7 nights | Unit | Shows "7n" |
| TC-10 | Day cards expand for each day of stay | Integration | 3 nights = 3 day cards rendered |
| TC-11 | Add guest name inputs dynamically | Integration | Click "+" → new input appears |
| TC-12 | Remove middle guest name | Integration | Other names preserved, index reassigned |
| TC-13 | Submit booking — happy path | Integration | Row inserted in `bookings`, modal closes, calendar refreshes |
| TC-14 | Submit booking — duplicate guest warning fires | Integration | Warning banner shown, proceed button available |
| TC-15 | Submit booking — duplicate warning bypassed → submits | Integration | Second booking created despite warning |

---

## Section 2: Check-in Workflow (TC-16 to TC-24)

| TC | Test Case | Type | Expected Result |
|---|---|---|---|
| TC-16 | Check-in button visible only on check_in = today + status = confirmed | Integration | Button absent for tomorrow's booking |
| TC-17 | Check-in button absent for cancelled booking | Integration | No button rendered |
| TC-18 | Check-in button absent for completed booking | Integration | No button rendered |
| TC-19 | Click check-in → confirmation dialog appears | Integration | `confirm()` dialog with guest name |
| TC-20 | Confirm check-in → status updated to `checked_in` | Integration | Supabase row status = 'checked_in' |
| TC-21 | Calendar bar turns green after check-in | Integration | Bar color matches checked-in palette |
| TC-22 | Cancel check-in dialog → no status change | Integration | status remains 'confirmed' |
| TC-23 | Check-in fails (network error) → error toast shown | Integration | Error message visible, status unchanged |
| TC-24 | Check-in button disabled during loading | Integration | Button disabled while `loadingAction = 'checkin'` |

---

## Section 3: Check-out Workflow (TC-25 to TC-33)

| TC | Test Case | Type | Expected Result |
|---|---|---|---|
| TC-25 | Check-out button visible only for `checked_in` bookings | Integration | Absent for `confirmed`, `completed`, `cancelled` |
| TC-26 | Confirm checkout → camp_finances row created | Integration | New row in `camp_finances` with correct amount, guest_name, dates |
| TC-27 | Confirm checkout → booking status = completed | Integration | `bookings.status = 'completed'` |
| TC-28 | Double-click checkout button → only one finance record | Integration | `camp_finances` count for booking_id = 1 |
| TC-29 | Checkout with currency UZS → amount_uzs = original_amount | Integration | No conversion applied |
| TC-30 | Checkout with currency USD → amount_uzs = amount * rate | Integration | Correct UZS equivalent stored |
| TC-31 | Checkout fails (network) → no status change + error toast | Integration | Status stays `checked_in`, no finance record |
| TC-32 | Auto-checkout fires at noon for checked_in bookings with check_out = today | Unit | Status updated without manual interaction |
| TC-33 | Auto-checkout does NOT fire before noon | Unit | Status unchanged if `getHours() < 12` |

---

## Section 4: Role-Based Access Control (TC-34 to TC-44)

| TC | Test Case | Type | Expected Result |
|---|---|---|---|
| TC-34 | Reserver accesses `/bookings` → allowed | Integration | Page loads |
| TC-35 | Reserver accesses `/manager` → redirected | Integration | Redirected to `/unauthorized` |
| TC-36 | Reserver accesses `/ceo` → redirected | Integration | Redirected to `/unauthorized` |
| TC-37 | Cook accesses `/cook` → allowed | Integration | Page loads |
| TC-38 | Cook accesses `/bookings` → redirected | Integration | Redirected to `/unauthorized` |
| TC-39 | Manager accesses `/manager` → allowed | Integration | Page loads |
| TC-40 | CEO accesses all pages → all allowed | Integration | No redirects for CEO |
| TC-41 | Reserver sees "Add Booking" button on calendar | Integration | Button visible |
| TC-42 | Manager does NOT see "Add Booking" button on calendar | Integration | Button absent (prop not passed) |
| TC-43 | Cook sees calendar in read-only mode | Integration | No check-in/out buttons, no edit mode |
| TC-44 | Unauthenticated user accesses any page → login redirect | Integration | Redirected to `/login` |

---

## Section 5: Financial Entries (TC-45 to TC-50)

| TC | Test Case | Type | Expected Result |
|---|---|---|---|
| TC-45 | Finance record created on checkout with booking_id | Integration | `camp_finances.booking_id` = booking ID |
| TC-46 | Unique constraint prevents second finance insert for same booking | Integration (DB) | `UNIQUE constraint` violation, second insert rejected |
| TC-47 | Manager delete request → CEO receives notification | Integration | Notification row in DB for CEO user_id |
| TC-48 | CEO approves delete → record moved to `deleted_records`, removed from `camp_finances` | Integration | `camp_finances` row gone, `deleted_records` row exists |
| TC-49 | CEO denies delete → record remains in `camp_finances` | Integration | Row still present |
| TC-50 | Delete approval notification sent to all managers (not just first) | Integration | Notification inserted for every Manager role user |

---

## Section 6: iCal Sync (TC-51 to TC-55)

| TC | Test Case | Type | Expected Result |
|---|---|---|---|
| TC-51 | CEO sets iCal URL → events appear on calendar | Integration | iCal events rendered as booking bars |
| TC-52 | iCal events don't mix with internal bookings | Integration | When `calendarPreference = 'ical'`, only iCal events shown |
| TC-53 | iCal URL unreachable → empty events, no crash | Integration | `icalEvents = []`, no error thrown |
| TC-54 | iCal event with no summary → shows "iCal Event" | Unit | Fallback string applied |
| TC-55 | "Sync Now" button manually triggers re-fetch | Integration | `fetchIcalEvents()` called, event count updated |

---

## Section 7: Overdue Alerts & Automation (TC-56 to TC-60)

| TC | Test Case | Type | Expected Result |
|---|---|---|---|
| TC-56 | Booking with check_in < today shows in "Attention Needed" | Integration | Booking card visible in Manager Bookings tab |
| TC-57 | Booking with check_in = today and hour >= 18 shows as neglected | Unit | `getBookingStatus()` returns `'neglected-checkin'` |
| TC-58 | Booking with check_in = today and hour < 18 shows as upcoming | Unit | `getBookingStatus()` returns `'upcoming'` |
| TC-59 | Neglected check-in bar shown in red on calendar | Integration | Color = `{bg: '#EF4444', ...}` |
| TC-60 | Checked-in guest not checked out 24 hrs after check_out → console.warn fires | Unit | `console.warn` spy called with guest name |

---

## Section 8: Cook Portal (TC-61 to TC-65)

| TC | Test Case | Type | Expected Result |
|---|---|---|---|
| TC-61 | Cook sees only `checked_in` guests in Meal Orders | Integration | Only `status = 'checked_in'` bookings shown (note: current logic uses date range, not status — this is a bug to expose) |
| TC-62 | Meal breakfast/lunch/dinner counts reflect actual booking meal fields | Integration | Count = `SUM(lunch_count)` not `activeBookings.length` |
| TC-63 | Dietary notes visible per booking | Integration | `meal_notes` text displayed in booking card |
| TC-64 | Cook grocery "Send to Manager" — currently saves nothing | Integration | ⚠️ EXPECTED TO FAIL — exposes the known bug |
| TC-65 | Cook cannot access check-in/out actions on calendar | Integration | Buttons absent when `userRole = 'Cook'` |

---

## Potential Flakiness Sources & Mitigations

| Source | Risk | Mitigation |
|---|---|---|
| 5-second polling interval | Tests may pass/fail depending on whether poll has fired | Mock `setInterval` to no-op; call `fetchData()` directly in assertions |
| Multi-tab localStorage sync | Firing `StorageEvent` differs across test environments | Use `window.dispatchEvent(new StorageEvent('storage', { key: 'camp_bookings' }))` explicitly |
| Date-dependent tests | `TC-56–TC-60` depend on current time | Freeze `Date` in all unit tests with `jest.useFakeTimers()` |
| Network latency | Integration tests timing out on Supabase calls | Use test Supabase project with row limits, or mock Supabase client |
| Confirm dialogs | `window.confirm()` blocks Playwright | Use `page.on('dialog', d => d.accept())` before triggering actions |
| Auto-checkout interval (60s) | Cannot wait 60s in tests | Mock `setInterval`, capture callback, call manually |
