-- ============================================================
-- SINGLE SOURCE OF TRUTH — Item Request / Link System
-- Run this in your Supabase SQL Editor.
-- ============================================================

-- 1. PENDING ITEM REQUESTS TABLE
-- Cooks cannot create items directly — they request them here.
-- Managers review and approve/reject from their dashboard.
CREATE TABLE IF NOT EXISTS pending_item_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_name TEXT NOT NULL,
  requested_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  approved_item_id UUID REFERENCES inventory_items(id) ON DELETE SET NULL,
  reviewer_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_pending_item_requests_status
  ON pending_item_requests(status);
CREATE INDEX IF NOT EXISTS idx_pending_item_requests_requested_by
  ON pending_item_requests(requested_by);

-- RLS
ALTER TABLE pending_item_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pending_item_requests_all" ON pending_item_requests;
CREATE POLICY "pending_item_requests_all"
  ON pending_item_requests FOR ALL
  TO anon, authenticated
  USING (true) WITH CHECK (true);

-- Realtime
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND tablename = 'pending_item_requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE pending_item_requests;
  END IF;
END $$;

-- 2. request_or_link_item RPC FUNCTION
-- Called when a cook submits an item name.
-- If it exists in inventory_items → returns 'linked' + the item.
-- If it doesn't exist → inserts a pending request → returns 'requested'.
CREATE OR REPLACE FUNCTION request_or_link_item(
  p_item_name TEXT,
  p_requested_by UUID
) RETURNS JSONB AS $$
DECLARE
  v_item inventory_items%ROWTYPE;
  v_request_id UUID;
  v_clean_name TEXT;
BEGIN
  v_clean_name := trim(p_item_name);

  -- Guard: empty name
  IF v_clean_name = '' OR v_clean_name IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'message', 'Item name cannot be empty'
    );
  END IF;

  -- Try to find existing inventory item (case-insensitive)
  SELECT * INTO v_item
  FROM inventory_items
  WHERE lower(item_name) = lower(v_clean_name)
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'status', 'linked',
      'item_id', v_item.id,
      'item_name', v_item.item_name,
      'use_unit', v_item.use_unit
    );
  ELSE
    -- Check if there's already a pending request for this name
    SELECT id INTO v_request_id
    FROM pending_item_requests
    WHERE lower(requested_name) = lower(v_clean_name)
      AND status = 'pending'
    LIMIT 1;

    IF v_request_id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'status', 'already_requested',
        'request_id', v_request_id,
        'message', 'This item has already been requested and is awaiting Manager approval'
      );
    END IF;

    -- Create new pending request
    INSERT INTO pending_item_requests (requested_name, requested_by)
    VALUES (v_clean_name, p_requested_by)
    RETURNING id INTO v_request_id;

    RETURN jsonb_build_object(
      'status', 'requested',
      'request_id', v_request_id,
      'message', 'Item request sent to Manager for approval'
    );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grants
GRANT EXECUTE ON FUNCTION request_or_link_item(TEXT, UUID) TO anon, authenticated;

-- Reload schema cache
NOTIFY pgrst, 'reload schema';

SELECT 'request_or_link_item migration complete' AS status;
