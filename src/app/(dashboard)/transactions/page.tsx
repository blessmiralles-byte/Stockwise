'use client'

import { useState } from 'react'
import { Topbar } from '@/components/layout/topbar'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TableSkeleton } from '@/components/ui/skeleton'
import { useApi } from '@/lib/use-api'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Search, Plus, Download, ArrowRight } from 'lucide-react'
import Link from 'next/link'

const typeConfig: Record<string, { label: string; variant: any }> = {
  purchase:    { label: 'Purchase',    variant: 'success'     },
  transfer:    { label: 'Transfer',    variant: 'default'     },
  sale:        { label: 'Sale',        variant: 'warning'     },
  consumption: { label: 'Consumption', variant: 'secondary'   },
  adjustment:  { label: 'Adjustment',  variant: 'outline'     },
}

export default function TransactionsPage() {
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')

  const { data, loading, error } = useApi<{ data: any[] }>('/api/transactions')
  const transactions = data?.data ?? []

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
                            {m.job_order ? (
                              <span className="inline-flex items-center gap-1 text-xs bg-indigo-50 text-indigo-700 border border-indigo-100 rounded px-2 py-0.5 font-medium">
                                {m.job_order.job_number}
                              </span>
                            ) : m.customer_id ? (
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
