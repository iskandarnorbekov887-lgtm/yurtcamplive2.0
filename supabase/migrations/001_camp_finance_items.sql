-- ============================================================
-- CAMP FINANCE ITEMS (Line items for grocery receipts)
-- ============================================================
CREATE TABLE IF NOT EXISTS camp_finance_items (
  id SERIAL PRIMARY KEY,
  finance_id INTEGER NOT NULL REFERENCES camp_finances(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,
  quantity NUMERIC(10,2) DEFAULT 1,
  unit_price NUMERIC(12,2) DEFAULT 0,
  total_price NUMERIC(12,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_camp_finance_items_finance_id ON camp_finance_items(finance_id);

ALTER TABLE camp_finance_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "camp_finance_items_all" ON camp_finance_items FOR ALL USING (true) WITH CHECK (true);

SELECT 'camp_finance_items table created successfully' AS status;
