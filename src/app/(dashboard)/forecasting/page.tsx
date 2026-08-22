'use client'

import { useState, useMemo } from 'react'
import { Topbar } from '@/components/layout/topbar'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TableSkeleton } from '@/components/ui/skeleton'
import { useApi } from '@/lib/use-api'
import { formatCurrency } from '@/lib/utils'
import {
  TrendingUp, AlertTriangle, Search, Info, ShoppingCart, BarChart2, RefreshCw,
} from 'lucide-react'

// ── Status config ─────────────────────────────────────────────────────────────
const statusConfig = {
  critical:    { label: 'Critical',     variant: 'destructive' as const, bg: 'bg-red-50',    text: 'text-red-700',    icon: '🔴' },
  low:         { label: 'Low',          variant: 'warning'     as const, bg: 'bg-yellow-50', text: 'text-yellow-700', icon: '🟡' },
  adequate:    { label: 'Adequate',     variant: 'success'     as const, bg: '',             text: 'text-green-700',  icon: '🟢' },
  overstock:   { label: 'Overstock',   variant: 'secondary'   as const, bg: 'bg-blue-50',   text: 'text-blue-700',   icon: '🔵' },
  no_movement: { label: 'No Movement', variant: 'outline'     as const, bg: '',             text: 'text-slate-500',   icon: '⚪' },
}

const ABC_COLORS: Record<string, string> = {
  A: 'bg-purple-100 text-purple-800',
  B: 'bg-blue-100 text-blue-700',
  C: 'bg-slate-100 text-slate-600',
}
const XYZ_COLORS: Record<string, string> = {
  X: 'bg-green-100 text-green-700',
  Y: 'bg-yellow-100 text-yellow-700',
  Z: 'bg-red-100 text-red-700',
}

