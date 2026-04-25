# C — Risk Register & Remediation Plan
**Author role:** Risk Consultant for Software Deployments  
**Date:** April 25, 2026  
**Scope:** Data integrity, security, scalability — Isky Yurt Camp Internal Ops App

---

## Risk Register

### RISK-01: Dual-Format `special_requests` Column

| Attribute | Detail |
|---|---|
| **Description** | The `special_requests` TEXT column stores either plain text OR a JSON array of day-by-day services. There is no enforced format, schema, or validator. |
| **Likelihood** | **Certain** — it already exists in production data |
| **Impact** | **High** — data loss on reads (wrong parser chosen), incorrect meal/service data shown to Cook/Manager, silent failures on `JSON.parse()` |
| **Detection** | Manual audit of `special_requests` column content; look for rows starting with `[` vs rows with plain text |
| **Current State** | The calendar tries `JSON.parse()` and falls back to rendering raw JSON string as guest notes |
| **Owner** | Backend Developer + Reserver Portal Lead |

**Mitigation Steps:**
1. Immediately add a `CHECK` constraint or application-level validator to categorize all new writes.
2. Run the backfill migration script (Doc B) to extract JSON into `booking_day_services`.
3. Rename `special_requests` → `special_requests_legacy` after validation.
4. Drop after 60 days.

**30/60/90-Day Plan:**
- **30 days:** Backfill migration complete. Dual-write active (old + new tables).
- **60 days:** Application reads from new tables exclusively. Old column renamed to `_legacy`.
- **90 days:** Column dropped. All code references removed. Unit tests confirm zero reads from legacy field.

---

### RISK-02: Polling Every 5 Seconds vs. Real-Time Subscriptions

