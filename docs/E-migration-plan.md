# E — Migration & Rollout Plan: `special_requests` Refactor
**Author role:** Release Engineer  
**Date:** April 25, 2026  
**Objective:** Replace dual-purpose `special_requests` field with normalized `booking_day_services` structure with zero downtime and full rollback capability.

---

## Overview

This migration moves day-by-day service data from a JSON blob stored in `bookings.special_requests` to a properly normalized table `booking_day_services`. The migration must:

- Never break existing booking views during the transition
- Be fully reversible at any phase
- Not require a maintenance window
- Be validated before any destructive schema changes

**Total estimated duration:** 8 weeks (2 phases + validation)

---

## Feature Flags

All new code paths are gated by environment variables. No new features ship without the flag being set.

```env
# .env.local / Vercel environment variables

# Phase 1: Enable writing to new tables alongside old field
NEXT_PUBLIC_FF_DAY_SERVICES_WRITE=false   # off by default

# Phase 2: Enable reading from new tables
NEXT_PUBLIC_FF_DAY_SERVICES_READ=false    # off by default

# Emergency: Force legacy read mode
NEXT_PUBLIC_LEGACY_SERVICES_MODE=false    # off = use feature flags above
```

Usage in code:

```typescript
const USE_NEW_SERVICES = process.env.NEXT_PUBLIC_FF_DAY_SERVICES_READ === 'true';

const dayServices = USE_NEW_SERVICES
  ? await fetchFromBookingDayServices(bookingId)
  : parseLegacySpecialRequests(booking.special_requests);
```

---

## Phase 1 — Pilot (Weeks 1–3): Dual Write

### Step 1.1 — Database Changes (Day 1)

Apply DDL from Doc B (additive only — no existing tables modified):

```sql
-- Create new tables
CREATE TABLE booking_day_services (...);
CREATE TABLE booking_day_guides (...);
CREATE TABLE booking_day_transport (...);

-- Add booking_id FK to camp_finances (nullable, non-breaking)
ALTER TABLE camp_finances ADD COLUMN IF NOT EXISTS booking_id BIGINT REFERENCES bookings(id);
```

**Rollback:** `DROP TABLE booking_day_transport, booking_day_guides, booking_day_services;` — zero impact on existing app.

### Step 1.2 — Application: Dual Write (Day 3)

Deploy new `ReserverIncomeForm` that writes to BOTH `special_requests` (legacy) AND `booking_day_services` when `FF_DAY_SERVICES_WRITE = true`.

```typescript
// In handleSubmit — only triggered when flag is on
if (process.env.NEXT_PUBLIC_FF_DAY_SERVICES_WRITE === 'true') {
  await insertDayServices(bookingId, dayEntries);
}
// Always write to special_requests (old behavior preserved)
special_requests: JSON.stringify(dayEntries)
```

**Enable flag for:** Reserver role only (pilot group).  
**Monitor for:** Any insert errors in `booking_day_services`. Check Supabase logs.

### Step 1.3 — Backfill Existing Bookings (Day 4–7)

Run the backfill SQL script from Doc B against production database (off-peak hours: 02:00–04:00 UTC+5).

```bash
# Run backfill with transaction and row limit for safety
psql $DATABASE_URL -f backfill_day_services.sql
```

The script processes one booking at a time with `EXCEPTION WHEN OTHERS THEN RAISE WARNING` so failures are logged, not silently swallowed.

**Validation query after backfill:**

```sql
-- Should return 0 rows (all JSON bookings migrated)
SELECT id FROM bookings
WHERE special_requests LIKE '[%'
  AND id NOT IN (SELECT DISTINCT booking_id FROM booking_day_services);
```

### Step 1.4 — Validation Period (Days 8–14)

- Both old and new data exist in parallel
- Automated test suite runs against new tables
- Manual spot-check: pick 10 bookings, compare `special_requests` JSON with `booking_day_services` rows

