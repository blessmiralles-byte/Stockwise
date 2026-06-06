/**
 * Seed script — inserts sample data into Supabase matching the UI mock data.
 * Run once: npm run seed
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'
import ws from 'ws'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { realtime: { transport: ws as any } }
)

async function seed() {
  console.log('🌱 Seeding StockWise database...\n')

  // ── Locations ──────────────────────────────────────────────────────────────
  console.log('📍 Inserting locations...')
  const { data: locations, error: locErr } = await supabase
    .from('locations')
    .insert([
      { name: 'Main Warehouse',  code: 'WH-MAIN',    type: 'warehouse', address: '123 Industrial Ave, Makati' },
      { name: 'Head Office',     code: 'OFF-HEAD',   type: 'office',    address: '456 Ayala Ave, Makati' },
      { name: 'Retail Store',    code: 'STR-RETAIL', type: 'store',     address: '789 SM Megamall' },
      { name: 'Branch Office',   code: 'OFF-BRANCH', type: 'office',    address: '321 Ortigas Center, Pasig' },
    ])
    .select()

  if (locErr) { console.error('  ✗ Locations:', locErr.message); process.exit(1) }
  console.log(`  ✓ ${locations!.length} locations`)

  const loc = Object.fromEntries(locations!.map(l => [l.code, l.id]))

  // ── Categories ─────────────────────────────────────────────────────────────
  console.log('🏷️  Inserting categories...')
  const { data: categories, error: catErr } = await supabase
    .from('categories')
    .insert([
      { name: 'Furniture',       type: 'inventory'    },
      { name: 'Electronics',     type: 'inventory'    },
      { name: 'Supplies',        type: 'inventory'    },
      { name: 'Office Supplies', type: 'inventory'    },
      { name: 'Vehicle',         type: 'fixed_asset'  },
      { name: 'IT Equipment',    type: 'fixed_asset'  },
      { name: 'Facility',        type: 'fixed_asset'  },
      { name: 'Equipment',       type: 'fixed_asset'  },
    ])
    .select()

  if (catErr) { console.error('  ✗ Categories:', catErr.message); process.exit(1) }
  console.log(`  ✓ ${categories!.length} categories`)

  const cat = Object.fromEntries(categories!.map(c => [c.name, c.id]))

  // ── Accountable Persons ────────────────────────────────────────────────────
  console.log('👤 Inserting accountable persons...')
  const { data: persons, error: persErr } = await supabase
    .from('accountable_persons')
    .insert([
      { name: 'Juan Cruz',       email: 'juan.cruz@company.com',   department: 'Operations',  employee_id: 'EMP-001' },
      { name: 'Maria Santos',    email: 'maria.santos@company.com', department: 'Sales',      employee_id: 'EMP-002' },
      { name: 'IT Department',   department: 'Information Technology' },
      { name: 'Facilities Team', department: 'Facilities Management' },
      { name: 'Warehouse Team',  department: 'Warehouse' },
    ])
    .select()

  if (persErr) { console.error('  ✗ Persons:', persErr.message); process.exit(1) }
  console.log(`  ✓ ${persons!.length} accountable persons`)

  const person = Object.fromEntries(persons!.map(p => [p.name, p.id]))

  // ── Products ───────────────────────────────────────────────────────────────
  console.log('📦 Inserting products...')
  const { data: products, error: prodErr } = await supabase
    .from('products')
    .insert([
      { sku: 'PRD-001', barcode: '8901234567890', name: 'Ergonomic Office Chair',      category_id: cat['Furniture'],       unit_of_measure: 'pc',  cost_method: 'average', reorder_point: 10 },
      { sku: 'PRD-002', barcode: '8901234567891', name: 'USB-C Hub 7-Port',             category_id: cat['Electronics'],     unit_of_measure: 'pc',  cost_method: 'fifo',    reorder_point: 15 },
      { sku: 'PRD-003', barcode: '8901234567892', name: 'Standing Desk 160cm',          category_id: cat['Furniture'],       unit_of_measure: 'pc',  cost_method: 'fifo',    reorder_point: 5  },
      { sku: 'PRD-004', barcode: '8901234567893', name: 'Printer Paper A4 (500 sheets)',category_id: cat['Supplies'],        unit_of_measure: 'ream', cost_method: 'average', reorder_point: 20 },
      { sku: 'PRD-005', barcode: '8901234567894', name: 'Laptop Stand Adjustable',      category_id: cat['Electronics'],     unit_of_measure: 'pc',  cost_method: 'average', reorder_point: 8  },
      { sku: 'PRD-006', barcode: '8901234567895', name: 'Whiteboard 120x90cm',          category_id: cat['Office Supplies'], unit_of_measure: 'pc',  cost_method: 'fifo',    reorder_point: 3  },
    ])
    .select()

  if (prodErr) { console.error('  ✗ Products:', prodErr.message); process.exit(1) }
  console.log(`  ✓ ${products!.length} products`)

  const prod = Object.fromEntries(products!.map(p => [p.sku, p.id]))

  // ── Inventory Balances ─────────────────────────────────────────────────────
  console.log('📊 Inserting inventory balances...')
  const { data: balances, error: balErr } = await supabase
    .from('inventory_balances')
    .insert([
      { product_id: prod['PRD-001'], location_id: loc['WH-MAIN'],    quantity: 24, avg_cost: 448.50 },
      { product_id: prod['PRD-002'], location_id: loc['STR-RETAIL'], quantity: 8,  avg_cost: 47.50  },
      { product_id: prod['PRD-003'], location_id: loc['WH-MAIN'],    quantity: 6,  avg_cost: 785.00 },
      { product_id: prod['PRD-004'], location_id: loc['OFF-HEAD'],   quantity: 3,  avg_cost: 4.50   },
      { product_id: prod['PRD-005'], location_id: loc['OFF-BRANCH'], quantity: 12, avg_cost: 72.30  },
      { product_id: prod['PRD-006'], location_id: loc['WH-MAIN'],    quantity: 0,  avg_cost: 118.50 },
    ])
    .select()

  if (balErr) { console.error('  ✗ Balances:', balErr.message); process.exit(1) }
  console.log(`  ✓ ${balances!.length} inventory balances`)

  // ── FIFO Batches (for FIFO products) ───────────────────────────────────────
  console.log('📋 Inserting FIFO batches...')
  const { data: batches, error: batchErr } = await supabase
    .from('inventory_batches')
    .insert([
      { product_id: prod['PRD-002'], location_id: loc['STR-RETAIL'], purchase_date: '2026-04-01', quantity_remaining: 5,  unit_cost: 46.00, reference_no: 'PO-2026-010' },
      { product_id: prod['PRD-002'], location_id: loc['STR-RETAIL'], purchase_date: '2026-05-01', quantity_remaining: 3,  unit_cost: 49.99, reference_no: 'PO-2026-022' },
      { product_id: prod['PRD-003'], location_id: loc['WH-MAIN'],    purchase_date: '2026-03-15', quantity_remaining: 2,  unit_cost: 770.00, reference_no: 'PO-2026-005' },
      { product_id: prod['PRD-003'], location_id: loc['WH-MAIN'],    purchase_date: '2026-05-17', quantity_remaining: 4,  unit_cost: 799.00, reference_no: 'PO-2026-002' },
      { product_id: prod['PRD-006'], location_id: loc['WH-MAIN'],    purchase_date: '2026-02-20', quantity_remaining: 0,  unit_cost: 118.50, reference_no: 'PO-2026-001' },
    ])
    .select()

  if (batchErr) { console.error('  ✗ FIFO batches:', batchErr.message); process.exit(1) }
  console.log(`  ✓ ${batches!.length} FIFO batches`)

  // ── Transaction History ────────────────────────────────────────────────────
  console.log('🔄 Inserting transaction history...')
  const { data: txns, error: txErr } = await supabase
    .from('inventory_transactions')
    .insert([
      { transaction_type: 'purchase',    product_id: prod['PRD-001'], to_location_id: loc['WH-MAIN'],    quantity: 10, unit_cost: 450.00,  reference_no: 'PO-2026-001' },
      { transaction_type: 'transfer',    product_id: prod['PRD-005'], from_location_id: loc['WH-MAIN'],  to_location_id: loc['OFF-BRANCH'], quantity: 5,  unit_cost: 72.30 },
      { transaction_type: 'sale',        product_id: prod['PRD-002'], from_location_id: loc['STR-RETAIL'], quantity: 3, unit_cost: 47.50,  reference_no: 'SO-2026-112', customer_id: 'ABC Corp' },
      { transaction_type: 'consumption', product_id: prod['PRD-004'], from_location_id: loc['OFF-HEAD'],  quantity: 20, unit_cost: 4.50,   reference_no: 'CONS-2026-008' },
      { transaction_type: 'purchase',    product_id: prod['PRD-003'], to_location_id: loc['WH-MAIN'],    quantity: 4,  unit_cost: 799.00,  reference_no: 'PO-2026-002' },
      { transaction_type: 'adjustment',  product_id: prod['PRD-006'], to_location_id: loc['WH-MAIN'],    quantity: -2, unit_cost: 118.50,  reference_no: 'ADJ-2026-003', notes: 'Damaged units written off' },
    ])
    .select()

  if (txErr) { console.error('  ✗ Transactions:', txErr.message); process.exit(1) }
  console.log(`  ✓ ${txns!.length} transactions`)

  // ── Fixed Assets ───────────────────────────────────────────────────────────
  console.log('🏗️  Inserting fixed assets...')
  const { data: assets, error: assetErr } = await supabase
    .from('fixed_assets')
    .insert([
      { asset_tag: 'AST-001', barcode: 'AST8901234001', name: 'Toyota Hiace Van',    category_id: cat['Vehicle'],       location_id: loc['WH-MAIN'],    accountable_person_id: person['Juan Cruz'],       purchase_date: '2023-06-15', purchase_cost: 1800000, status: 'active',      serial_number: 'ABC-1234' },
      { asset_tag: 'AST-002', barcode: 'AST8901234002', name: 'MacBook Pro 14"',     category_id: cat['IT Equipment'],  location_id: loc['OFF-HEAD'],   accountable_person_id: person['Maria Santos'],    purchase_date: '2024-01-10', purchase_cost: 95000,   status: 'active',      serial_number: 'SN-MBP-2024-001' },
      { asset_tag: 'AST-003', barcode: 'AST8901234003', name: 'HVAC Unit - Floor 3', category_id: cat['Facility'],      location_id: loc['OFF-HEAD'],   accountable_person_id: person['Facilities Team'], purchase_date: '2022-03-20', purchase_cost: 280000,  status: 'maintenance', serial_number: 'HVAC-FLR3-001' },
      { asset_tag: 'AST-004', barcode: 'AST8901234004', name: 'Backup Generator',    category_id: cat['Facility'],      location_id: loc['WH-MAIN'],    accountable_person_id: person['Facilities Team'], purchase_date: '2021-08-05', purchase_cost: 450000,  status: 'active',      serial_number: 'GEN-BKP-001' },
      { asset_tag: 'AST-005', barcode: 'AST8901234005', name: 'Dell Server Rack',    category_id: cat['IT Equipment'],  location_id: loc['OFF-HEAD'],   accountable_person_id: person['IT Department'],   purchase_date: '2023-11-22', purchase_cost: 320000,  status: 'active',      serial_number: 'DELL-SRV-2023' },
      { asset_tag: 'AST-006', barcode: 'AST8901234006', name: 'Forklift Electric',   category_id: cat['Equipment'],     location_id: loc['WH-MAIN'],    accountable_person_id: person['Warehouse Team'],  purchase_date: '2022-09-14', purchase_cost: 650000,  status: 'inactive',    serial_number: 'FLT-ELC-001' },
    ])
    .select()

  if (assetErr) { console.error('  ✗ Fixed assets:', assetErr.message); process.exit(1) }
  console.log(`  ✓ ${assets!.length} fixed assets`)

  const asset = Object.fromEntries(assets!.map(a => [a.asset_tag, a.id]))

  // ── Maintenance Schedules ──────────────────────────────────────────────────
  console.log('🔧 Inserting maintenance schedules...')
  const { data: schedules, error: schedErr } = await supabase
    .from('maintenance_schedules')
    .insert([
      { asset_id: asset['AST-001'], title: 'Oil Change & Filter',    scheduled_date: '2026-05-22', status: 'scheduled', notify_days_before: 3, cost: 3500,  performed_by: 'AutoMaster Shop' },
      { asset_id: asset['AST-003'], title: 'Filter Replacement',     scheduled_date: '2026-05-25', status: 'scheduled', notify_days_before: 7, cost: 8000,  performed_by: 'CoolAir Services' },
      { asset_id: asset['AST-004'], title: 'Monthly Load Test',      scheduled_date: '2026-06-01', status: 'scheduled', notify_days_before: 7, cost: 2500,  performed_by: 'Internal Team' },
      { asset_id: asset['AST-006'], title: 'Battery Inspection',     scheduled_date: '2026-05-15', status: 'overdue',   notify_days_before: 5, cost: 5000,  performed_by: 'TechLift Co.' },
      { asset_id: asset['AST-001'], title: 'Tire Rotation',          scheduled_date: '2026-05-10', status: 'completed', notify_days_before: 3, cost: 1200,  performed_by: 'AutoMaster Shop', completed_date: '2026-05-10' },
      { asset_id: asset['AST-005'], title: 'Firmware Update',        scheduled_date: '2026-05-08', status: 'completed', notify_days_before: 2, cost: 0,     performed_by: 'IT Department',   completed_date: '2026-05-08' },
    ])
    .select()

  if (schedErr) { console.error('  ✗ Schedules:', schedErr.message); process.exit(1) }
  console.log(`  ✓ ${schedules!.length} maintenance schedules`)

  console.log('\n✅ Seed complete!')
  console.log('\nYou can now scan these barcodes to test:')
  console.log('  8901234567890 — Ergonomic Office Chair (product)')
  console.log('  8901234567891 — USB-C Hub 7-Port (product, low stock)')
  console.log('  AST8901234001 — Toyota Hiace Van (fixed asset)')
  console.log('  AST8901234003 — HVAC Unit (asset, in maintenance)')
}

seed().catch(err => {
  console.error('Seed failed:', err)
  process.exit(1)
})
