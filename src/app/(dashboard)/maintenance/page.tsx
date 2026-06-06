'use client'

import { useState, useCallback } from 'react'
import { Topbar } from '@/components/layout/topbar'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useApi } from '@/lib/use-api'
import { formatCurrency, formatDate } from '@/lib/utils'
import {
  Search, Plus, Wrench, Bell, CheckCircle2, Clock,
  AlertCircle, Calendar, Loader2, X,
} from 'lucide-react'

const statusConfig: Record<string, { label: string; variant: any; icon: any; color: string }> = {
  scheduled: { label: 'Scheduled', variant: 'default',     icon: Clock,        color: 'text-indigo-600 bg-indigo-50' },
  overdue:   { label: 'Overdue',   variant: 'destructive', icon: AlertCircle,  color: 'text-red-600 bg-red-50'       },
  completed: { label: 'Completed', variant: 'success',     icon: CheckCircle2, color: 'text-green-600 bg-green-50'   },
}

// ── Schedule Maintenance Dialog ───────────────────────────────────────────────
function ScheduleDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { data: assetsData } = useApi<{ data: any[] }>('/api/assets')
  const assets = (assetsData?.data ?? []).filter((a: any) => a.status !== 'disposed')

  const [assetId,        setAssetId]        = useState('')
  const [title,          setTitle]          = useState('')
  const [description,    setDescription]    = useState('')
  const [scheduledDate,  setScheduledDate]  = useState(new Date().toISOString().split('T')[0])
  const [notifyBefore,   setNotifyBefore]   = useState('3')
  const [saving,         setSaving]         = useState(false)
  const [error,          setError]          = useState('')

  const TASK_PRESETS = [
    'Oil change', 'Filter replacement', 'Brake inspection',
    'Tyre rotation', 'Lubrication', 'Battery check',
    'Belt/hose inspection', 'Annual service', 'Safety inspection',
  ]

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!assetId)       { setError('Please select an asset'); return }
    if (!title.trim())  { setError('Please enter a task title'); return }
    if (!scheduledDate) { setError('Please set a scheduled date'); return }

    setSaving(true); setError('')
    try {
      const res = await fetch('/api/maintenance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asset_id:           assetId,
          title:              title.trim(),
          description:        description.trim() || undefined,
          scheduled_date:     scheduledDate,
          notify_days_before: Number(notifyBefore) || 3,
          status:             'scheduled',
        }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Failed to schedule maintenance'); return }
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">

        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Schedule Maintenance</h2>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="w-4 h-4" /></Button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Asset */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Asset / Equipment <span className="text-red-500">*</span>
            </label>
            <select
              value={assetId}
              onChange={e => setAssetId(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
              required
            >
              <option value="">Select an asset…</option>
              {assets.map((a: any) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.asset_tag}){a.status === 'maintenance' ? ' — In Maintenance' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Title with quick-select presets */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Task Title <span className="text-red-500">*</span>
            </label>
            <Input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Oil change, Annual inspection…"
              required
            />
            <div className="flex flex-wrap gap-1.5 mt-2">
              {TASK_PRESETS.map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setTitle(p)}
                  className="text-xs px-2 py-1 rounded-full border border-slate-200 text-slate-500 hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Scheduled date */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Scheduled Date <span className="text-red-500">*</span>
            </label>
            <Input
              type="date"
              value={scheduledDate}
              onChange={e => setScheduledDate(e.target.value)}
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Instructions / Notes
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Checklist, parts needed, procedures…"
              rows={3}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </div>

          {/* Notify days before */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1 flex items-center gap-1">
              <Bell className="w-3.5 h-3.5" /> Notify how many days before?
            </label>
            <div className="flex gap-2">
              {['1', '3', '5', '7', '14'].map(d => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setNotifyBefore(d)}
                  className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    notifyBefore === d
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                      : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  {d}d
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
              <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving} className="gap-2">
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {saving ? 'Scheduling…' : 'Schedule'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Mark Done Dialog ──────────────────────────────────────────────────────────
function MarkDoneDialog({
  schedule,
  onClose,
  onSaved,
}: {
  schedule: any
  onClose: () => void
  onSaved: () => void
}) {
  const [performedBy, setPerformedBy] = useState('')
  const [notes,       setNotes]       = useState('')
  const [cost,        setCost]        = useState('')
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError('')
    try {
      const res = await fetch(`/api/maintenance/${schedule.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status:         'completed',
          completed_date: new Date().toISOString().split('T')[0],
          performed_by:   performedBy.trim() || undefined,
          notes:          notes.trim()       || undefined,
          cost:           cost               ? Number(cost) : undefined,
        }),
      })
      if (!res.ok) { const j = await res.json(); setError(j.error ?? 'Failed'); return }
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Mark as Done</h2>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="w-4 h-4" /></Button>
        </div>

        <div className="bg-slate-50 rounded-lg px-3 py-2.5 text-sm">
          <p className="font-medium text-slate-900">{schedule.title}</p>
          <p className="text-xs text-slate-500 mt-0.5">{schedule.asset?.name} ({schedule.asset?.asset_tag})</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Performed By</label>
            <Input value={performedBy} onChange={e => setPerformedBy(e.target.value)} placeholder="Name or team…" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Cost</label>
              <Input type="number" min="0" step="0.01" placeholder="0.00" value={cost} onChange={e => setCost(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Completed Date</label>
              <Input type="date" defaultValue={new Date().toISOString().split('T')[0]} disabled className="bg-slate-50" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="What was done, parts replaced, observations…"
              rows={3}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </div>
          {error && <p className="text-red-500 text-xs">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving} className="gap-2 bg-green-600 hover:bg-green-700">
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <CheckCircle2 className="w-3.5 h-3.5" />
              {saving ? 'Saving…' : 'Confirm Complete'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function MaintenancePage() {
  const [search,       setSearch]       = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [showSchedule, setShowSchedule] = useState(false)
  const [markingDone,  setMarkingDone]  = useState<any | null>(null)

  const { data, loading, error, refetch } = useApi<{ data: any[] }>('/api/maintenance')
  const schedules = data?.data ?? []

  const today = new Date()
  const withDays = schedules.map((s: any) => ({
    ...s,
    daysLeft: Math.ceil((new Date(s.scheduled_date).getTime() - today.getTime()) / 86400000),
  }))

  const filtered = withDays.filter((s: any) => {
    const matchSearch =
      (s.asset?.name ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (s.title ?? '').toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'all' || s.status === statusFilter
    return matchSearch && matchStatus
  })

  const countByStatus = (st: string) => schedules.filter((s: any) => s.status === st).length

  const summaryStats = [
    { label: 'Scheduled',            count: countByStatus('scheduled'), icon: Clock,        color: 'bg-indigo-50 text-indigo-600' },
    { label: 'Overdue',              count: countByStatus('overdue'),   icon: AlertCircle,  color: 'bg-red-50 text-red-600'       },
    { label: 'Completed this month', count: countByStatus('completed'), icon: CheckCircle2, color: 'bg-green-50 text-green-600'   },
  ]

  return (
    <div>
      <Topbar title="Maintenance" />
      <div className="p-6 space-y-5">

        <div className="grid grid-cols-3 gap-4">
          {summaryStats.map(s => (
            <Card key={s.label}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${s.color}`}>
                    <s.icon className="w-4 h-4" />
                  </div>
                  <div>
                    {loading
                      ? <Skeleton className="h-6 w-8 mb-1" />
                      : <p className="text-xl font-bold text-slate-900">{s.count}</p>}
                    <p className="text-xs text-slate-500">{s.label}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap flex-1">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Search asset or maintenance type..."
                className="pl-9"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <div className="flex gap-1">
              {['all', 'scheduled', 'overdue', 'completed'].map(s => (
                <Button key={s} size="sm" variant={statusFilter === s ? 'default' : 'outline'}
                  onClick={() => setStatusFilter(s)} className="capitalize text-xs">
                  {s === 'all' ? 'All' : statusConfig[s]?.label ?? s}
                </Button>
              ))}
            </div>
          </div>
          <Button className="gap-2" onClick={() => setShowSchedule(true)}>
            <Plus className="w-4 h-4" /> Schedule Maintenance
          </Button>
        </div>

        {error && <p className="text-red-500 text-sm">{error}</p>}

        <div className="space-y-3">
          {loading
            ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)
            : filtered.map((schedule: any) => {
              const cfg = statusConfig[schedule.status] ?? statusConfig.scheduled
              const StatusIcon = cfg.icon
              return (
                <Card key={schedule.id} className={schedule.status === 'overdue' ? 'border-red-200' : ''}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${cfg.color}`}>
                          <StatusIcon className="w-4 h-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-semibold text-slate-900">{schedule.title}</h3>
                            <Badge variant={cfg.variant}>{cfg.label}</Badge>
                            {schedule.status === 'scheduled' && schedule.daysLeft <= 5 && schedule.daysLeft >= 0 && (
                              <Badge variant="destructive">Urgent — {schedule.daysLeft}d left</Badge>
                            )}
                          </div>
                          <p className="text-sm text-slate-500 mt-0.5">
                            {schedule.asset?.name} ({schedule.asset?.asset_tag})
                          </p>
                          {schedule.description && (
                            <p className="text-xs text-slate-400 mt-1 line-clamp-2">{schedule.description}</p>
                          )}
                          <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-slate-400">
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {formatDate(schedule.scheduled_date)}
                            </span>
                            {schedule.completed_date && (
                              <span className="flex items-center gap-1 text-green-600">
                                <CheckCircle2 className="w-3 h-3" />
                                Done {formatDate(schedule.completed_date)}
                              </span>
                            )}
                            {schedule.performed_by && (
                              <span className="flex items-center gap-1">
                                <Wrench className="w-3 h-3" />{schedule.performed_by}
                              </span>
                            )}
                            {schedule.cost > 0 && (
                              <span className="font-medium text-slate-600">{formatCurrency(schedule.cost)}</span>
                            )}
                            <span className="flex items-center gap-1">
                              <Bell className="w-3 h-3" />
                              Notify {schedule.notify_days_before}d before
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-2 flex-shrink-0">
                        {schedule.status !== 'completed' && (
                          <Button
                            size="sm"
                            variant={schedule.status === 'overdue' ? 'default' : 'outline'}
                            className={`text-xs gap-1.5 ${schedule.status === 'overdue' ? 'bg-red-600 hover:bg-red-700' : ''}`}
                            onClick={() => setMarkingDone(schedule)}
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            {schedule.status === 'overdue' ? 'Resolve' : 'Mark Done'}
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })
          }
          {!loading && filtered.length === 0 && (
            <p className="text-center py-12 text-slate-400">No maintenance schedules found</p>
          )}
        </div>
      </div>

      {showSchedule && (
        <ScheduleDialog
          onClose={() => setShowSchedule(false)}
          onSaved={() => { setShowSchedule(false); refetch?.() }}
        />
      )}

      {markingDone && (
        <MarkDoneDialog
          schedule={markingDone}
          onClose={() => setMarkingDone(null)}
          onSaved={() => { setMarkingDone(null); refetch?.() }}
        />
      )}
    </div>
  )
}
