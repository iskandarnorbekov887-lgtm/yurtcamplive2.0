// =====================================================
// PROCUREMENT SYSTEM TYPE DEFINITIONS
// =====================================================

export type ProductUnit = 'kg' | 'unit' | 'liter' | 'g' | 'ml' | 'pack';
export type ProcurementStatus = 'draft' | 'waiting' | 'in_review' | 'finalized' | 'rejected';
export type HandshakeStatus = 'pending' | 'cook_verified' | 'discrepancy_flagged' | 'finalized';

// =====================================================
// PRODUCTS
// =====================================================
export interface Product {
  id: string;
  name: string;
  unit: ProductUnit;
  created_at: string;
  updated_at: string;
}

export interface ProductSearchResult extends Product {
  similarity?: number; // For fuzzy search ranking
}

// =====================================================
// INVENTORY
// =====================================================
export interface CurrentInventory {
  id: string;
  product_id: string;
  quantity: number;
  last_updated: string;
}

export interface InventoryWithProduct extends CurrentInventory {
  product?: Product;
}

// =====================================================
// PROCUREMENT REQUESTS
// =====================================================
export interface ProcurementRequest {
  id: string;
  cook_id: string;
  status: ProcurementStatus;
  created_at: string;
  updated_at: string;
  submitted_at: string | null;
  finalized_at: string | null;
}

export interface ProcurementRequestWithSummary extends ProcurementRequest {
  item_count: number;
  total_cost: number;
  items?: ProcurementRequestItem[];
}

// =====================================================
// PROCUREMENT REQUEST ITEMS
// =====================================================
export interface ProcurementRequestItem {
  id: string;
  procurement_request_id: string;
  product_id: string;
  requested_quantity: number;
  requested_unit: ProductUnit;
  manager_adjusted_quantity: number | null;
  manager_adjusted_unit: ProductUnit | null;
  unit_price: number | null;
  total_price: number | null;
  created_at: string;
  updated_at: string;
}

export interface ProcurementRequestItemWithProduct extends ProcurementRequestItem {
  product?: Product;
}

// =====================================================
// PROCUREMENT HANDSHAKES
// =====================================================
export interface ProcurementHandshake {
  id: string;
  procurement_request_id: string;
  manager_id: string;
  status: HandshakeStatus;
  manager_ready_at: string | null;
  cook_verified_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface HandshakeItemVerification {
  id: string;
  handshake_id: string;
  procurement_request_item_id: string;
  manager_delivered_quantity: number;
  cook_verified_quantity: number | null;
  discrepancy_flagged: boolean;
  cook_notes: string | null;
  created_at: string;
  updated_at: string;
}

// =====================================================
// PROCUREMENT LOGS
// =====================================================
export interface ProcurementLog {
  id: string;
  procurement_request_id: string;
  product_id: string;
  received_quantity: number;
  unit: ProductUnit;
  unit_price: number | null;
  total_cost: number | null;
  source: string;
  log_timestamp: string;
}

// =====================================================
// USAGE LOGS
// =====================================================
export interface UsageLog {
  id: string;
  cook_id: string;
  product_id: string;
  used_quantity: number;
  unit: ProductUnit;
  usage_date: string;
  notes: string | null;
  created_at: string;
}

// =====================================================
// API REQUEST/RESPONSE TYPES
// =====================================================

export interface CreateProcurementRequestPayload {
  cook_id: string;
  items: Array<{
    product_id: string;
    requested_quantity: number;
    requested_unit: ProductUnit;
  }>;
}

export interface ManagerAdjustmentPayload {
  item_id: string;
  manager_adjusted_quantity: number;
  manager_adjusted_unit: ProductUnit;
  unit_price: number;
}

export interface CookVerificationPayload {
  handshake_id: string;
  items: Array<{
    verification_id: string;
    cook_verified_quantity: number;
    discrepancy_flagged: boolean;
    cook_notes?: string;
  }>;
}

export interface UsageRecordPayload {
  cook_id: string;
  product_id: string;
  used_quantity: number;
  unit: ProductUnit;
  usage_date: string;
  notes?: string;
}

// =====================================================
// UI STATE TYPES
// =====================================================

export interface ProcurementUIState {
  isLoading: boolean;
  error: string | null;
  successMessage: string | null;
}

export interface EditingItemState {
  itemId: string;
  field: 'quantity' | 'unit_price' | 'quantity_and_price';
  originalValue: number;
}
