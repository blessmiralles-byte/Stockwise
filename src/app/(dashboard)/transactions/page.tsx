'use client'

import { useState, useCallback } from 'react'
import { Topbar } from '@/components/layout/topbar'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TableSkeleton } from '@/components/ui/skeleton'
import { useApi } from '@/lib/use-api'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Search, Plus, Download, ArrowRight, FileCheck, Trash2, Loader2 } from 'lucide-react'
import Link from 'next/link'

const typeConfig: Record<string, { label: string; variant: any }> = {
  purchase:    { label: 'Purchase',    variant: 'success'     },
  transfer:    { label: 'Transfer',    variant: 'default'     },
  sale:        { label: 'Sale',        variant: 'warning'     },
  consumption: { label: 'Consumption', variant: 'secondary'   },
  adjustment:  { label: 'Adjustment',  variant: 'outline'     },
}

function DraftsSection({ onPosted }: { onPosted: () => void }) {
  const { data, loading, refetch } = useApi<{ data: any[] }>('/api/transactions?status=draft&limit=100')
  const drafts = data?.data ?? []
  const [posting, setPosting] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  const postDraft = useCallback(async (id: string) => {
    setPosting(id)
    try {
      const res = await fetch(`/api/transactions/${id}`, { method: 'POST' })
      if (res.ok) { refetch(); onPosted() }
    } finally { setPosting(null) }
  }, [refetch, onPosted])

  const deleteDraft = useCallback(async (id: string) => {
    setDeleting(id)
    try {
      const res = await fetch(`/api/transactions/${id}`, { method: 'DELETE' })
      if (res.ok) refetch()
    } finally { setDeleting(null) }
  }, [refetch])

  if (loading) return <div className="text-sm text-slate-400 py-2">Loading drafts…</div>
  if (drafts.length === 0) return null

  return (
    <Card className="border-amber-200 bg-amber-50/30">
      <CardContent className="p-0">
        <div className="px-4 py-3 border-b border-amber-100 flex items-center gap-2">
          <span className="text-sm font-semibold text-amber-800">Pending Drafts</span>
          <Badge variant="warning">{drafts.length}</Badge>
          <span className="text-xs text-amber-600 ml-1">— review and post to update stock</span>
        </div>
        <div className="divide-y divide-amber-50">
          {drafts.map((m: any) => {
            const cfg = typeConfig[m.transaction_type]
            return (
              <div key={m.id} className="px-4 py-3 flex items-center gap-3">
                <Badge variant={cfg?.variant ?? 'secondary'}>{cfg?.label ?? m.transaction_type}</Badge>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">{m.product?.name}</p>
                  <p className="text-xs text-slate-400 font-mono">{m.reference_no ?? '—'} · {formatDate(m.created_at)}</p>
                </div>
                <span className="text-sm font-semibold text-slate-700 shrink-0">×{m.quantity}</span>
                <div className="flex gap-1.5 shrink-0">
                  <Button
                    size="sm"
                    className="gap-1.5 h-7 text-xs bg-green-600 hover:bg-green-700"
                    onClick={() => postDraft(m.id)}
                    disabled={posting === m.id || deleting === m.id}
                  >
                    {posting === m.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileCheck className="w-3 h-3" />}
                    Post
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 h-7 text-xs border-red-200 text-red-600 hover:bg-red-50"
                    onClick={() => deleteDraft(m.id)}
                    disabled={posting === m.id || deleting === m.id}
                  >
                    {deleting === m.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

export default function TransactionsPage() {
  const [search, setSearch]       = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [tick, setTick]           = useState(0)

  const { data, loading, error, refetch } = useApi<{ data: any[] }>(`/api/transactions?_t=${tick}`)
  const transactions = (data?.data ?? []).filter((m: any) => m.status !== 'draft')

  const filtered = transactions.filter((m: any) => {
    const matchesSearch =
      (m.product?.name ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (m.reference_no ?? '').toLowerCase().includes(search.toLowerCase())
    const matchesType = typeFilter === 'all' || m.transaction_type === typeFilter
    return matchesSearch && matchesType
  })

  return (
    <div>
      <Topbar title="Transactions" />
      <div className="p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap flex-1">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input placeholder="Search by product or reference..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <div className="flex flex-wrap gap-1">
              {['all', 'purchase', 'transfer', 'sale', 'consumption', 'adjustment'].map(t => (
                <Button key={t} size="sm" variant={typeFilter === t ? 'default' : 'outline'} onClick={() => setTypeFilter(t)} className="capitalize text-xs">
                  {t === 'all' ? 'All' : typeConfig[t]?.label ?? t}
                </Button>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="gap-1.5"><Download className="w-3.5 h-3.5" />Export</Button>
            <Link href="/transactions/new">
              <Button className="gap-2"><Plus className="w-4 h-4" />New Transaction</Button>
            </Link>
          </div>
        </div>

        {/* Drafts section */}
        <DraftsSection onPosted={() => { setTick(t => t + 1); refetch() }} />

        {/* Posted transactions */}
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <TableSkeleton rows={6} cols={5} />
            ) : error ? (
              <p className="text-center py-10 text-red-500">{error}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="text-left px-4 py-3 font-medium text-slate-500">Type</th>
                      <th className="text-left px-4 py-3 font-medium text-slate-500">Reference</th>
                      <th className="text-left px-4 py-3 font-medium text-slate-500">Item</th>
                      <th className="text-left px-4 py-3 font-medium text-slate-500 hidden lg:table-cell">Route</th>
                      <th className="text-left px-4 py-3 font-medium text-slate-500 hidden xl:table-cell">Charged To</th>
                      <th className="text-right px-4 py-3 font-medium text-slate-500">Qty</th>
                      <th className="text-right px-4 py-3 font-medium text-slate-500 hidden md:table-cell">Total</th>
                      <th className="text-left px-4 py-3 font-medium text-slate-500 hidden md:table-cell">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((m: any) => {
                      const cfg = typeConfig[m.transaction_type]
                      const total = m.quantity * m.unit_cost
                      return (
                        <tr key={m.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                          <td className="px-4 py-3">
                            <Badge variant={cfg?.variant ?? 'secondary'}>{cfg?.label ?? m.transaction_type}</Badge>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-slate-600">{m.reference_no ?? '—'}</td>
                          <td className="px-4 py-3 font-medium text-slate-900">{m.product?.name}</td>
                          <td className="px-4 py-3 hidden lg:table-cell">
                            <div className="flex items-center gap-1 text-xs text-slate-500">
                              <span>{m.from_location?.name ?? '—'}</span>
                              {(m.from_location || m.to_location) && <ArrowRight className="w-3 h-3" />}
                              <span>{m.to_location?.name ?? '—'}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 hidden xl:table-cell">
                            {m.customer_id ? (
                              <span className="text-xs text-slate-600">{m.customer_id}</span>
                            ) : (
                              <span className="text-xs text-slate-300">—</span>
                            )}
                          </td>
                          <td className={`px-4 py-3 text-right font-semibold ${m.quantity < 0 ? 'text-red-600' : 'text-slate-900'}`}>
                            {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                          </td>
                          <td className="px-4 py-3 text-right hidden md:table-cell text-slate-700">
                            {formatCurrency(Math.abs(total))}
                          </td>
                          <td className="px-4 py-3 hidden md:table-cell text-slate-500 text-xs">
                            {formatDate(m.created_at)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {filtered.length === 0 && (
                  <div className="text-center py-12 text-slate-400">No transactions found</div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
