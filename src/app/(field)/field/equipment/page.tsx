'use client'

import { useState, useCallback } from 'react'
import { useApi } from '@/lib/use-api'
import { Cpu, MapPin, User, AlertCircle, CheckCircle2, Loader2, ChevronLeft, X, Search, WrenchIcon } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

// ── Status config ─────────────────────────────────────────────────────────────
const STATUS_CFG: Record<string, { label: string; dot: string; badge: string; border: string }> = {
  active:      { label: 'Active',          dot: 'bg-green-500',  badge: 'bg-green-100 text-green-700',   border: 'border-gray-100' },
  maintenance: { label: 'In Maintenance',  dot: 'bg-amber-500',  badge: 'bg-amber-100 text-amber-700',   border: 'border-amber-200' },
  inactive:    { label: 'Inactive',        dot: 'bg-gray-400',   badge: 'bg-gray-100 text-gray-500',     border: 'border-gray-100' },
  disposed:    { label: 'Disposed',        dot: 'bg-red-400',    badge: 'bg-red-100 text-red-600',       border: 'border-red-100' },
}

// ── Report Issue sheet ────────────────────────────────────────────────────────
function ReportIssueSheet({
  asset,
  onClose,
  onDone,
}: {
  asset: any
  onClose: () => void
  onDone: () => void
}) {
  const [title, setTitle]   = useState('')
  const [notes, setNotes]   = useState('')
  const [date, setDate]     = useState(new Date().toISOString().split('T')[0])
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  const submit = async () => {
    if (!title.trim()) { setError('Please enter a brief issue title'); return }
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/maintenance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asset_id: asset.id,
          title: title.trim(),
          description: notes.trim() || undefined,
          scheduled_date: date,
          status: 'overdue',
        }),
      })
      if (!res.ok) {
        const j = await res.json()
        setError(j.error ?? 'Failed to report issue')
        return
      }
      onDone()
    } catch {
      setError('Network error — please try again')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      {/* Sheet */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-lg bg-white rounded-t-3xl z-50 px-5 pt-5 pb-24 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-bold text-gray-900 text-lg">Report Issue</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <div className="bg-amber-50 border border-amber-100 rounded-2xl px-4 py-3 mb-5 flex items-center gap-3">
          <Cpu className="w-5 h-5 text-amber-600 flex-shrink-0" />
          <div>
            <p className="font-semibold text-gray-900 text-sm">{asset.name}</p>
            <p className="text-xs text-gray-500">{asset.asset_tag}</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">Issue Title *</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Engine won't start, Oil leak, Brake failure…"
              autoFocus
              className="w-full h-14 px-4 rounded-2xl border border-gray-200 bg-white text-base focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Describe what happened, where, when…"
              rows={3}
              className="w-full px-4 py-3 rounded-2xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">Date</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full h-12 px-4 rounded-2xl border border-gray-200 bg-white text-base focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>
        </div>

        {error && (
          <div className="mt-4 flex items-center gap-2 bg-red-50 rounded-xl px-4 py-3 text-sm text-red-700">
            <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
          </div>
        )}

        <button
          onClick={submit}
          disabled={saving}
          className="mt-5 w-full h-14 bg-red-600 text-white rounded-2xl font-bold text-base active:bg-red-700 disabled:opacity-60 transition-colors flex items-center justify-center gap-2"
        >
          {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Reporting…</> : '⚠️ Report Issue'}
        </button>
      </div>
    </>
  )
}

