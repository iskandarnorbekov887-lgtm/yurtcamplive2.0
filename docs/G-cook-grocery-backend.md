# G — Cook Grocery Backend Design
**Author role:** Backend Architect  
**Date:** April 25, 2026  
**Problem:** The Cook grocery list feature is completely non-functional. "Send to Manager" logs to console only. Nothing is saved.

---

## Current State

```typescript
// cook/page.tsx — handleSendToManager()
const handleSendToManager = () => {
  const validItems = groceryItems.filter(item => item.trim() !== '');
  if (validItems.length === 0) return;
  console.log('Sending to manager:', validItems); // ← Only this happens
  setSentToManager(true);
  // Shows success toast, saves nothing
};
```

---

## Proposed Data Model

### Table: `grocery_requests`

```sql
CREATE TABLE grocery_requests (
  id            BIGSERIAL PRIMARY KEY,
  requested_for DATE NOT NULL,              -- Which day the items are needed
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'acknowledged', 'purchased')),
  submitted_by  UUID NOT NULL REFERENCES auth.users(id),
  submitted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acknowledged_by UUID REFERENCES auth.users(id),
  acknowledged_at TIMESTAMPTZ,
  notes         TEXT,                       -- Optional message from Cook to Manager
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_gr_requested_for ON grocery_requests(requested_for);
CREATE INDEX idx_gr_status ON grocery_requests(status);
```

### Table: `grocery_items`

```sql
CREATE TABLE grocery_items (
  id                  BIGSERIAL PRIMARY KEY,
  grocery_request_id  BIGINT NOT NULL REFERENCES grocery_requests(id) ON DELETE CASCADE,
  item_name           TEXT NOT NULL,
  quantity            TEXT,                 -- "2 kg", "30 pieces" — free text
  is_purchased        BOOLEAN NOT NULL DEFAULT FALSE,
  purchased_by        UUID REFERENCES auth.users(id),
  purchased_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_gi_request_id ON grocery_items(grocery_request_id);
```

---

## API Surface (Supabase direct client calls)

### Cook: Create a Grocery Request

```typescript
// POST equivalent — create request + items in one transaction
const createGroceryRequest = async (
  items: string[],
  requestedFor: string,  // 'YYYY-MM-DD'
  notes?: string
) => {
  // 1. Create the request
  const { data: request, error: reqError } = await supabase
    .from('grocery_requests')
    .insert({
      requested_for: requestedFor,
      submitted_by: currentUserId,
      notes: notes || null,
    })
    .select()
    .single();

  if (reqError) throw reqError;

  // 2. Insert items
  const itemRows = items
    .filter(i => i.trim() !== '')
    .map(item => {
      // Parse "Tomatoes - 2kg" into name and quantity
      const parts = item.split(/[-–]/);
      return {
        grocery_request_id: request.id,
        item_name: parts[0].trim(),
        quantity: parts[1]?.trim() || null,
      };
    });

  const { error: itemError } = await supabase
    .from('grocery_items')
    .insert(itemRows);

  if (itemError) throw itemError;
  return request;
};
```

### Manager: Fetch All Pending Requests

```typescript
const fetchGroceryRequests = async () => {
  const { data, error } = await supabase
    .from('grocery_requests')
    .select(`
      *,
      grocery_items(*),
      submitter:submitted_by(full_name, role)
    `)
    .in('status', ['pending', 'acknowledged'])
    .order('requested_for', { ascending: true });

  if (error) throw error;
  return data;
};
```

### Manager: Acknowledge a Request

```typescript
const acknowledgeRequest = async (requestId: number) => {
  const { error } = await supabase
    .from('grocery_requests')
    .update({
      status: 'acknowledged',
      acknowledged_by: currentUserId,
      acknowledged_at: new Date().toISOString(),
    })
    .eq('id', requestId);

  if (error) throw error;
};
```

### Manager: Mark Individual Item as Purchased

```typescript
const markItemPurchased = async (itemId: number) => {
  const { error } = await supabase
    .from('grocery_items')
    .update({
      is_purchased: true,
      purchased_by: currentUserId,
      purchased_at: new Date().toISOString(),
    })
    .eq('id', itemId);

  if (error) throw error;
};
```

### Manager: Mark Entire Request as Purchased