// ── Days-bar component ────────────────────────────────────────────────────────
function DaysBar({ days, forecastDays, leadTime }: { days: number | null; forecastDays: number; leadTime: number }) {
  if (days === null) return <span className="text-xs text-slate-300">—</span>
  const pct = Math.min(100, (days / (forecastDays * 2)) * 100)
  const color = days <= leadTime ? 'bg-red-500' : days <= 30 ? 'bg-yellow-400' : 'bg-green-400'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden min-w-[60px]">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs font-medium tabular-nums min-w-[36px] text-right ${
        days <= leadTime ? 'text-red-600' : days <= 30 ? 'text-yellow-600' : 'text-slate-700'
      }`}>
        {days}d
      </span>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
const LOOKBACK_OPTIONS  = [{ value: 30, label: '30 days' }, { value: 60, label: '60 days' }, { value: 90, label: '90 days' }, { value: 180, label: '6 months' }]
const FORECAST_OPTIONS  = [{ value: 14, label: '2 weeks' }, { value: 30, label: '30 days' }, { value: 60, label: '60 days' }, { value: 90, label: '90 days' }]

export default function ForecastingPage() {
  const [daysBack,      setDaysBack]      = useState(90)
  const [forecastDays,  setForecastDays]  = useState(30)
  const [statusFilter,  setStatusFilter]  = useState('all')
  const [search,        setSearch]        = useState('')
  const [classifying,   setClassifying]   = useState(false)
  const [classifyMsg,   setClassifyMsg]   = useState('')

  const url = `/api/forecasting?days_back=${daysBack}&forecast_days=${forecastDays}`
  const { data, loading, error, refetch } = useApi<any>(url)

  const rows: any[]    = data?.data    ?? []
  const summary: any   = data?.summary ?? {}

  const filtered = useMemo(() => rows.filter(r => {
    const matchStatus = statusFilter === 'all' || r.forecast_status === statusFilter
    const q = search.toLowerCase()
    const matchSearch = !q ||
      (r.product?.name ?? '').toLowerCase().includes(q) ||
      (r.product?.sku  ?? '').toLowerCase().includes(q)
    return matchStatus && matchSearch
  }), [rows, statusFilter, search])

  const needsReorder = filtered.filter(r => r.suggested_reorder > 0)

  async function runAbcXyz() {
    setClassifying(true); setClassifyMsg('')
    try {
      const res = await fetch('/api/analytics/abc-xyz', { method: 'POST' })
      if (res.ok) {
        const j = await res.json()
        setClassifyMsg(`Classified ${j.data.classified} items`)
        refetch()
        setTimeout(() => setClassifyMsg(''), 4000)
      }
    } finally { setClassifying(false) }
  }

  return (
    <div>
      <Topbar title="Demand Forecasting" />
      <div className="p-6 space-y-5">

        {/* ── Controls ──────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-500 whitespace-nowrap">Lookback</span>
            <div className="flex rounded-lg border border-slate-200 overflow-hidden text-sm">
              {LOOKBACK_OPTIONS.map(o => (
                <button
                  key={o.value}
                  onClick={() => setDaysBack(o.value)}
                  className={`px-3 py-1.5 transition-colors ${daysBack === o.value ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-500 whitespace-nowrap">Forecast</span>
            <div className="flex rounded-lg border border-slate-200 overflow-hidden text-sm">
              {FORECAST_OPTIONS.map(o => (
                <button
                  key={o.value}
                  onClick={() => setForecastDays(o.value)}
                  className={`px-3 py-1.5 transition-colors ${forecastDays === o.value ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          <Button
            size="sm" variant="outline"
            onClick={runAbcXyz}
            disabled={classifying}
            className="gap-1.5 ml-auto text-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${classifying ? 'animate-spin' : ''}`} />
            {classifyMsg || (classifying ? 'Classifying…' : 'Run ABC/XYZ')}
          </Button>
        </div>

        {/* ── Summary cards ─────────────────────────────────────── */}
        {!loading && rows.length > 0 && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Card className="border-red-100">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle className="w-4 h-4 text-red-500" />
                  <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Critical</span>
                </div>
                <p className="text-3xl font-bold text-red-600">{summary.critical_count ?? 0}</p>
                <p className="text-xs text-slate-400 mt-0.5">Stock ≤ lead time</p>
              </CardContent>
            </Card>
            <Card className="border-yellow-100">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle className="w-4 h-4 text-yellow-500" />
                  <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">At Reorder Point</span>
                </div>
                <p className="text-3xl font-bold text-yellow-600">{summary.low_count ?? 0}</p>
                <p className="text-xs text-slate-400 mt-0.5">Below lead-time reorder pt</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <ShoppingCart className="w-4 h-4 text-indigo-500" />
                  <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Projected Demand</span>
                </div>
                <p className="text-2xl font-bold text-indigo-700">{formatCurrency(summary.total_projected_value ?? 0)}</p>
                <p className="text-xs text-slate-400 mt-0.5">Next {forecastDays} days</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <BarChart2 className="w-4 h-4 text-green-500" />
                  <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Reorder Value</span>
                </div>
                <p className="text-2xl font-bold text-green-700">{formatCurrency(summary.total_reorder_value ?? 0)}</p>
                <p className="text-xs text-slate-400 mt-0.5">{needsReorder.length} items need restocking</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── Filters ───────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input placeholder="Search item or SKU…" className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-1">
            {['all', 'critical', 'low', 'adequate', 'overstock', 'no_movement'].map(s => {
              const cfg = statusConfig[s as keyof typeof statusConfig]
              return (
                <Button
                  key={s} size="sm"
                  variant={statusFilter === s ? 'default' : 'outline'}
                  onClick={() => setStatusFilter(s)}
                  className="text-xs gap-1"
                >
                  {cfg?.icon && <span>{cfg.icon}</span>}
                  {s === 'all' ? 'All' : cfg?.label ?? s}
                  {s !== 'all' && !loading && (
                    <span className="ml-0.5 text-xs opacity-60">
                      ({rows.filter(r => r.forecast_status === s).length})
                    </span>
                  )}
                </Button>
              )
            })}
          </div>
        </div>

        {/* ── Main table ────────────────────────────────────────── */}
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <TableSkeleton rows={8} cols={8} />
            ) : error ? (
              <p className="text-center py-10 text-red-500">{error}</p>
            ) : filtered.length === 0 ? (
              <div className="text-center py-16 text-slate-400">
                <TrendingUp className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p className="font-medium text-sm">
                  {rows.length === 0
                    ? 'No consumption or sales data yet. Record some transactions first.'
                    : 'No items match the current filter.'}
                </p>
                {rows.length === 0 && (
                  <p className="text-xs mt-1 text-slate-300">Forecasting is based on consumption and sale transactions.</p>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b-2 border-slate-100 bg-slate-50">
                      <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide">Item</th>
                      <th className="text-center px-3 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide hidden xl:table-cell">Class</th>
                      <th className="text-right px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide hidden md:table-cell">Avg / Day</th>
                      <th className="text-right px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide">
                        {forecastDays}d Forecast
                      </th>
                      <th className="text-right px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide">On Hand</th>
                      <th className="text-right px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide hidden lg:table-cell">Reorder Pt</th>
                      <th className="px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide">Days Left</th>
                      <th className="text-right px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide hidden lg:table-cell">Reorder Qty</th>
                      <th className="text-center px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r: any) => {
                      const cfg = statusConfig[r.forecast_status as keyof typeof statusConfig] ?? statusConfig.adequate
                      const isUrgent = r.forecast_status === 'critical' || r.forecast_status === 'low'
                      const abc = r.product?.abc_class
                      const xyz = r.product?.xyz_class
                      return (
                        <tr
                          key={r.product?.id}
                          className={`border-b border-slate-50 transition-colors hover:bg-slate-50/50 ${cfg.bg}`}
                        >
                          <td className="px-4 py-3">
                            <p className={`font-medium text-slate-900 ${isUrgent ? 'font-semibold' : ''}`}>{r.product?.name}</p>
                            <p className="font-mono text-xs text-slate-400">{r.product?.sku}</p>
                            {r.product?.category?.name && (
                              <p className="text-xs text-slate-400">{r.product.category.name}</p>
                            )}
                          </td>

                          {/* ABC/XYZ classes */}
                          <td className="px-3 py-3 text-center hidden xl:table-cell">
                            <div className="flex items-center justify-center gap-1">
                              {abc ? (
                                <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-bold ${ABC_COLORS[abc] ?? ''}`}>{abc}</span>
                              ) : <span className="text-slate-200 text-xs">—</span>}
                              {xyz ? (
                                <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-bold ${XYZ_COLORS[xyz] ?? ''}`}>{xyz}</span>
                              ) : null}
                            </div>
                          </td>

                          {/* Avg daily */}
                          <td className="px-4 py-3 text-right hidden md:table-cell">
                            <span className="font-semibold text-slate-800 tabular-nums">{r.avg_daily}</span>
                            <span className="text-xs text-slate-400 ml-1">{r.product?.unit_of_measure}/day</span>
                          </td>

                          {/* Projected demand */}
                          <td className="px-4 py-3 text-right">
                            <span className="font-semibold text-indigo-700 tabular-nums">{r.projected_qty.toLocaleString()}</span>
                            <span className="block text-xs text-slate-400 tabular-nums">{formatCurrency(r.projected_value)}</span>
                          </td>

                          {/* Current stock */}
                          <td className="px-4 py-3 text-right">
                            <span className={`font-bold tabular-nums ${r.current_stock <= 0 ? 'text-red-600' : 'text-slate-900'}`}>
                              {r.current_stock.toLocaleString()}
                            </span>
                            <span className="text-xs text-slate-400 ml-1">{r.product?.unit_of_measure}</span>
                          </td>

                          {/* Reorder point */}
                          <td className="px-4 py-3 text-right hidden lg:table-cell">
                            <span className="tabular-nums text-slate-600">{r.reorder_point.toLocaleString()}</span>
                            <span className="block text-xs text-slate-400">{r.lead_time_days}d lead</span>
                          </td>

                          {/* Days remaining bar */}
                          <td className="px-4 py-3 min-w-[120px]">
                            <DaysBar days={r.days_remaining} forecastDays={forecastDays} leadTime={r.lead_time_days} />
                          </td>

                          {/* Suggested reorder */}
                          <td className="px-4 py-3 text-right hidden lg:table-cell">
                            {r.suggested_reorder > 0 ? (
                              <span className="font-semibold text-orange-600 tabular-nums">
                                +{r.suggested_reorder.toLocaleString()}
                              </span>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>

                          {/* Status */}
                          <td className="px-4 py-3 text-center">
                            <Badge variant={cfg.variant}>{cfg.label}</Badge>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Methodology note ──────────────────────────────────── */}
        {!loading && rows.length > 0 && (
          <div className="flex items-start gap-2 text-xs text-slate-400 bg-slate-50 rounded-lg px-4 py-3">
            <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <p>
              Forecast uses a <strong>simple moving average</strong> over the last <strong>{daysBack} days</strong>.
              Reorder point = avg_daily × (lead_time + review_period) + safety_stock.
              "Critical" = stock will run out before the vendor can deliver.
              "At Reorder Point" = stock is below the lead-time-aware threshold.
              <strong> Run ABC/XYZ</strong> to classify items by consumption value and demand variability.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
