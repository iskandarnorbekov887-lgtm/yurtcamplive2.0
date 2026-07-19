-- Phase 2: Bulletproof Kitchen Logic & Inventory Ledger

-- 1. Extend Inventory for Unit Intelligence
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS buy_unit TEXT;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS conversion_factor FLOAT DEFAULT 1.0;
-- Rename unit_type to use_unit if not already done, or just use it as use_unit
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='inventory_items' AND column_name='unit_type') THEN
    ALTER TABLE inventory_items RENAME COLUMN unit_type TO use_unit;
  END IF;
END $$;

-- 2. Create Inventory Ledger for Audit Trail
DO $$ BEGIN
  CREATE TYPE ledger_type AS ENUM ('IN', 'OUT', 'WASTE', 'ADJUSTMENT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS inventory_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id UUID REFERENCES inventory_items(id),
    type ledger_type NOT NULL,
    qty FLOAT NOT NULL, -- The delta in USE_UNIT
    unit TEXT NOT NULL, -- The unit at time of transaction
    reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);

-- 3. Add Discrepancy Reason to Procurement Items
ALTER TABLE procurement_items ADD COLUMN IF NOT EXISTS reason_code TEXT;
ALTER TABLE procurement_items ADD COLUMN IF NOT EXISTS cook_comment TEXT;

-- 4. Atomic Handshake RPC
CREATE OR REPLACE FUNCTION finalize_procurement_request(p_request_id UUID, p_user_id UUID)
RETURNS VOID AS $$
DECLARE
    item_record RECORD;
    v_status procurement_status;
BEGIN
    -- Check current status to prevent double finalization
    SELECT status INTO v_status FROM procurement_requests WHERE id = p_request_id;
    
    IF v_status != 'reviewed' THEN
        RAISE EXCEPTION 'Request must be in reviewed status to finalize. Current status: %', v_status;
    END IF;

    -- Update request status
    UPDATE procurement_requests 
    SET status = 'finalized', 
        updated_at = NOW() 
    WHERE id = p_request_id;

    -- Process each item
    FOR item_record IN 
        SELECT pi.*, i.conversion_factor, i.use_unit 
        FROM procurement_items pi
        JOIN inventory_items i ON pi.item_id = i.id
        WHERE pi.request_id = p_request_id
    LOOP
        -- Calculate stock increment (Manager enters in Buy_Unit, we store in Use_Unit)
        -- qty_to_add = actual_received_qty * conversion_factor
        UPDATE inventory_items 
        SET current_stock = current_stock + (item_record.actual_received_qty * item_record.conversion_factor),
            updated_at = NOW()
        WHERE id = item_record.item_id;

        -- Log to Ledger (Audit Trail)
        INSERT INTO inventory_ledger (item_id, type, qty, unit, reason, created_by)
        VALUES (
            item_record.item_id, 
            'IN', 
            (item_record.actual_received_qty * item_record.conversion_factor), 
            item_record.use_unit,
            'Procurement Finalization: ' || p_request_id,
            p_user_id
        );

        -- Log to Usage Logs (for historical consistency)
        INSERT INTO usage_logs (item_id, amount_used, source)
        VALUES (item_record.item_id, (item_record.actual_received_qty * item_record.conversion_factor), 'Procurement Inbound');
    END LOOP;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
