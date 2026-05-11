-- ============================================
-- KITCHEN PROCUREMENT & INVENTORY SYSTEM
-- ============================================

-- ============================================
-- 1. PRODUCT CATALOG
-- ============================================
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  unit TEXT NOT NULL CHECK (unit IN ('kg', 'unit', 'liter')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- 2. CURRENT INVENTORY
-- ============================================
CREATE TABLE IF NOT EXISTS inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  current_stock DECIMAL(10, 2) DEFAULT 0,
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(product_id)
);

-- ============================================
-- 3. PROCUREMENT REQUESTS (Phase 1-2)
-- ============================================
CREATE TABLE IF NOT EXISTS procurement_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  status TEXT DEFAULT 'Pending' CHECK (status IN ('Pending', 'Waiting', 'In Review', 'Finalized', 'Cancelled')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  sent_to_manager_at TIMESTAMP WITH TIME ZONE,
  finalized_at TIMESTAMP WITH TIME ZONE
);

-- ============================================
-- 4. PROCUREMENT REQUEST ITEMS
-- ============================================
CREATE TABLE IF NOT EXISTS procurement_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  procurement_id UUID NOT NULL REFERENCES procurement_requests(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  requested_qty DECIMAL(10, 2) NOT NULL,
  unit TEXT NOT NULL CHECK (unit IN ('kg', 'unit', 'liter')),
  -- Manager's adjustments
  actual_received_qty DECIMAL(10, 2),
  unit_price DECIMAL(10, 2),
  total_price DECIMAL(10, 2),
  -- Cook's verification
  cook_verified_qty DECIMAL(10, 2),
  discrepancy_noted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- 5. HANDSHAKE LOG (Phase 3)
-- ============================================
CREATE TABLE IF NOT EXISTS procurement_handshakes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  procurement_id UUID NOT NULL REFERENCES procurement_requests(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES procurement_items(id) ON DELETE CASCADE,
  manager_id UUID REFERENCES auth.users(id),
  cook_id UUID REFERENCES auth.users(id),
  manager_status TEXT CHECK (manager_status IN ('Ready for Review', 'Pending Manager')),
  cook_status TEXT CHECK (cook_status IN ('Accepted', 'Discrepancy', 'Pending Cook')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- 6. INVENTORY LOG (Phase 3 & 4)
-- ============================================
CREATE TABLE IF NOT EXISTS inventory_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id),
  quantity_change DECIMAL(10, 2) NOT NULL,
  log_type TEXT NOT NULL CHECK (log_type IN ('Procurement', 'Usage')),
  procurement_id UUID REFERENCES procurement_requests(id),
  usage_id UUID REFERENCES kitchen_usage(id),
  previous_stock DECIMAL(10, 2),
  new_stock DECIMAL(10, 2),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- 7. DAILY USAGE (Phase 4)
-- ============================================
CREATE TABLE IF NOT EXISTS kitchen_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id),
  quantity_used DECIMAL(10, 2) NOT NULL,
  unit TEXT NOT NULL CHECK (unit IN ('kg', 'unit', 'liter')),
  recorded_by UUID NOT NULL REFERENCES auth.users(id),
  usage_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================
CREATE INDEX idx_inventory_product ON inventory(product_id);
CREATE INDEX idx_procurement_requests_created_by ON procurement_requests(created_by);
CREATE INDEX idx_procurement_requests_status ON procurement_requests(status);
CREATE INDEX idx_procurement_items_procurement ON procurement_items(procurement_id);
CREATE INDEX idx_procurement_items_product ON procurement_items(product_id);
CREATE INDEX idx_handshakes_procurement ON procurement_handshakes(procurement_id);
CREATE INDEX idx_kitchen_usage_product ON kitchen_usage(product_id);
CREATE INDEX idx_kitchen_usage_date ON kitchen_usage(usage_date);
CREATE INDEX idx_inventory_logs_product ON inventory_logs(product_id);

-- ============================================
-- VIEWS FOR EASY QUERYING
-- ============================================

-- View: Full Procurement Request with Items
CREATE OR REPLACE VIEW v_procurement_full AS
SELECT
  pr.id,
  pr.created_by,
  pr.status,
  pr.created_at,
  pr.sent_to_manager_at,
  pr.finalized_at,
  COUNT(pi.id) as item_count,
  COALESCE(SUM(pi.total_price), 0) as total_cost
FROM procurement_requests pr
LEFT JOIN procurement_items pi ON pr.id = pi.procurement_id
GROUP BY pr.id, pr.created_by, pr.status, pr.created_at, pr.sent_to_manager_at, pr.finalized_at;

-- View: Current Stock with Product Info
CREATE OR REPLACE VIEW v_inventory_current AS
SELECT
  i.id,
  p.id as product_id,
  p.name,
  p.unit,
  i.current_stock,
  i.last_updated
FROM inventory i
JOIN products p ON i.product_id = p.id
ORDER BY p.name;

-- View: Procurement Items with Product Details
CREATE OR REPLACE VIEW v_procurement_items_details AS
SELECT
  pi.id,
  pi.procurement_id,
  pi.product_id,
  p.name as product_name,
  p.unit,
  pi.requested_qty,
  pi.actual_received_qty,
  pi.unit_price,
  pi.total_price,
  pi.cook_verified_qty,
  pi.discrepancy_noted,
  pi.created_at,
  pi.updated_at
FROM procurement_items pi
JOIN products p ON pi.product_id = p.id;

-- ============================================
-- SAMPLE DATA (optional, for testing)
-- ============================================
-- Insert sample products
INSERT INTO products (name, unit) VALUES
  ('Granny Smith Apple', 'kg'),
  ('Carrots', 'kg'),
  ('Olive Oil', 'liter'),
  ('Chicken Breast', 'kg'),
  ('Rice', 'kg'),
  ('Eggs', 'unit'),
  ('Milk', 'liter'),
  ('Salt', 'kg')
ON CONFLICT (name) DO NOTHING;

-- Initialize inventory for each product
INSERT INTO inventory (product_id, current_stock)
SELECT id, 0 FROM products
ON CONFLICT (product_id) DO NOTHING;
