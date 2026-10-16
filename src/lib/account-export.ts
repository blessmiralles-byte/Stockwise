/**
 * "Download everything" — one workbook with a tab per table.
 *
 * Needed for three reasons: people ask for their data before they commit,
 * data-protection law gives them the right to it, and we are about to start
 * deleting abandoned trials — a deletion warning with no way to save your work
 * is a bad bargain.
 *
 * The spec below is the whole contract: which tables, which columns, what the
 * tab is called. Columns are listed explicitly rather than selecting * so a
 * new internal column can never quietly end up in a customer's download.
 */

export interface ExportTable {
  /** Table name in the database. */
  table: string
  /** Excel tab name — 31 characters max, and unique. */
  sheet: string
  /** Columns to include, in order. */
  columns: string[]
  /** Column to sort by, oldest first. */
  orderBy?: string
}

/** Each tenant table, with the columns a customer would expect to get back. */
export const EXPORT_TABLES: ExportTable[] = [
  { table: 'products', sheet: 'Products', orderBy: 'created_at',
    columns: ['id', 'sku', 'barcode', 'name', 'unit_of_measure', 'cost_method', 'reorder_point', 'keep_in_stock', 'track_expiry', 'is_active', 'category_id', 'supplier_id', 'created_at'] },

  { table: 'inventory_balances', sheet: 'Stock on hand',
    columns: ['id', 'product_id', 'location_id', 'quantity', 'avg_cost', 'last_updated'] },

  { table: 'inventory_transactions', sheet: 'Stock movements', orderBy: 'created_at',
    columns: ['id', 'transaction_type', 'product_id', 'from_location_id', 'to_location_id', 'quantity', 'unit_cost', 'total_cost', 'reference_no', 'notes', 'job_order_id', 'job_code', 'cost_center_id', 'batch_no', 'expiration_date', 'status', 'created_by', 'created_at'] },

  { table: 'locations', sheet: 'Locations', orderBy: 'created_at',
    columns: ['id', 'name', 'code', 'type', 'parent_id', 'is_transit', 'address', 'created_at'] },

  { table: 'categories', sheet: 'Categories', orderBy: 'created_at',
    columns: ['id', 'name', 'type', 'created_at'] },

  { table: 'suppliers', sheet: 'Vendors', orderBy: 'created_at',
    columns: ['id', 'name', 'contact_name', 'email', 'phone', 'payment_terms', 'lead_time_days', 'notes', 'created_at'] },

  { table: 'purchase_orders', sheet: 'Purchase orders', orderBy: 'created_at',
    columns: ['id', 'po_number', 'status', 'supplier_id', 'order_date', 'expected_date', 'notes', 'requisition_id', 'submitted_at', 'submitted_by', 'approved_by', 'approved_at', 'supplier_invoice_no', 'supplier_invoice_date', 'supplier_invoice_amount', 'created_by', 'created_at'] },

  { table: 'purchase_order_lines', sheet: 'PO lines',
    columns: ['id', 'purchase_order_id', 'product_id', 'quantity_ordered', 'quantity_received', 'unit_cost', 'notes', 'requisition_item_id'] },

  { table: 'requisitions', sheet: 'Requisitions', orderBy: 'created_at',
    columns: ['id', 'req_number', 'type', 'status', 'requested_by', 'approved_by', 'approved_at', 'job_reference', 'job_code', 'cost_center_id', 'location_id', 'notes', 'reject_reason', 'required_by', 'fulfilled_at', 'created_at'] },

  { table: 'requisition_items', sheet: 'Requisition items',
    columns: ['id', 'requisition_id', 'item_type', 'product_id', 'asset_id', 'quantity', 'unit_cost', 'notes', 'returned_at'] },

  { table: 'approval_steps', sheet: 'Approval trail', orderBy: 'created_at',
    columns: ['id', 'doc_type', 'doc_id', 'step_no', 'approver_id', 'status', 'acted_by', 'is_override', 'amount', 'note', 'created_at', 'acted_at'] },

  { table: 'fixed_assets', sheet: 'Fixed assets', orderBy: 'created_at',
    columns: ['id', 'asset_tag', 'name', 'status', 'category_id', 'serial_number', 'purchase_cost', 'current_value', 'purchase_date', 'useful_life_years', 'depreciation_method', 'location_id', 'accountable_person_id', 'checked_out_to', 'checked_out_job', 'checkout_due_at', 'disposed_at', 'notes', 'created_at'] },

  { table: 'asset_checkouts', sheet: 'Tool custody', orderBy: 'created_at',
    columns: ['id', 'asset_id', 'status', 'holder_name', 'holder_person_id', 'job_code', 'job_reference', 'due_at', 'checked_out_by', 'approved_by', 'approved_at', 'returned_at', 'returned_by', 'notes', 'created_at'] },

  { table: 'asset_incidents', sheet: 'Losses and damage', orderBy: 'occurred_on',
    columns: ['id', 'asset_id', 'kind', 'status', 'occurred_on', 'last_seen', 'description', 'police_report_no', 'held_by', 'estimated_loss', 'reported_by', 'resolved_by', 'resolution_note', 'created_at', 'resolved_at'] },

  { table: 'maintenance_schedules', sheet: 'Maintenance', orderBy: 'scheduled_date',
    columns: ['id', 'asset_id', 'kind', 'title', 'description', 'status', 'scheduled_date', 'completed_date', 'completed_by', 'completed_at', 'performed_by', 'cost', 'certificate_no', 'certified_until', 'recurrence_every', 'recurrence_unit', 'notes', 'created_at'] },

  { table: 'stock_counts', sheet: 'Stock counts', orderBy: 'created_at',
    columns: ['id', 'status', 'location_id', 'counted_by', 'approved_by', 'notes', 'created_at'] },

  { table: 'stock_count_lines', sheet: 'Stock count lines',
    columns: ['id', 'stock_count_id', 'product_id', 'counted_quantity', 'system_quantity', 'variance', 'notes'] },

  { table: 'cost_centers', sheet: 'Cost centers', orderBy: 'created_at',
    columns: ['id', 'code', 'name', 'is_active', 'created_at'] },

  { table: 'job_codes', sheet: 'Job codes', orderBy: 'created_at',
    columns: ['id', 'code', 'name', 'description', 'billing_entity', 'contact_name', 'contact_phone', 'contact_email', 'is_active', 'created_at'] },

  { table: 'accountable_persons', sheet: 'People', orderBy: 'created_at',
    columns: ['id', 'name', 'employee_no', 'is_active', 'created_at'] },

  { table: 'reorder_alerts', sheet: 'Reorder alerts', orderBy: 'triggered_at',
    columns: ['id', 'product_id', 'status', 'quantity_at_trigger', 'reorder_point', 'suggested_qty', 'po_id', 'triggered_at', 'resolved_at'] },

  // Team members: their own organization's people. No password or token data
  // exists in this table, and none is added here.
  { table: 'user_profiles', sheet: 'Team', orderBy: 'created_at',
    columns: ['id', 'full_name', 'email', 'role', 'job_title', 'is_active', 'reports_to', 'requisition_approval_limit', 'po_approval_limit', 'employee_no', 'created_at'] },

  { table: 'audit_log', sheet: 'Audit log', orderBy: 'created_at',
    columns: ['id', 'actor_id', 'action', 'table_name', 'record_id', 'old_value', 'new_value', 'created_at'] },
]

