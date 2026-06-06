'use client'

import { useState, useCallback } from 'react'
import { useApi } from '@/lib/use-api'
import {
  Wrench, AlertCircle, CheckCircle2, Clock, Calendar,
  ChevronLeft, Plus, X, Loader2, Search, Cpu,
} from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/utils'

// ── Urgency helpers ───────────────────────────────────────────────────────────
function getUrgency(s: any): 'overdue' | 'today' | 'soon' | 'upcoming' {
  if (s.status === 'overdue') return 'overdue'
  if (s.status === 'completed') return 'upcoming'
  const d = new Date(s.scheduled_date)
  const t = new Date()
  const days = Math.ceil((d.getTime() - t.getTime()) / 86400000)
  if (d.toDateString() === t.toDateString()) return 'today'
  if (days <= 5) return 'soon'
  return 'upcoming'
}

const URGENCY_CFG = {
  overdue:  { label: 'OVERDUE', bar: 'bg-red-500',    badge: 'bg-red-100 text-red-700',    border: 'border-red-200',    icon: AlertCircle,  iconColor: 'text-red-600 bg-red-50'    },
  today:    { label: 'TODAY',   bar: 'bg-amber-500',  badge: 'bg-amber-100 text-amber-700', border: 'border-amber-200', icon: Clock,        iconColor: 'text-amber-600 bg-amber-50' },
  soon:     { label: 'SOON',    bar: 'bg-indigo-500', badge: 'bg-indigo-100 text-indigo-700', border: 'border-indigo-100', icon: Calendar, iconColor: 'text-indigo-600 bg-indigo-50' },
  upcoming: { label: '',        bar: 'bg-gray-300',   badge: 'bg-gray-100 text-gray-500',   border: 'border-gray-100',  icon: Calendar,     iconColor: 'text-gray-400 bg-gray-50'   },
}

// ── Mark Done sheet ───────────────────────────────────────────────────────────
function MarkDoneSheet({
  schedule,
  onClose,
  onDone,
}: {
  schedule: any
  onClose: () => void
  onDone: () => void
}) {
  const [performedBy, setPerformedBy] = useState('')
  const [notes, setNotes]             = useState('')
  const [cost, setCost]               = useState('')
  const [saving, setSaving]           = useState(false)
  const [error, setError]             = useState('')

  const submit = async () => {
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/maintenance/${schedule.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'completed',
          completed_date: new Date().toISOString().split('T')[0],
          performed_by: performedBy.trim() || undefined,
          notes: notes.trim() || undefined,
          cost: cost ? Number(cost) : undefined,
        }),
      })
      if (!res.ok) { const j = await res.json(); setError(j.error ?? 'Failed'); return }
      onDone()
    } catch {
      setError('Network error')
    } finally {
      setSaving(false)
    }
  }

  const urgency = getUrgency(schedule)
  const cfg = URGENCY_CFG[urgency]

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-lg bg-white rounded-t-3xl z-50 px-5 pt-5 pb-24 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-gray-900 text-lg">Mark as Done</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <div className="bg-gray-50 border border-gray-100 rounded-2xl px-4 py-3 mb-5">
          <p className="font-semibold text-gray-900 text-sm">{schedule.title}</p>
          <p className="text-xs text-gray-500 mt-0.5">{schedule.asset?.name} · {schedule.asset?.asset_tag}</p>
        </div>

        <div className="space-y-3">
          <input
            value={performedBy}
            onChange={e => setPerformedBy(e.target.value)}
            placeholder="Performed by (name or team)"
            className="w-full h-12 px-4 rounded-2xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          <div className="grid grid-cols-2 gap-3">
            <input
              type="number"
              value={cost}
              onChange={e => setCost(e.target.value)}
              placeholder="Cost ($)"
              min="0"
              step="0.01"
              className="h-12 px-4 rounded-2xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            <div className="h-12 px-4 rounded-2xl border border-gray-200 bg-gray-50 text-sm flex items-center text-gray-400">
              {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </div>
          </div>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Notes — what was done, parts replaced, observations…"
            rows={3}
            className="w-full px-4 py-3 rounded-2xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
          />
        </div>

        {error && (
          <div className="mt-3 flex items-center gap-2 bg-red-50 rounded-xl px-3 py-2.5 text-sm text-red-700">
            <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
          </div>
        )}

        <button
          onClick={submit}
          disabled={saving}
          className="mt-4 w-full h-14 bg-green-600 text-white rounded-2xl font-bold text-base active:bg-green-700 disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : <><CheckCircle2 className="w-4 h-4" /> Confirm Complete</>}
        </button>
      </div>
    </>
  )
}

