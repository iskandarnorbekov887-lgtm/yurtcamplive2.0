# B — Normalized PostgreSQL Schema & Migration Plan
**Author role:** Database Architect  
**Date:** April 25, 2026

---

## Current State Analysis

### Problems with `bookings` table

| Field | Issue |
|---|---|
| `special_requests TEXT` | Stores plain text OR JSON array of day-by-day services. Two completely different data formats in one column. |
| `num_people INT` | Duplicate of `number_of_people`. Both exist. |
| `guest_count INT` | Third duplicate of the same concept. |
| `guide_required BOOL` | Duplicate of `guide_service BOOL`. |
| `guide_names TEXT` | Comma-separated string — unqueryable, unstructured. |
| `transportation_details TEXT` | Newline-separated composite string — unqueryable. |
| No `booking_id` FK on `camp_finances` | Cannot prevent duplicate checkout inserts. Cannot trace which booking generated which finance record. |

---

## Proposed Normalized Schema

### Table: `booking_day_services`

Replaces the JSON blob in `special_requests`. One row per day per booking.

```sql
CREATE TABLE booking_day_services (
  id                        BIGSERIAL PRIMARY KEY,
  booking_id                BIGINT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  service_date              DATE NOT NULL,

  -- Meals
  lunch                     BOOLEAN NOT NULL DEFAULT FALSE,
  lunch_count               INT NOT NULL DEFAULT 0,
  lunch_dietary             TEXT,

  dinner                    BOOLEAN NOT NULL DEFAULT FALSE,
  dinner_count              INT NOT NULL DEFAULT 0,
  dinner_dietary            TEXT,

  -- Guide
  guide_service             BOOLEAN NOT NULL DEFAULT FALSE,
  guide_count               INT NOT NULL DEFAULT 1,

  -- Cooking Class
  cooking_class             BOOLEAN NOT NULL DEFAULT FALSE,
  cooking_class_description TEXT,

  -- Special Requests for this day
  special_request           TEXT,

  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(booking_id, service_date)
);

CREATE INDEX idx_bds_booking_id ON booking_day_services(booking_id);
CREATE INDEX idx_bds_service_date ON booking_day_services(service_date);
```

---

### Table: `booking_day_guides`

Replaces comma-separated `guide_names`. One row per guide per day.