/** Rows per table. Beyond this the sheet is truncated and the summary says so. */
export const EXPORT_ROW_LIMIT = 20_000

/** Columns that must never appear in a customer download, whatever the spec says. */
const FORBIDDEN = [
  'password', 'token', 'secret', 'api_key', 'webhook', 'ls_customer_id',
  'ls_subscription_id', 'stripe', 'service_role', 'email_hash',
]

/** Guard against a column being added to the spec that shouldn't leave the building. */
export function forbiddenColumns(tables: ExportTable[] = EXPORT_TABLES): string[] {
  return tables.flatMap(t =>
    t.columns.filter(c => FORBIDDEN.some(f => c.toLowerCase().includes(f))).map(c => `${t.table}.${c}`))
}

/** Values Excel can hold: objects (jsonb) are written as compact JSON. */
export function cellValue(v: unknown): string | number | boolean | null {
  if (v == null) return null
  if (typeof v === 'object') return JSON.stringify(v)
  if (typeof v === 'number' || typeof v === 'boolean') return v
  return String(v)
}

/** Rows as a sheet: header line, then one line per record, columns in spec order. */
export function toSheetRows(spec: ExportTable, rows: Record<string, unknown>[]): (string | number | boolean | null)[][] {
  return [spec.columns, ...rows.map(r => spec.columns.map(c => cellValue(r[c])))]
}

/** The first tab: what is in this file, when it was made, and anything truncated. */
export function summarySheet(opts: {
  orgName: string
  generatedAt: string
  counts: Record<string, number>
  truncated: string[]
}): (string | number | null)[][] {
  const rows: (string | number | null)[][] = [
    ['Stocked — account export'],
    [opts.orgName],
    [`Generated ${opts.generatedAt}`],
    [],
    ['This file holds everything recorded in your account. Each tab is one part of it;',
    ],
    ['ids link the tabs together (a stock movement names a product_id, and so on).'],
    [],
    ['Tab', 'Rows'],
  ]
  for (const [sheet, count] of Object.entries(opts.counts)) rows.push([sheet, count])
  if (opts.truncated.length) {
    rows.push([], [`Truncated at ${EXPORT_ROW_LIMIT.toLocaleString()} rows: ${opts.truncated.join(', ')}.`],
      ['Email support@stocked.tech and we will send the rest.'])
  }
  return rows
}