// ── Schedule a New Task sheet ─────────────────────────────────────────────────
function NewTaskSheet({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { data: assetsData } = useApi<{ data: any[] }>('/api/assets?status=active')
  const assets = assetsData?.data ?? []

  const [assetId, setAssetId]   = useState('')
  const [title, setTitle]       = useState('')
  const [notes, setNotes]       = useState('')
  const [date, setDate]         = useState(new Date().toISOString().split('T')[0])
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')

  const submit = async () => {
    if (!assetId) { setError('Select an asset'); return }
    if (!title.trim()) { setError('Enter a task title'); return }
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/maintenance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asset_id: assetId,
          title: title.trim(),
          description: notes.trim() || undefined,
          scheduled_date: date,
          status: 'scheduled',
        }),
      })
      if (!res.ok) { const j = await res.json(); setError(j.error ?? 'Failed'); return }
      onDone()
    } catch {
      setError('Network error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-lg bg-white rounded-t-3xl z-50 px-5 pt-5 pb-24 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-bold text-gray-900 text-lg">Schedule Task</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>
        <div className="space-y-3">
          <select
            value={assetId}
            onChange={e => setAssetId(e.target.value)}
            className="w-full h-12 px-4 rounded-2xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">Select equipment…</option>
            {assets.map((a: any) => (
              <option key={a.id} value={a.id}>{a.name} ({a.asset_tag})</option>
            ))}
          </select>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Task title (e.g. Oil change, Filter replacement…)"
            className="w-full h-12 px-4 rounded-2xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="w-full h-12 px-4 rounded-2xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Notes or instructions…"
            rows={2}
            className="w-full px-4 py-3 rounded-2xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
          />
        </div>
        {error && (
          <div className="mt-3 flex items-center gap-2 bg-red-50 rounded-xl px-3 py-2.5 text-sm text-red-700">
            <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
          </div>
        )}
        <button
          onClick={submit}
          disabled={saving}
          className="mt-4 w-full h-14 bg-indigo-600 text-white rounded-2xl font-bold text-base active:bg-indigo-700 disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : 'Schedule Task'}
        </button>
      </div>
    </>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function FieldMaintenancePage() {
  const { data, loading, error, refetch } = useApi<{ data: any[] }>('/api/maintenance')
  const schedules = data?.data ?? []

  const [search, setSearch]     = useState('')
  const [filter, setFilter]     = useState<'all' | 'active' | 'completed'>('active')
  const [marking, setMarking]   = useState<any | null>(null)
  const [newTask, setNewTask]   = useState(false)
  const [updating, setUpdating] = useState<string | null>(null)
  const [toast, setToast]       = useState('')

  const filtered = schedules
    .filter(s => {
      const matchSearch = search === '' ||
        s.title?.toLowerCase().includes(search.toLowerCase()) ||
        s.asset?.name?.toLowerCase().includes(search.toLowerCase())
      const matchFilter =
        filter === 'all' ||
        (filter === 'active' && s.status !== 'completed') ||
        (filter === 'completed' && s.status === 'completed')
      return matchSearch && matchFilter
    })
    .sort((a, b) => {
      const order = { overdue: 0, today: 1, soon: 2, upcoming: 3 }
      const ua = order[getUrgency(a)] ?? 3
      const ub = order[getUrgency(b)] ?? 3
      if (ua !== ub) return ua - ub
      return new Date(a.scheduled_date).getTime() - new Date(b.scheduled_date).getTime()
    })

  const counts = {
    active:    schedules.filter(s => s.status !== 'completed').length,
    overdue:   schedules.filter(s => s.status === 'overdue').length,
    completed: schedules.filter(s => s.status === 'completed').length,
  }

  const handleDone = useCallback(async () => {
    setMarking(null)
    await refetch?.()
    setToast('Task marked complete ✓')
    setTimeout(() => setToast(''), 2500)
  }, [refetch])

  const handleNewDone = useCallback(async () => {
    setNewTask(false)
    await refetch?.()
    setToast('Task scheduled ✓')
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
          <h1 className="font-bold text-gray-900 text-lg flex-1">Maintenance Tasks</h1>
          {counts.overdue > 0 && (
            <span className="bg-red-100 text-red-700 text-xs font-bold px-2.5 py-1 rounded-full">
              {counts.overdue} overdue
            </span>
          )}
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search tasks or equipment…"
            className="w-full h-11 pl-11 pr-4 rounded-2xl border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div className="flex gap-2">
          {([
            { key: 'active',    label: `Open (${counts.active})` },
            { key: 'completed', label: `Done (${counts.completed})` },
            { key: 'all',       label: 'All' },
          ] as const).map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                'flex-1 h-9 rounded-xl text-xs font-semibold transition-colors',
                filter === f.key ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-500'
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Task list */}
      <div className="flex-1 px-4 py-4 space-y-3 pb-24">
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
            <Wrench className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">{filter === 'active' ? 'No open tasks 🎉' : 'No tasks found'}</p>
          </div>
        ) : (
          filtered.map(s => {
            const urgency = getUrgency(s)
            const cfg = URGENCY_CFG[urgency]
            const UIcon = cfg.icon
            const daysLeft = Math.ceil((new Date(s.scheduled_date).getTime() - Date.now()) / 86400000)

            return (
              <div
                key={s.id}
                className={cn('bg-white rounded-2xl border overflow-hidden shadow-sm', cfg.border)}
              >
                {/* Urgency bar */}
                {s.status !== 'completed' && (
                  <div className={cn('h-1', cfg.bar)} />
                )}
                <div className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0', cfg.iconColor)}>
                      {s.status === 'completed'
                        ? <CheckCircle2 className="w-5 h-5 text-green-600" />
                        : <UIcon className="w-5 h-5" />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold text-gray-900">{s.title}</p>
                        {cfg.label && s.status !== 'completed' && (
                          <span className={cn('text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0', cfg.badge)}>
                            {cfg.label}
                          </span>
                        )}
                        {s.status === 'completed' && (
                          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700 flex-shrink-0">
                            DONE
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5 truncate">
                        {s.asset?.name} · {s.asset?.asset_tag}
                      </p>
                      <div className="flex items-center gap-3 mt-2 text-xs text-gray-400 flex-wrap">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {formatDate(s.scheduled_date)}
                        </span>
                        {s.status === 'scheduled' && daysLeft > 0 && daysLeft <= 10 && (
                          <span className={daysLeft <= 3 ? 'text-amber-600 font-medium' : ''}>
                            {daysLeft}d left
                          </span>
                        )}
                        {s.completed_date && (
                          <span className="text-green-600 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            Done {formatDate(s.completed_date)}
                          </span>
                        )}
                        {s.performed_by && (
                          <span>{s.performed_by}</span>
                        )}
                        {s.cost > 0 && (
                          <span className="font-medium text-gray-600">${Number(s.cost).toFixed(2)}</span>
                        )}
                      </div>
                      {s.notes && (
                        <p className="text-xs text-gray-400 mt-1.5 italic truncate">{s.notes}</p>
                      )}
                    </div>
                  </div>

                  {/* Action button */}
                  {s.status !== 'completed' && (
                    <button
                      onClick={() => setMarking(s)}
                      className={cn(
                        'mt-3.5 w-full h-11 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-colors active:scale-[0.98]',
                        urgency === 'overdue'
                          ? 'bg-red-600 text-white active:bg-red-700'
                          : urgency === 'today'
                          ? 'bg-amber-500 text-white active:bg-amber-600'
                          : 'bg-gray-100 text-gray-700 active:bg-gray-200'
                      )}
                    >
                      {updating === s.id
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <><CheckCircle2 className="w-4 h-4" /> {urgency === 'overdue' ? 'Resolve Now' : 'Mark Done'}</>
                      }
                    </button>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* FAB — Schedule new task */}
      <button
        onClick={() => setNewTask(true)}
        className="fixed bottom-20 right-4 w-14 h-14 bg-indigo-600 text-white rounded-2xl shadow-lg shadow-indigo-200 flex items-center justify-center active:bg-indigo-700 transition-colors z-30"
      >
        <Plus className="w-6 h-6 stroke-[2.5]" />
      </button>

      {/* Toast */}
      {toast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-sm font-medium px-5 py-3 rounded-2xl shadow-xl z-50 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-green-400" /> {toast}
        </div>
      )}

      {/* Mark done sheet */}
      {marking && (
        <MarkDoneSheet
          schedule={marking}
          onClose={() => setMarking(null)}
          onDone={handleDone}
        />
      )}

      {/* New task sheet */}
      {newTask && (
        <NewTaskSheet
          onClose={() => setNewTask(false)}
          onDone={handleNewDone}
        />
      )}
    </div>
  )
}