// ── Asset card ────────────────────────────────────────────────────────────────
function AssetCard({
  asset,
  onReport,
  onMarkActive,
  busy,
}: {
  asset: any
  onReport: (a: any) => void
  onMarkActive: (id: string) => void
  busy: boolean
}) {
  const cfg = STATUS_CFG[asset.status] ?? STATUS_CFG.inactive

  return (
    <div className={cn('bg-white rounded-2xl border p-4 shadow-sm', cfg.border)}>
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-xl bg-purple-50 flex items-center justify-center flex-shrink-0">
          <Cpu className="w-5 h-5 text-purple-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-semibold text-gray-900 truncate">{asset.name}</p>
              <p className="text-xs text-gray-400 font-mono mt-0.5">{asset.asset_tag}{asset.serial_number ? ` · SN: ${asset.serial_number}` : ''}</p>
            </div>
            <span className={cn('text-xs font-semibold px-2.5 py-1 rounded-full flex-shrink-0 flex items-center gap-1.5', cfg.badge)}>
              <span className={cn('w-1.5 h-1.5 rounded-full', cfg.dot)} />
              {cfg.label}
            </span>
          </div>

          <div className="flex flex-wrap gap-3 mt-2.5 text-xs text-gray-400">
            {asset.location?.name && (
              <span className="flex items-center gap-1">
                <MapPin className="w-3 h-3" /> {asset.location.name}
              </span>
            )}
            {asset.accountable_person?.name && (
              <span className="flex items-center gap-1">
                <User className="w-3 h-3" /> {asset.accountable_person.name}
              </span>
            )}
            {asset.category?.name && (
              <span className="text-gray-300">{asset.category.name}</span>
            )}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 mt-4">
        {asset.status === 'maintenance' ? (
          <button
            onClick={() => onMarkActive(asset.id)}
            disabled={busy}
            className="flex-1 h-11 bg-green-600 text-white rounded-xl font-semibold text-sm active:bg-green-700 disabled:opacity-60 transition-colors flex items-center justify-center gap-2"
          >
            {busy
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <><CheckCircle2 className="w-4 h-4" /> Mark Fixed / Active</>
            }
          </button>
        ) : asset.status === 'active' ? (
          <button
            onClick={() => onReport(asset)}
            disabled={busy}
            className="flex-1 h-11 bg-amber-50 text-amber-700 border border-amber-200 rounded-xl font-semibold text-sm active:bg-amber-100 disabled:opacity-60 transition-colors flex items-center justify-center gap-2"
          >
            <WrenchIcon className="w-4 h-4" /> Report Issue
          </button>
        ) : null}
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function FieldEquipmentPage() {
  const { data, loading, error, refetch } = useApi<{ data: any[] }>('/api/assets')
  const assets = data?.data ?? []

  const [search, setSearch]     = useState('')
  const [filter, setFilter]     = useState<'all' | 'active' | 'maintenance'>('all')
  const [reporting, setReporting] = useState<any | null>(null)
  const [updating, setUpdating]  = useState<string | null>(null)
  const [toast, setToast]        = useState('')

  const filtered = assets.filter(a => {
    const matchSearch = search === '' ||
      a.name?.toLowerCase().includes(search.toLowerCase()) ||
      a.asset_tag?.toLowerCase().includes(search.toLowerCase())
    const matchFilter = filter === 'all' || a.status === filter
    return matchSearch && matchFilter
  })

  const counts = {
    all:         assets.length,
    active:      assets.filter(a => a.status === 'active').length,
    maintenance: assets.filter(a => a.status === 'maintenance').length,
  }

  const markActive = useCallback(async (id: string) => {
    setUpdating(id)
    try {
      await fetch(`/api/assets/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'active' }),
      })
      await refetch?.()
      setToast('Marked as active ✓')
      setTimeout(() => setToast(''), 2500)
    } finally {
      setUpdating(null)
    }
  }, [refetch])

  const handleReported = useCallback(async () => {
    setReporting(null)
    await refetch?.()
    setToast('Issue reported ✓')
    setTimeout(() => setToast(''), 2500)
  }, [refetch])

  return (
    <div className="flex flex-col min-h-full">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 pt-10 pb-4">
        <div className="flex items-center gap-3 mb-4">
          <Link href="/field" className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center text-gray-600 active:bg-gray-200">
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <h1 className="font-bold text-gray-900 text-lg flex-1">Equipment</h1>
          {counts.maintenance > 0 && (
            <span className="bg-amber-100 text-amber-700 text-xs font-bold px-2.5 py-1 rounded-full">
              {counts.maintenance} in maintenance
            </span>
          )}
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or tag…"
            className="w-full h-11 pl-11 pr-4 rounded-2xl border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2">
          {(['all', 'active', 'maintenance'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                'flex-1 h-9 rounded-xl text-xs font-semibold transition-colors',
                filter === f ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-500'
              )}
            >
              {f === 'all' ? `All (${counts.all})` : f === 'active' ? `Active (${counts.active})` : `Issues (${counts.maintenance})`}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 px-4 py-4 space-y-3">
        {error && (
          <div className="flex items-center gap-2 bg-red-50 rounded-2xl px-4 py-3 text-sm text-red-700">
            <AlertCircle className="w-4 h-4" /> {error}
          </div>
        )}

        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 bg-gray-100 rounded-2xl animate-pulse" />
          ))
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-300">
            <Cpu className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No equipment found</p>
          </div>
        ) : (
          filtered.map(asset => (
            <AssetCard
              key={asset.id}
              asset={asset}
              onReport={setReporting}
              onMarkActive={markActive}
              busy={updating === asset.id}
            />
          ))
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-sm font-medium px-5 py-3 rounded-2xl shadow-xl z-50 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-green-400" /> {toast}
        </div>
      )}

      {/* Report issue bottom sheet */}
      {reporting && (
        <ReportIssueSheet
          asset={reporting}
          onClose={() => setReporting(null)}
          onDone={handleReported}
        />
      )}
    </div>
  )
}