| Attribute | Detail |
|---|---|
| **Description** | Every page runs `setInterval(fetchData, 5000)`. With 5 active users each polling 12 times/minute = 60 full DB reads/minute regardless of activity. |
| **Likelihood** | **Certain** — active in production now |
| **Impact** | **Medium** — unnecessary database load, Supabase free tier row read limits consumed rapidly, max 5-second staleness (booking created by Reserver, Manager won't see for up to 5s). With 10 concurrent users = 120 reads/minute. |
| **Detection** | Supabase dashboard → Database → Connections & Query Stats. Monitor `SELECT *` on `bookings` table frequency. |
| **Owner** | Full-stack Developer |

**Mitigation Steps:**
1. Replace `setInterval` with Supabase Realtime `channel` subscriptions per affected table.
2. Keep polling as fallback only (e.g., on WebSocket disconnect).

```typescript
// Proposed replacement pattern
const channel = supabase
  .channel('bookings-changes')
  .on('postgres_changes',
    { event: '*', schema: 'public', table: 'bookings' },
    () => fetchData()
  )
  .subscribe();
return () => supabase.removeChannel(channel);
```

**30/60/90-Day Plan:**
- **30 days:** Implement real-time subscriptions on `/bookings` and `/manager` pages as pilot.
- **60 days:** Roll out to all pages. Remove `setInterval` from all pages except as 60-second heartbeat fallback.
- **90 days:** Monitor Supabase query volume — target 90% reduction in polling reads.

---

### RISK-03: Double Financial Entry on Checkout

| Attribute | Detail |
|---|---|
| **Description** | The checkout handler inserts a row into `camp_finances` then updates `status = 'completed'`. These are two separate `await` calls with no transaction and no idempotency check. If checkout is clicked twice, two finance records are created. If the network request drops after insert but before the status update, the booking stays `checked_in` but a finance record exists. |
| **Likelihood** | **High** — any double-tap, network retry, or component re-render can trigger this |
| **Impact** | **High** — inflated revenue figures, incorrect financial reporting, requires manual cleanup |
| **Detection** | Query: `SELECT booking_id, COUNT(*) FROM camp_finances WHERE type='income' AND category='Booking' GROUP BY booking_id HAVING COUNT(*) > 1` |
| **Owner** | Backend Developer + Manager Portal Lead |

**Mitigation Steps (in priority order):**

1. **Immediate (frontend):** Disable the checkout button immediately on first click. Set `loadingAction = 'checkout'` before the first `await`. Re-enable only on error. ✅ Partial mitigation.

2. **Short-term (database):** Add `booking_id` FK + unique constraint (see Doc B):
```sql
ALTER TABLE camp_finances ADD COLUMN booking_id BIGINT REFERENCES bookings(id);
ALTER TABLE camp_finances ADD CONSTRAINT uq_booking_finance UNIQUE (booking_id, type, category);
```

3. **Recommended (atomic operation):** Wrap both operations in a Supabase Edge Function (Postgres transaction):
```sql
BEGIN;
  INSERT INTO camp_finances (...) VALUES (...);
  UPDATE bookings SET status = 'completed' WHERE id = $1 AND status = 'checked_in';
  -- If UPDATE affects 0 rows (already completed), ROLLBACK
COMMIT;
```

**30/60/90-Day Plan:**
- **30 days:** Add `booking_id` column and unique constraint. Backfill existing checkout records.
- **60 days:** Create Supabase Edge Function for atomic checkout operation.
- **90 days:** Remove inline checkout logic from frontend pages. All checkouts go through the Edge Function.

**Existing Data Cleanup:**
```sql
-- Find duplicates
SELECT booking_id, COUNT(*), array_agg(id) AS finance_ids
FROM camp_finances
WHERE type = 'income' AND category = 'Booking' AND booking_id IS NOT NULL
GROUP BY booking_id
HAVING COUNT(*) > 1;
-- Manually review and delete the duplicate rows (keep earliest id)
```

---

### RISK-04: Non-Functional Cook Grocery Feature

| Attribute | Detail |
|---|---|
| **Description** | The "Send to Manager" button in the Cook portal runs `console.log()` only. It shows a success toast but saves nothing to the database. |
| **Likelihood** | **Certain** — this is the current production behavior |
| **Impact** | **Medium** — Cooks believe their grocery requests are being sent. Managers never receive them. Purchases may be missed. Operational failure for camp supply chain. |
| **Detection** | Open Cook portal → Grocery tab → type items → click "Send to Manager" → check Supabase for any new rows → find nothing. |
| **Owner** | Product Owner + Backend Developer |

**Mitigation Steps:**
1. **Immediate:** Replace success toast with a clear "Not yet implemented — contact manager directly" message. Do not show false success.
2. **Short-term:** Implement `grocery_requests` table and basic CRUD (see Doc G for full spec).
3. **Medium-term:** Add Manager notification when a grocery request is submitted.

**30/60/90-Day Plan:**
- **30 days:** Remove fake success toast. Show placeholder with phone/chat alternative.
- **60 days:** Implement `grocery_requests` table + Cook create + Manager read/acknowledge flow.
- **90 days:** Manager can mark items as purchased. Cook sees status updates.

---

### RISK-05: Single-Manager Assumption in Delete Approval

| Attribute | Detail |
|---|---|
| **Description** | The delete approval notification targets the manager with `.eq('role', 'Manager').single()`. If there are 2+ Manager accounts, Supabase throws an error. |
| **Likelihood** | **Medium** — likely only one Manager currently, but will break on growth |
| **Impact** | **High** — entire delete approval workflow crashes silently |
| **Detection** | Add a second Manager account. Trigger a delete request. Observe console error. |
| **Owner** | Backend Developer |

**Mitigation:**
```typescript
// Replace .single() with .limit(1) OR broadcast to all managers
const { data: managers } = await supabase
  .from('profiles')
  .select('id')
  .eq('role', 'Manager');

// Insert notification for each manager
for (const manager of managers ?? []) {
  await supabase.from('notifications').insert({
    user_id: manager.id,
    type: 'delete_approved',
    ...
  });
}
```

**30-day fix.** One-line change, low risk.

---

### RISK-06: UTC Date Timezone Bug

| Attribute | Detail |
|---|---|
| **Description** | Multiple pages use `new Date().toISOString().split('T')[0]` to get "today". At midnight UTC (05:00 UTC+5), this returns yesterday's date. |
| **Likelihood** | **High** — happens every night at midnight local time |
| **Impact** | **Medium** — neglected check-in alerts fire a day early, auto-checkout may trigger wrong day, meal counts show wrong day's bookings |
| **Detection** | Test at midnight local time |
| **Owner** | Frontend Developer |

**Mitigation:** Centralize all date strings through the existing `localDateStr()` helper. Grep for all `toISOString().split('T')[0]` usages and replace.

```bash
grep -r "toISOString().split('T')" src/
```
Found in: `cook/page.tsx`, `manager/page.tsx`, `checkin/page.tsx`, `ceo/page.tsx`

**7-day fix.** 4 files, simple search-and-replace.

---

### RISK-07: No Error Handling on Most Mutation Operations

| Attribute | Detail |
|---|---|
| **Description** | Most `await supabase.from(...).update(...)` calls discard errors. Example: `cancelBooking` has no `try/catch`. |
| **Likelihood** | **High** — any network drop silently fails |
| **Impact** | **Medium** — staff thinks action succeeded, data unchanged |
| **Detection** | Disconnect network mid-operation. Observe UI shows no error. |
| **Owner** | Full-stack Developer |

**Mitigation:** Wrap all mutations in try/catch with user-facing error toasts.

---

## Risk Priority Matrix

| Risk | Likelihood | Impact | Priority | Effort to Fix |
|---|---|---|---|---|
| RISK-03: Double financial entry | High | High | 🔴 P0 | Medium |
| RISK-01: Dual-format special_requests | Certain | High | 🔴 P0 | High |
| RISK-06: UTC timezone bug | High | Medium | 🟠 P1 | Low |
| RISK-04: Fake grocery feature | Certain | Medium | 🟠 P1 | Medium |
| RISK-07: No error handling | High | Medium | 🟠 P1 | Medium |
| RISK-05: Single-manager assumption | Medium | High | 🟠 P1 | Low |
| RISK-02: Polling vs real-time | Certain | Medium | 🟡 P2 | High |

---

## 30/60/90 Day Consolidated Remediation Plan

### 30 Days
- [ ] Fix UTC date bug in all 4 files (RISK-06)
- [ ] Fix single-manager notification bug (RISK-05)
- [ ] Disable checkout button on first click to prevent double-tap (RISK-03, partial)
- [ ] Add `booking_id` FK + unique constraint to `camp_finances` (RISK-03)
- [ ] Replace Cook grocery fake success with honest placeholder (RISK-04)
- [ ] Begin `booking_day_services` backfill (RISK-01)

### 60 Days
- [ ] Dual-write complete; application reads from `booking_day_services` exclusively (RISK-01)
- [ ] Grocery backend implemented (RISK-04)
- [ ] Atomic checkout Edge Function deployed (RISK-03)
- [ ] Error handling added to all mutation operations (RISK-07)
- [ ] Real-time subscriptions on Reserver and Manager portals (RISK-02, pilot)

### 90 Days
- [ ] `special_requests_legacy` column dropped (RISK-01)
- [ ] All pages migrated to real-time subscriptions (RISK-02)
- [ ] Full regression test suite passing (all risks)
- [ ] Manager notification sent to all managers, not just first (RISK-05)
