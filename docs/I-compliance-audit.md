# I — Compliance & Audit Trail Checklist
**Author role:** Compliance Analyst  
**Date:** April 25, 2026  
**Scope:** Data access, write permissions, audit logging, privacy — Isky Yurt Camp Internal Ops App

---

## Data Access Matrix

### `bookings` Table

| Operation | CEO | Manager | Reserver | Cook |
|---|---|---|---|---|
| SELECT all bookings | ✅ | ✅ | ✅ | ✅ |
| INSERT new booking | ✅ | ✅ | ✅ | ❌ |
| UPDATE status (cancel) | ✅ | ✅ | ✅ | ❌ |
| UPDATE status (check-in) | ✅ | ✅ | ❌ | ❌ |
| UPDATE status (check-out) | ✅ | ✅ | ❌ | ❌ |
| UPDATE other fields (edit) | ✅ | ✅ | ✅ | ❌ (cook-specific fields only via panel) |
| DELETE | ❌ (not implemented) | ❌ | ❌ | ❌ |

**Note:** Cook can update service fields (meals, guide notes) on `checked_in` bookings through the Cook-specific panel in `OccupancyCalendar`. This is enforced via UI only, not via database RLS policy. **A Cook with direct DB access could update any booking field.** This is a gap.

---

### `camp_finances` Table

| Operation | CEO | Manager | Reserver | Cook |
|---|---|---|---|---|
| SELECT all records | ✅ | ✅ | ❌ | ❌ |
| INSERT (checkout auto-record) | ✅ | ✅ | ❌ | ❌ |
| UPDATE | ✅ | ✅ | ❌ | ❌ |
| DELETE directly | ❌ | ❌ (must request via notification) | ❌ | ❌ |
| DELETE via CEO approval | ✅ (CEO approves) | 🔶 (Manager requests) | ❌ | ❌ |

**Delete workflow:** Manager sends a `delete_request` notification to CEO. CEO approves → record moved to `deleted_records` then deleted from `camp_finances`. CEO denies → record stays. **This is a good audit pattern.**

---

### `profiles` Table

| Operation | CEO | Manager | Reserver | Cook |
|---|---|---|---|---|
| SELECT all staff | ✅ | ❌ (not used in Manager portal) | ❌ | ❌ |
| INSERT new staff | ❌ (done via Supabase Auth dashboard) | ❌ | ❌ | ❌ |
| UPDATE roles | ❌ (no UI) | ❌ | ❌ | ❌ |
| DELETE staff | ❌ (no UI) | ❌ | ❌ | ❌ |

**Gap:** Role assignment is done entirely through the Supabase dashboard. There is no in-app role management. A compromised Supabase dashboard account could elevate any user to CEO without any audit trail.

---

### `notifications` Table

| Operation | All Roles |
|---|---|
| SELECT own notifications | ✅ (filtered by `user_id`) |
| INSERT (system-generated) | Via application logic only |
| UPDATE (mark read, update status) | ✅ Own notifications only |
| DELETE | ❌ Not implemented |

---

### `yurts` Table

| Operation | CEO | Manager | Reserver | Cook |
|---|---|---|---|---|
| SELECT | ✅ | ✅ | ✅ | ✅ |
| UPDATE status (Clean/Dirty/Maintenance) | ✅ | ✅ | ❌ | ❌ |

---

## Current Audit Trail Fields

The `bookings` table has the following change-tracking fields:

| Field | Set When | Gap |
|---|---|---|
| `created_at` | On INSERT | ✅ Good |
| `created_by_id` | On INSERT | ✅ Good |
| `created_by_role` | On INSERT | ✅ Good |
| `last_edited_at` | On any UPDATE | ✅ Good |
| `last_edited_by_id` | On any UPDATE | ✅ Good |
| `last_edited_by_role` | On some UPDATEs (CEO page only) | ⚠️ Inconsistent |
| `approved_by_manager` | On approval | ✅ Good |

**Gap:** There is no history/changelog. If a booking is edited 3 times, only the most recent edit is traceable. All previous states are lost.

**Gap:** `camp_finances` has `created_by` (role string) but no `created_by_id` (user UUID). Cannot identify which specific manager created a finance record.

---

## Recommended Audit Log Events

The following events should be written to an `audit_log` table:

