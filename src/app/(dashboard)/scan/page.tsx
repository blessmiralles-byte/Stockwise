'use client'

import { useState, useCallback, useRef } from 'react'
import { Topbar } from '@/components/layout/topbar'
import {
  Search, ScanBarcode, Package, Building2, MapPin,
  ClipboardList, ShoppingCart, BarChart3, Loader2,
  AlertCircle, ExternalLink, Printer, X, QrCode,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { cn } from '@/lib/utils'

// ── Type configs ──────────────────────────────────────────────────────────────
const TYPE_CFG: Record<string, { icon: any; color: string; label: string }> = {
  product:        { icon: Package,       color: 'bg-indigo-50 text-indigo-600',  label: 'Product'        },
  asset:          { icon: Building2,     color: 'bg-purple-50 text-purple-600',  label: 'Fixed Asset'    },
  location:       { icon: MapPin,        color: 'bg-green-50 text-green-600',    label: 'Location'       },
  requisition:    { icon: ClipboardList, color: 'bg-blue-50 text-blue-600',      label: 'Requisition'    },
  purchase_order: { icon: ShoppingCart,  color: 'bg-amber-50 text-amber-600',    label: 'Purchase Order' },
  stock_count:    { icon: BarChart3,     color: 'bg-teal-50 text-teal-600',      label: 'Stock Count'    },
  external_barcode: { icon: Package,     color: 'bg-slate-100 text-slate-500',   label: 'Global Catalog' },
}

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
}