```sql
CREATE TABLE booking_day_guides (
  id              BIGSERIAL PRIMARY KEY,
  day_service_id  BIGINT NOT NULL REFERENCES booking_day_services(id) ON DELETE CASCADE,
  guide_name      TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

### Table: `booking_day_transport`

Replaces the newline-delimited `transportation_details` string.

```sql
CREATE TABLE booking_day_transport (
  id              BIGSERIAL PRIMARY KEY,
  day_service_id  BIGINT NOT NULL REFERENCES booking_day_services(id) ON DELETE CASCADE,
  driver_name     TEXT,
  pickup_time     TIME,
  from_location   TEXT,
  to_location     TEXT,
  arrival_time    TIME,
  price_amount    NUMERIC(10, 2),
  price_currency  TEXT CHECK (price_currency IN ('UZS', 'USD', 'EUR')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

### Changes to `bookings` Table

```sql
-- Step 1: Add canonical fields
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS guest_count_canonical INT,
  ADD COLUMN IF NOT EXISTS has_guide             BOOLEAN DEFAULT FALSE;

-- Step 2: Backfill canonical fields from duplicates (run BEFORE deprecating)
UPDATE bookings
SET
  guest_count_canonical = COALESCE(guest_count, num_people, number_of_people),
  has_guide             = COALESCE(guide_service, guide_required, FALSE);

-- Step 3: Rename (after application is updated)
ALTER TABLE bookings RENAME COLUMN guest_count_canonical TO guest_count_v2;
-- (Eventually consolidate to one name: guest_count)

-- Step 4: Add booking_id FK to camp_finances
ALTER TABLE camp_finances
  ADD COLUMN IF NOT EXISTS booking_id BIGINT REFERENCES bookings(id) ON DELETE SET NULL;

-- Step 5: Add unique constraint to prevent duplicate checkout inserts
ALTER TABLE camp_finances
  ADD CONSTRAINT uq_camp_finances_booking
  UNIQUE (booking_id, type, category)
  DEFERRABLE INITIALLY DEFERRED;
-- Note: only bookings with a booking_id are covered.
-- Manually-created finance records (booking_id IS NULL) are not constrained.
```

---

### Deprecation of `special_requests`

```sql
-- Rename after migration is validated (do NOT drop immediately)
ALTER TABLE bookings
  RENAME COLUMN special_requests TO special_requests_legacy;

-- After 60 days and validated backfill:
ALTER TABLE bookings
  DROP COLUMN special_requests_legacy;
```

---

## Incremental Migration Plan

### Phase 0 — Preparation (Day 1–3)

1. Take a full database backup.
2. Add new tables (`booking_day_services`, `booking_day_guides`, `booking_day_transport`) — additive only, no schema breakage.
3. Add `booking_id` FK column to `camp_finances`.
4. Deploy application code that **writes** to both old `special_requests` AND new `booking_day_services` simultaneously (dual-write mode).

### Phase 1 — Backfill (Day 4–7)

Run the backfill script below on all existing bookings.

```sql
-- =====================================================
-- BACKFILL SCRIPT: special_requests JSON → booking_day_services
-- =====================================================

DO $$
DECLARE
  rec          RECORD;
  day_json     JSONB;
  day_item     JSONB;
  new_ds_id    BIGINT;
  guide_name   TEXT;
  trans_entry  JSONB;
BEGIN
  FOR rec IN
    SELECT id, check_in, special_requests
    FROM bookings
    WHERE special_requests IS NOT NULL
      AND special_requests != ''
      AND special_requests LIKE '[%'  -- only JSON arrays
  LOOP
    BEGIN
      day_json := rec.special_requests::JSONB;

      FOR day_item IN SELECT * FROM jsonb_array_elements(day_json)
      LOOP
        -- Insert day service record
        INSERT INTO booking_day_services (
          booking_id, service_date, lunch, lunch_count, lunch_dietary,
          dinner, dinner_count, dinner_dietary, guide_service,
          cooking_class, cooking_class_description, special_request
        ) VALUES (
          rec.id,
          (day_item->>'date')::DATE,
          (day_item->>'lunch')::BOOLEAN,
          COALESCE((day_item->>'lunchCount')::INT, 0),
          day_item->>'lunchDietary',
          (day_item->>'dinner')::BOOLEAN,
          COALESCE((day_item->>'dinnerCount')::INT, 0),
          NULL,
          (day_item->>'guideService')::BOOLEAN,
          (day_item->>'cookingClass')::BOOLEAN,
          day_item->>'cookingClassDescription',
          day_item->>'specialRequest'
        )
        ON CONFLICT (booking_id, service_date) DO NOTHING
        RETURNING id INTO new_ds_id;

        -- Insert guide names
        IF new_ds_id IS NOT NULL AND day_item->'guideNames' IS NOT NULL THEN
          FOR guide_name IN
            SELECT jsonb_array_elements_text(day_item->'guideNames')
          LOOP
            IF trim(guide_name) != '' THEN
              INSERT INTO booking_day_guides (day_service_id, guide_name)
              VALUES (new_ds_id, trim(guide_name));
            END IF;
          END LOOP;
        END IF;

        -- Insert transport entries
        IF new_ds_id IS NOT NULL AND day_item->'transEntries' IS NOT NULL THEN
          FOR trans_entry IN
            SELECT jsonb_array_elements(day_item->'transEntries')
          LOOP
            INSERT INTO booking_day_transport (
              day_service_id, driver_name, from_location, to_location,
              price_amount, price_currency
            ) VALUES (
              new_ds_id,
              trans_entry->>'driver',
              trans_entry->>'from',
              trans_entry->>'to',
              NULLIF(trans_entry->>'price', '')::NUMERIC,
              'USD'
            );
          END LOOP;
        END IF;

      END LOOP;

    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Failed to migrate booking id=%: %', rec.id, SQLERRM;
    END;
  END LOOP;
END $$;
```

### Phase 2 — Validation (Day 8–14)

```sql
-- Check migration completeness
SELECT
  b.id,
  b.special_requests,
  COUNT(bds.id) AS migrated_days
FROM bookings b
LEFT JOIN booking_day_services bds ON bds.booking_id = b.id
WHERE b.special_requests LIKE '[%'
GROUP BY b.id, b.special_requests
HAVING COUNT(bds.id) = 0;
-- Should return 0 rows if migration is complete

-- Cross-check financial records
SELECT COUNT(*) FROM camp_finances WHERE booking_id IS NULL AND type = 'income' AND category = 'Booking';
-- These are bookings checked out before migration; manual review needed
```

### Phase 3 — Switch Read Path (Day 15–21)

- Remove dual-write. Application now reads exclusively from `booking_day_services`.
- Rename `special_requests` → `special_requests_legacy`.
- Monitor for any read errors in production logs.

### Phase 4 — Cleanup (Day 60+)

- After 30 days with zero reads from `special_requests_legacy`, drop the column.
- Remove deprecated fields: `num_people`, `guide_required`.

---

## Rollback Plan

### If Phase 0–1 fails (before switch)
- No application change needed. Old schema still active.
- Drop new tables: `DROP TABLE booking_day_transport, booking_day_guides, booking_day_services;`
- Remove `booking_id` column from `camp_finances`.

### If Phase 3 fails (after switch to new read path)
- Deploy previous app version (reads from `special_requests`).
- `special_requests` data is still intact (never deleted).
- Remove `booking_day_services` rows if corrupted (full backup available from Phase 0).

### Emergency kill switch
- Set environment variable `LEGACY_SERVICES_MODE=1`
- Application reads from `special_requests` string parsing when set
- Toggle without deployment

---

## Supabase RLS Policies (New Tables)

```sql
-- booking_day_services: readable by all authenticated staff
CREATE POLICY "Staff can read day services"
ON booking_day_services FOR SELECT
TO authenticated
USING (true);

-- Only Reserver, Manager, CEO can insert/update
CREATE POLICY "Booking staff can write day services"
ON booking_day_services FOR INSERT
TO authenticated
WITH CHECK (
  auth.jwt()->>'role' IN ('Reserver', 'Manager', 'CEO')
);

-- Same for guides and transport
CREATE POLICY "Staff read guides" ON booking_day_guides FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff write guides" ON booking_day_guides FOR INSERT TO authenticated WITH CHECK (auth.jwt()->>'role' IN ('Reserver', 'Manager', 'CEO'));

CREATE POLICY "Staff read transport" ON booking_day_transport FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff write transport" ON booking_day_transport FOR INSERT TO authenticated WITH CHECK (auth.jwt()->>'role' IN ('Reserver', 'Manager', 'CEO'));
```
