export type CostMethod = 'fifo' | 'average'
export type TransactionType = 'purchase' | 'transfer' | 'consumption' | 'sale' | 'adjustment'
export type AssetStatus = 'active' | 'inactive' | 'maintenance' | 'disposed'
export type MaintenanceStatus = 'scheduled' | 'completed' | 'overdue'

export interface Location {
  id: string
  name: string
  code: string
  address?: string
  type?: string
  level?: number
  parent_id?: string | null
  is_active?: boolean
  created_at: string
}

export interface Category {
  id: string
  name: string
  type: 'inventory' | 'fixed_asset'
  created_at: string
}

export interface Product {
  id: string
  sku: string
  barcode?: string
  name: string
  description?: string
  category_id: string
  unit_of_measure: string
  reorder_point?: number
  cost_method: CostMethod
  attributes?: Record<string, string>   // e.g. { Size: 'M', Color: 'Red', Brand: 'Acme' }
  track_expiry?: boolean                // whether to record expiration dates per batch
  image_url?: string
  is_active: boolean
  created_at: string
  // v2 supply-chain fields
  supplier_id?: string
  lead_time_days?: number | null        // overrides supplier if set
  safety_stock?: number
  abc_class?: 'A' | 'B' | 'C' | null
  xyz_class?: 'X' | 'Y' | 'Z' | null
  abc_xyz_updated_at?: string | null
  category?: Category
  supplier?: Supplier
}

export interface InventoryBalance {
  id: string
  product_id: string
  location_id: string
  quantity: number
  avg_cost: number
  last_updated: string
  product?: Product
  location?: Location
}

export interface InventoryBatch {
  id: string
  product_id: string
  location_id: string
  purchase_date: string
  quantity_remaining: number
  unit_cost: number
  reference_no?: string
  batch_no?: string
  expiration_date?: string
}

export interface InventoryTransaction {
  id: string
  transaction_type: TransactionType
  product_id: string
  from_location_id?: string
  to_location_id?: string
  quantity: number
  unit_cost: number
  total_cost: number
  reference_no?: string
  customer_id?: string
  job_order_id?: string    // cross-system reference for JobLedger integration
  notes?: string
  created_at: string
  created_by?: string
  product?: Product
  from_location?: Location
  to_location?: Location
}

export interface FixedAsset {
  id: string
  asset_tag: string
  barcode?: string
  name: string
  description?: string
  category_id: string
  location_id: string
  purchase_date: string
  purchase_cost: number
  current_value?: number
  status: AssetStatus
  accountable_person_id?: string
  serial_number?: string
  image_url?: string
  created_at: string
  category?: Category
  location?: Location
  accountable_person?: AccountablePerson
}

export interface AccountablePerson {
  id: string
  name: string
  email?: string
  department?: string
  employee_id?: string
  created_at: string
}

export interface AssetMovement {
  id: string
  asset_id: string
  from_location_id?: string
  to_location_id: string
  from_person_id?: string
  to_person_id?: string
  moved_at: string
  reason?: string
  created_by?: string
}

export interface MaintenanceSchedule {
  id: string
  asset_id: string
  title: string
  description?: string
  scheduled_date: string
  completed_date?: string
  status: MaintenanceStatus
  notify_days_before: number
  cost?: number
  performed_by?: string
  notes?: string
  created_at: string
  asset?: FixedAsset
}


// ── Supplier ──────────────────────────────────────────────────────────────────
export interface Supplier {
  id: string
  name: string
  contact_name?: string
  email?: string
  phone?: string
  lead_time_days: number
  payment_terms?: string
  notes?: string
  is_active: boolean
  created_at: string
}

// ── Purchase Orders ───────────────────────────────────────────────────────────
export type PurchaseOrderStatus = 'draft' | 'sent' | 'partial' | 'received' | 'cancelled'

export interface PurchaseOrder {
  id: string
  po_number: string
  supplier_id?: string
  status: PurchaseOrderStatus
  expected_date?: string
  notes?: string
  created_by?: string
  created_at: string
  supplier?: Supplier
  lines?: PurchaseOrderLine[]
}

export interface PurchaseOrderLine {
  id: string
  purchase_order_id: string
  product_id: string
  quantity_ordered: number
  quantity_received: number
  unit_cost: number
  notes?: string
  created_at: string
  product?: Product
}

// ── Stock Counts ──────────────────────────────────────────────────────────────
export type StockCountStatus = 'open' | 'counting' | 'reviewing' | 'approved' | 'cancelled'

export interface StockCount {
  id: string
  count_number: string
  location_id?: string
  status: StockCountStatus
  notes?: string
  created_by?: string
  approved_by?: string
  created_at: string
  approved_at?: string
  location?: Location
  lines?: StockCountLine[]
}

export interface StockCountLine {
  id: string
  stock_count_id: string
  product_id: string
  location_id: string
  system_qty: number
  counted_qty: number | null
  variance: number | null  // GENERATED ALWAYS (counted_qty - system_qty)
  notes?: string
  product?: Product
  location?: Location
}

export interface POSItem {
  product_id: string
  quantity: number
  unit_price: number
  barcode?: string
}

export interface POSSaleRequest {
  items: POSItem[]
  location_id: string
  customer_id?: string
  reference_no?: string
}

export interface DashboardStats {
  total_products: number
  total_inventory_value: number
  low_stock_count: number
  total_assets: number
  assets_in_maintenance: number
  recent_transactions: InventoryTransaction[]
}