**Go/No-Go Criteria for Phase 2:**
- ✅ Backfill query returns 0 unmigrated bookings
- ✅ New bookings created by Reserver appear correctly in `booking_day_services`
- ✅ No insert errors in Supabase logs for past 7 days
- ✅ Automated test suite passes (TC-01 to TC-15 from Doc D)

---

## Phase 2 — Full Rollout (Weeks 4–6): Switch Read Path

### Step 2.1 — Enable Read Flag (Week 4, Monday)

```env
NEXT_PUBLIC_FF_DAY_SERVICES_READ=true
```

This switches `OccupancyCalendar` to read day services from `booking_day_services` instead of parsing `special_requests`.

**Deploy to production at low-traffic time (6:00 AM local).**

Monitor for 48 hours:
- Are booking detail panels showing correct day services?
- Are guide names, transport details, meal counts all correct?
- Any JavaScript errors in browser console?

### Step 2.2 — Rename Legacy Column (Week 5)

Once read path is confirmed stable for 7+ days:

```sql
ALTER TABLE bookings RENAME COLUMN special_requests TO special_requests_legacy;
```

Application code must not reference `special_requests` (only `special_requests_legacy` as read-only fallback when `LEGACY_SERVICES_MODE = true`).

### Step 2.3 — Remove Dual Write (Week 6)

Stop writing to `special_requests_legacy` in new bookings:

```typescript
// Remove this line from handleSubmit:
// special_requests: JSON.stringify(dayEntries)
```

Turn off the write flag:
```env
NEXT_PUBLIC_FF_DAY_SERVICES_WRITE=false
```

### Step 2.4 — Cleanup (Week 8+)

After 30 days with `special_requests_legacy` receiving no new writes and no reads confirmed by Supabase query logs:

```sql
ALTER TABLE bookings DROP COLUMN special_requests_legacy;
```

Remove all feature flag checks from codebase. Remove `LEGACY_SERVICES_MODE` environment variable.

---

## Rollback Plan (by Phase)

### Rollback from Phase 1 (before read switch)

1. Turn off `FF_DAY_SERVICES_WRITE`
2. Old `special_requests` was never stopped — all reads still work
3. Drop new tables if desired
4. **User impact: zero**

### Rollback from Phase 2 (after read switch, before column rename)

1. Set `NEXT_PUBLIC_FF_DAY_SERVICES_READ=false`
2. Application reverts to reading `special_requests` JSON
3. Data in both places is consistent (dual-write was active)
4. **User impact: zero (instant flag flip)**

### Rollback from Phase 2 (after column rename)

1. Set `NEXT_PUBLIC_LEGACY_SERVICES_MODE=true`
2. Rename column back: `ALTER TABLE bookings RENAME COLUMN special_requests_legacy TO special_requests;`
3. Set `NEXT_PUBLIC_FF_DAY_SERVICES_READ=false`
4. **User impact: < 5 minutes** (requires one deploy)

### Emergency Kill Switch

```env
NEXT_PUBLIC_LEGACY_SERVICES_MODE=true
```

Forces ALL reads to use the old `special_requests` field. Can be set without code deployment via Vercel environment variable dashboard. Takes effect on next page load (< 30 seconds).

---

## Success Criteria

| Metric | Target |
|---|---|
| Backfill coverage | 100% of JSON `special_requests` rows migrated |
| Post-launch errors | Zero `JSON.parse` errors in production logs |
| Day service render accuracy | 100% match between old and new display (manual QA on 20 bookings) |
| Test suite pass rate | 100% (TC-01 through TC-15) |
| Performance | `booking_day_services` query < 50ms for any single booking |
| Zero data loss | All migrated bookings show identical service data to pre-migration |

---

## Communication Plan

| Audience | When | Message |
|---|---|---|
| Manager + Reserver | Week 1 start | "We are upgrading how booking services are stored. No action needed. The UI will look identical." |
| All staff | Week 4 (read switch day) | "The system has been upgraded. If you see any missing meal or guide info, report immediately to [contact]." |
| CEO | Weekly | Migration status report with backfill counts and error logs |
