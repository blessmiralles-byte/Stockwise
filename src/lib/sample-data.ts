/**
 * Sample data for a brand-new account.
 *
 * A new owner lands on an app full of zeros, which tells them nothing about
 * what it does. This fills it with a small, believable contractor setup they
 * can click around — then removes it in one go, exactly, by the ids recorded
 * when it was created. Nothing is guessed at deletion time.
 *
 * Everything is named with the SAMPLE_PREFIX so it is obvious on screen which
 * rows are not theirs.
 *
 * Pure data: the route turns these into rows and maps keys to real ids.
 */

export const SAMPLE_PREFIX = '[Sample]'

export const sample = (name: string) => `${SAMPLE_PREFIX} ${name}`

export interface SampleSpec {
  locations:  { key: string; name: string; code: string; type: string }[]
  categories: { key: string; name: string; type: string }[]
  vendors:    { key: string; name: string; contact_name: string; email: string; lead_time_days: number }[]
  products: {
    key: string; name: string; sku: string; unit: string; category: string
    vendor: string; reorder_point: number; keep_in_stock: boolean
    /** Opening stock, and what it cost — one line per location that holds it. */
    stock: { location: string; qty: number; unit_cost: number }[]
  }[]
  assets: {
    key: string; name: string; tag: string; category: string
    purchase_cost: number; useful_life_years: number; location: string
  }[]
  /** A draft order waiting to be priced, so the PO screen isn't empty either. */
  purchaseOrder: { vendor: string; lines: { product: string; qty: number; unit_cost: number }[] }
}

export const SAMPLE: SampleSpec = {
  locations: [
    { key: 'wh',  name: sample('Main Warehouse'), code: 'S-WH',  type: 'warehouse' },
    { key: 'van', name: sample('Van 1'),          code: 'S-VAN', type: 'vehicle'   },
  ],

  categories: [
    { key: 'elec',  name: sample('Electrical'),  type: 'inventory'   },
    { key: 'plumb', name: sample('Plumbing'),    type: 'inventory'   },
    { key: 'tools', name: sample('Power Tools'), type: 'fixed_asset' },
  ],

  vendors: [
    { key: 'acme', name: sample('Acme Electrical Supply'), contact_name: 'Dana Cruz',  email: 'sales@example.com', lead_time_days: 5 },
    { key: 'bolt', name: sample('Bolt & Pipe Co'),         contact_name: 'Sam Rivera', email: 'orders@example.com', lead_time_days: 10 },
  ],

  products: [
    // Deliberately below its reorder point, so the Reorder page has something
    // to show the moment they look at it.
    { key: 'cable', name: sample('2.5mm Twin & Earth Cable'), sku: 'S-CBL-25', unit: 'meters', category: 'elec',
      vendor: 'acme', reorder_point: 100, keep_in_stock: true,
      stock: [{ location: 'wh', qty: 60, unit_cost: 1.85 }] },

    { key: 'socket', name: sample('Double Socket Outlet'), sku: 'S-SOC-02', unit: 'pcs', category: 'elec',
      vendor: 'acme', reorder_point: 40, keep_in_stock: true,
      stock: [{ location: 'wh', qty: 120, unit_cost: 4.20 }, { location: 'van', qty: 15, unit_cost: 4.20 }] },

    { key: 'breaker', name: sample('32A MCB Breaker'), sku: 'S-MCB-32', unit: 'pcs', category: 'elec',
      vendor: 'acme', reorder_point: 25, keep_in_stock: true,
      stock: [{ location: 'wh', qty: 18, unit_cost: 9.50 }] },

    { key: 'pipe', name: sample('22mm Copper Pipe'), sku: 'S-PIP-22', unit: 'meters', category: 'plumb',
      vendor: 'bolt', reorder_point: 50, keep_in_stock: true,
      stock: [{ location: 'wh', qty: 240, unit_cost: 6.10 }] },

    { key: 'elbow', name: sample('22mm Elbow Fitting'), sku: 'S-ELB-22', unit: 'pcs', category: 'plumb',
      vendor: 'bolt', reorder_point: 60, keep_in_stock: true,
      stock: [{ location: 'wh', qty: 300, unit_cost: 1.15 }, { location: 'van', qty: 24, unit_cost: 1.15 }] },

    // Out of stock entirely — the case that should always raise an alert.
    { key: 'sealant', name: sample('Pipe Sealant 50ml'), sku: 'S-SEAL-50', unit: 'pcs', category: 'plumb',
      vendor: 'bolt', reorder_point: 12, keep_in_stock: true,
      stock: [] },
  ],

  assets: [
    { key: 'drill', name: sample('SDS Hammer Drill'), tag: 'S-TOOL-001', category: 'tools',
      purchase_cost: 420, useful_life_years: 5, location: 'van' },
    { key: 'tester', name: sample('Multifunction Tester'), tag: 'S-TOOL-002', category: 'tools',
      purchase_cost: 1150, useful_life_years: 5, location: 'wh' },
  ],

  purchaseOrder: {
    vendor: 'acme',
    lines: [
      { product: 'cable',   qty: 200, unit_cost: 1.85 },
      { product: 'breaker', qty: 50,  unit_cost: 9.50 },
    ],
  },
}

/** Tables the sample touches, in the order they must be deleted (children first). */
export const SAMPLE_DELETE_ORDER = [
  'purchase_order_lines',
  'purchase_orders',
  'inventory_transactions',
  'inventory_balances',
  'reorder_alerts',
  'fixed_assets',
  'products',
  'suppliers',
  'categories',
  'locations',
] as const

export type SampleTable = (typeof SAMPLE_DELETE_ORDER)[number]

/** Ids created by a load, so removal deletes exactly those rows and nothing else. */
export type SampleRecord = Partial<Record<SampleTable, string[]>>

/** Total stock value of the sample, for the "here's what you're looking at" line. */
export function sampleStockValue(spec: SampleSpec = SAMPLE): number {
  return spec.products.reduce(
    (sum, p) => sum + p.stock.reduce((s, line) => s + line.qty * line.unit_cost, 0),
    0,
  )
}

/** Products the sample deliberately leaves below their reorder point. */
export function sampleLowStock(spec: SampleSpec = SAMPLE): string[] {
  return spec.products
    .filter(p => {
      const held = p.stock.reduce((s, line) => s + line.qty, 0)
      return p.keep_in_stock && (held <= p.reorder_point || held === 0)
    })
    .map(p => p.key)
}