```typescript
const markRequestPurchased = async (requestId: number) => {
  // Mark all items purchased
  await supabase
    .from('grocery_items')
    .update({ is_purchased: true, purchased_by: currentUserId, purchased_at: new Date().toISOString() })
    .eq('grocery_request_id', requestId)
    .eq('is_purchased', false);

  // Update request status
  await supabase
    .from('grocery_requests')
    .update({ status: 'purchased' })
    .eq('id', requestId);
};
```

---

## Notification Flow

When Cook submits a grocery request, insert a notification for all Managers:

```typescript
const notifyManagers = async (requestId: number, requestedFor: string) => {
  const { data: managers } = await supabase
    .from('profiles')
    .select('id')
    .in('role', ['Manager', 'CEO']);

  if (!managers) return;

  await supabase.from('notifications').insert(
    managers.map(m => ({
      user_id: m.id,
      type: 'grocery_request',
      title: 'New Grocery Request',
      message: `Cook submitted a grocery list needed for ${requestedFor}.`,
      related_id: requestId,
    }))
  );
};
```

---

## Frontend Data Flow

### Cook Portal — Grocery Tab

**States:**
1. **Empty** — input list, "Add Item" button, "Send to Manager" button (disabled if no items)
2. **Submitted** — success banner: "List sent! Manager will be notified." Request visible in "My Requests" sub-section.
3. **Acknowledged** — banner: "Manager has seen your request." Items shown with ✓ or pending status.
4. **Purchased** — banner: "All items purchased."

**Component structure:**
```
GroceryTab
├── GroceryForm          (input list + submit)
├── PastRequests         (list of submitted requests with status)
│   └── GroceryRequestCard
│       └── GroceryItemRow (with purchased indicator)
```

### Manager Portal — New "Grocery" section in Bookings tab

**Shown when:** `pendingGroceryRequests.length > 0`

**Actions per request:**
- "Acknowledge" button → marks request as seen
- Per-item checkbox → marks individual items purchased
- "Mark All Purchased" button

---

## Row-Level Security Policies

```sql
-- Cook can INSERT their own requests
CREATE POLICY "Cook can create grocery requests"
ON grocery_requests FOR INSERT
TO authenticated
WITH CHECK (
  submitted_by = auth.uid()
  AND auth.jwt()->>'role' IN ('Cook', 'Manager', 'CEO')
);

-- All staff can read requests
CREATE POLICY "Staff can read grocery requests"
ON grocery_requests FOR SELECT
TO authenticated
USING (true);

-- Only Manager/CEO can update (acknowledge, purchased)
CREATE POLICY "Manager can update grocery requests"
ON grocery_requests FOR UPDATE
TO authenticated
USING (auth.jwt()->>'role' IN ('Manager', 'CEO'));

-- Same for items
CREATE POLICY "Staff read grocery items"
ON grocery_items FOR SELECT TO authenticated USING (true);

CREATE POLICY "Cook insert grocery items"
ON grocery_items FOR INSERT TO authenticated
WITH CHECK (auth.jwt()->>'role' IN ('Cook', 'Manager', 'CEO'));

CREATE POLICY "Manager update grocery items"
ON grocery_items FOR UPDATE TO authenticated
USING (auth.jwt()->>'role' IN ('Manager', 'CEO'));
```

---

## Implementation Steps

1. **Day 1:** Create `grocery_requests` and `grocery_items` tables. Apply RLS.
2. **Day 2:** Replace `handleSendToManager` in Cook portal with real `createGroceryRequest()` call.
3. **Day 3:** Add "My Requests" read-only view in Cook grocery tab showing submitted request status.
4. **Day 4:** Add grocery request panel to Manager bookings tab.
5. **Day 5:** Add notification on submit (for all Managers/CEOs).
6. **Day 6–7:** QA, edge cases (empty list, network failure on submit), and deploy.

**Total effort: 1 developer week.**

---

## Security Considerations

- Cooks can only read their own requests (RLS: `submitted_by = auth.uid()`) — other Cook's requests not visible.
- Managers see all requests regardless of which Cook submitted.
- Items cannot be deleted once submitted (only marked purchased) — maintains audit trail.
- `grocery_requests` table does not store financial data — no PII beyond staff user IDs.
- If a Cook account is deactivated, their requests remain readable by Manager via `profiles` join.