// ── Label Print Dialog ────────────────────────────────────────────────────────
function PrintDialog({ code, label, onClose }: { code: string; label: string; onClose: () => void }) {
  const [size, setSize] = useState(180)
  const qrUrl = `/api/barcode/generate?code=${encodeURIComponent(code)}&label=${encodeURIComponent(label)}&size=${size}`

  const print = () => {
    const win = window.open('', '_blank', 'width=400,height=500')
    if (!win) return
    win.document.write(`
      <!DOCTYPE html><html><head>
      <title>Label — ${label}</title>
      <style>
        body { margin: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; font-family: monospace; }
        img  { max-width: 100%; }
        p    { font-size: 12px; text-align: center; margin: 4px 0; }
        @media print { @page { margin: 8mm; } }
      </style>
      </head><body>
      <img src="${window.location.origin}${qrUrl}" />
      <p style="font-weight:bold">${label}</p>
      <p style="color:#666">${code}</p>
      <script>window.onload = () => { window.print(); window.close(); }<\/script>
      </body></html>
    `)
    win.document.close()
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h3 className="font-semibold text-slate-900 text-sm">Print Label</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          {/* QR preview */}
          <div className="flex justify-center bg-slate-50 rounded-xl p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrUrl} alt="QR code" className="rounded" style={{ width: size, height: 'auto' }} />
          </div>

          <div>
            <p className="text-xs text-slate-500 mb-1">Label text</p>
            <p className="text-sm font-semibold text-slate-900">{label}</p>
            <p className="text-xs text-slate-400 font-mono mt-0.5">{code}</p>
          </div>

          <div>
            <label className="text-xs text-slate-500 block mb-1.5">QR size: {size}px</label>
            <input type="range" min={80} max={300} value={size} onChange={e => setSize(Number(e.target.value))}
              className="w-full accent-indigo-600" />
          </div>

          <div className="flex gap-2">
            <button onClick={print}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors">
              <Printer className="w-4 h-4" />Print
            </button>
            <a href={qrUrl} download={`${code}.svg`}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">
              SVG
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Result Card ───────────────────────────────────────────────────────────────
function ResultCard({ result, onPrint }: { result: any; onPrint: () => void }) {
  const cfg   = TYPE_CFG[result.type] ?? TYPE_CFG.product
  const Icon  = cfg.icon
  const d     = result.data

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${cfg.color}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-slate-900 text-sm truncate">{result.display}</p>
          <p className="text-xs text-slate-400 mt-0.5">
            {cfg.label} · matched on <span className="font-mono">{result.match_field}</span>
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button onClick={onPrint}
            className="p-2 rounded-lg hover:bg-slate-100 transition-colors text-slate-500 hover:text-slate-700"
            title="Print QR label">
            <QrCode className="w-4 h-4" />
          </button>
          <Link href={result.action_url}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition-colors">
            {result.type === 'external_barcode' ? 'Add to catalog' : 'Open'} <ExternalLink className="w-3 h-3" />
          </Link>
        </div>
      </div>

      {/* Detail grid */}
      <div className="px-5 py-4">
        {result.type === 'external_barcode' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-amber-50 border border-amber-100 text-amber-800 text-xs">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
              Not in your catalog yet — matched in the global barcode database.
            </div>
            <div className="flex gap-3">
              {d.image_url && (
                <img src={d.image_url} alt="" className="w-16 h-16 rounded-lg object-cover border border-slate-100 flex-shrink-0" />
              )}
              <dl className="flex-1 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                <dt className="text-slate-400">Name</dt>   <dd className="text-slate-800 text-right">{d.name ?? '—'}</dd>
                {d.brand    && (<><dt className="text-slate-400">Brand</dt>    <dd className="text-slate-800 text-right">{d.brand}</dd></>)}
                {d.category && (<><dt className="text-slate-400">Category</dt> <dd className="text-slate-800 text-right">{d.category}</dd></>)}
                <dt className="text-slate-400">Barcode</dt> <dd className="text-slate-800 text-right font-mono">{d.barcode}</dd>
                <dt className="text-slate-400">Source</dt>  <dd className="text-slate-500 text-right">{String(d.source).replace(/_/g, ' ')}</dd>
              </dl>
            </div>
          </div>
        )}

        {result.type === 'product' && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="bg-slate-50 rounded-xl p-3">
                <p className="text-lg font-bold text-slate-900">{d.total_qty}</p>
                <p className="text-xs text-slate-500 mt-0.5">Total Stock</p>
              </div>
              <div className={cn('rounded-xl p-3', d.stock_status === 'out_of_stock' ? 'bg-red-50' : d.stock_status === 'low_stock' ? 'bg-amber-50' : 'bg-green-50')}>
                <p className={cn('text-xs font-semibold mt-1', d.stock_status === 'out_of_stock' ? 'text-red-700' : d.stock_status === 'low_stock' ? 'text-amber-700' : 'text-green-700')}>
                  {d.stock_status === 'out_of_stock' ? 'OUT OF STOCK' : d.stock_status === 'low_stock' ? 'LOW STOCK' : 'IN STOCK'}
                </p>
              </div>
              <div className="bg-slate-50 rounded-xl p-3">
                <p className="text-xs text-slate-500">SKU</p>
                <p className="text-xs font-mono font-semibold text-slate-800 mt-1 truncate">{d.sku}</p>
              </div>
            </div>
            {d.balances?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-slate-500 mb-2">Stock by Location</p>
                <div className="space-y-1.5">
                  {d.balances.map((b: any, i: number) => (
                    <div key={i} className="flex items-center justify-between px-3 py-2 bg-slate-50 rounded-lg">
                      <div className="flex items-center gap-2">
                        <MapPin className="w-3 h-3 text-slate-400" />
                        <span className="text-xs text-slate-700">{b.location_name ?? 'Unknown'}</span>
                        {b.location_code && <span className="text-[10px] font-mono text-slate-400">({b.location_code})</span>}
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-semibold text-slate-900">{b.quantity} {d.unit}</span>
                        {b.avg_cost > 0 && <span className="text-[11px] text-slate-400 ml-2">@ {fmt(b.avg_cost)}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {result.type === 'asset' && (
          <div className="grid grid-cols-2 gap-3">
            {[
              ['Tag',      d.asset_tag],
              ['Status',   d.status],
              ['Category', d.category ?? '—'],
              ['Location', d.location ?? '—'],
              ['S/N',      d.serial_number ?? '—'],
              ['Accountable', d.accountable_person ?? '—'],
              ['Cost',     d.purchase_cost > 0 ? fmt(d.purchase_cost) : '—'],
              ['Book Value', d.current_value > 0 ? fmt(d.current_value) : '—'],
            ].map(([label, value]) => (
              <div key={label} className="bg-slate-50 rounded-lg p-2.5">
                <p className="text-[10px] text-slate-400 uppercase tracking-wide">{label}</p>
                <p className="text-xs font-semibold text-slate-800 mt-0.5 truncate">{value}</p>
              </div>
            ))}
          </div>
        )}

        {result.type === 'location' && (
          <div className="grid grid-cols-2 gap-3">
            {[
              ['Code',    d.code],
              ['Type',    d.type ?? '—'],
              ['Address', d.address ?? '—'],
            ].map(([label, value]) => (
              <div key={label} className="bg-slate-50 rounded-lg p-2.5">
                <p className="text-[10px] text-slate-400 uppercase tracking-wide">{label}</p>
                <p className="text-xs font-semibold text-slate-800 mt-0.5">{value}</p>
              </div>
            ))}
          </div>
        )}

        {(result.type === 'requisition' || result.type === 'purchase_order' || result.type === 'stock_count') && (
          <div className="grid grid-cols-2 gap-3">
            {[
              ['Number', result.code],
              ['Status', d.status],
              ...(d.supplier ? [['Supplier', d.supplier.name]] : []),
              ...(d.requested_by ? [['Requested by', d.requested_by.full_name]] : []),
            ].map(([label, value]) => (
              <div key={label} className="bg-slate-50 rounded-lg p-2.5">
                <p className="text-[10px] text-slate-400 uppercase tracking-wide">{label}</p>
                <p className="text-xs font-semibold text-slate-800 mt-0.5 truncate">{String(value)}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function ScanResolvePage() {
  const [query, setQuery]       = useState('')
  const [result, setResult]     = useState<any>(null)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [printOpen, setPrint]   = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const resolve = useCallback(async (q: string) => {
    if (!q.trim()) return
    setLoading(true); setError(''); setResult(null)
    try {
      const res  = await fetch(`/api/scan/resolve?q=${encodeURIComponent(q.trim())}`)
      const json = await res.json()
      if (!res.ok || !json.data) {
        setError(`No record found for "${q.trim()}"`)
      } else {
        setResult(json.data)
      }
    } catch {
      setError('Network error — please try again.')
    } finally {
      setLoading(false)
    }
  }, [])

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') resolve(query)
  }

  const clear = () => { setQuery(''); setResult(null); setError(''); inputRef.current?.focus() }

  return (
    <div>
      <Topbar title="Scan & Lookup" />
      <div className="p-6 max-w-2xl mx-auto space-y-5">

        {/* Search box */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <p className="text-xs text-slate-500 mb-3">
            Enter any code — product SKU, asset tag, barcode, location code, PO number, requisition number, or stock count number.
          </p>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <ScanBarcode className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Scan barcode or type any code…"
                autoFocus
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
              />
            </div>
            <button
              onClick={() => resolve(query)}
              disabled={loading || !query.trim()}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              Look Up
            </button>
            {(result || error) && (
              <button onClick={clear}
                className="px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-500 hover:bg-slate-50 transition-colors">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Supported types legend */}
          <div className="flex flex-wrap gap-2 mt-3">
            {Object.entries(TYPE_CFG).map(([type, cfg]) => (
              <span key={type} className={`flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${cfg.color}`}>
                <cfg.icon className="w-3 h-3" />{cfg.label}
              </span>
            ))}
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2.5 p-4 bg-red-50 border border-red-200 rounded-xl">
            <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {result && (
          <ResultCard
            result={result}
            onPrint={() => setPrint(true)}
          />
        )}

        {printOpen && result && (
          <PrintDialog
            code={result.code}
            label={result.display}
            onClose={() => setPrint(false)}
          />
        )}

      </div>
    </div>
  )
}