```sql
CREATE TABLE audit_log (
  id          BIGSERIAL PRIMARY KEY,
  event_type  TEXT NOT NULL,   -- 'booking.created', 'booking.checkin', etc.
  table_name  TEXT NOT NULL,
  record_id   BIGINT,
  user_id     UUID REFERENCES auth.users(id),
  user_role   TEXT,
  old_data    JSONB,           -- snapshot before change
  new_data    JSONB,           -- snapshot after change
  ip_address  INET,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Event Types to Log

| Event | Trigger | Data to Capture |
|---|---|---|
| `booking.created` | Booking form submit | Full booking row |
| `booking.checkin` | Check-in button confirmed | `{booking_id, guest_name, check_in, operator_id}` |
| `booking.checkout` | Check-out confirmed | `{booking_id, guest_name, check_out, operator_id}` |
| `booking.cancelled` | Cancel confirmed | `{booking_id, guest_name, cancelled_by_id, reason (if any)}` |
| `booking.edited` | Save in edit mode | `{old: {...}, new: {...}, fields_changed: []}` |
| `booking.no_arrival` | No Arrival button | `{booking_id, guest_name, marked_by_id}` |
| `finance.created` | Auto on checkout | `{finance_id, booking_id, amount, currency}` |
| `finance.delete_requested` | Manager submits delete | `{finance_id, requested_by_id, reason}` |
| `finance.deleted` | CEO approves delete | `{finance_id, original_data, approved_by_id}` |
| `auth.login` | User signs in | `{user_id, role, ip_address}` |
| `auth.logout` | User signs out | `{user_id}` |

### Implementation (Supabase Trigger)

```sql
-- Automatic trigger on bookings table
CREATE OR REPLACE FUNCTION log_booking_changes()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_log (event_type, table_name, record_id, old_data, new_data)
  VALUES (
    CASE TG_OP
      WHEN 'INSERT' THEN 'booking.created'
      WHEN 'UPDATE' THEN 'booking.edited'
      WHEN 'DELETE' THEN 'booking.deleted'
    END,
    'bookings',
    COALESCE(NEW.id, OLD.id),
    CASE WHEN TG_OP != 'INSERT' THEN row_to_json(OLD)::JSONB END,
    CASE WHEN TG_OP != 'DELETE' THEN row_to_json(NEW)::JSONB END
  );
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_booking_audit
AFTER INSERT OR UPDATE OR DELETE ON bookings
FOR EACH ROW EXECUTE FUNCTION log_booking_changes();
```

---

## Privacy Considerations

### Data Stored

| Data Type | Where Stored | Sensitivity |
|---|---|---|
| Guest full names | `bookings.guest_name` | Medium — names of paying guests |
| Guest count | `bookings.guest_count` | Low |
| Dietary restrictions | `booking_day_services.lunch_dietary`, `.dinner_dietary` | Medium — health data |
| Payment amounts | `bookings.amount`, `camp_finances.original_amount` | High — financial |
| Payment method | `bookings.payment_method` | Medium |
| Staff names/emails | `profiles.full_name`, `profiles.email` | Medium |
| Staff user IDs | `bookings.created_by_id`, `last_edited_by_id` | Low |

### Data Retention

| Table | Recommended Retention |
|---|---|
| `bookings` | Indefinite (operational history) |
| `camp_finances` | 7 years (Uzbekistan tax law requirement) |
| `deleted_records` | 7 years |
| `audit_log` | 2 years (then archive) |
| `notifications` | 90 days |
| `grocery_requests` | 1 year |

### Privacy Gaps

1. **No guest consent mechanism** — Guest names and dietary info are collected without any explicit data processing notice. If the camp operates under GDPR (EU guests), this is a compliance gap.
2. **Dietary restrictions are health data** — Under GDPR Article 9, this is "special category" data requiring explicit consent.
3. **No data deletion flow for guests** — If a guest requests their data be erased, there is no UI or process to find and delete all their booking records.
4. **No encryption at rest beyond Supabase defaults** — Supabase encrypts at rest by default (AES-256). No additional application-layer encryption applied to financial or dietary data.
5. **Staff emails visible to CEO** — Acceptable for an internal system.

### Recommended Additions

- Add a "Guest consented to data storage" checkbox on booking form.
- Add a staff-only "GDPR erasure request" workflow: find all records with matching guest name, anonymize (replace with "REDACTED") rather than delete.
- Add a privacy notice footer to the login page.
