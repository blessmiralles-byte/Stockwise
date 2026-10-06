'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useApi } from '@/lib/use-api'
import { cn } from '@/lib/utils'
import {
  CheckCircle2, ArrowRight, Sparkles, PartyPopper, Clock, Loader2, Wand2, Trash2,
  Smartphone, ShoppingCart, BookOpen, ShieldCheck,
} from 'lucide-react'

interface Step {
  id:          string
  label:       string
  description: string
  done:        boolean
  href:        string
  cta:         string
  optional:    boolean
  estMin:      number
}

interface Status {
  steps:         Step[]
  completedCount: number
  totalSteps:    number
  requiredDone:  number
  requiredTotal: number
  allDone:       boolean
  sampleLoaded:  boolean
}

/**
 * A new account shows zeros everywhere, which says nothing about what the app
 * does. This loads a small contractor setup - stock, a low-stock alert, a
 * draft order, a couple of tools - and removes it again exactly.
 */
function SampleDataCard({ loaded, onChange }: { loaded: boolean; onChange: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const run = async (method: 'POST' | 'DELETE') => {
    setBusy(true); setError('')
    try {
      const res = await fetch('/api/onboarding/sample', { method })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'That did not work'); return }
      onChange()
    } catch {
      setError('Network error - please try again.')
    } finally { setBusy(false) }
  }

  return (
    <div className={cn('rounded-2xl border p-4', loaded ? 'border-amber-200 bg-amber-50/60' : 'border-slate-200 bg-white')}>
      <div className="flex items-start gap-3">
        <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0',
          loaded ? 'bg-amber-100' : 'bg-slate-100')}>
          <Wand2 className={cn('w-4 h-4', loaded ? 'text-amber-700' : 'text-slate-500')} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-900">
            {loaded ? 'Sample data is loaded' : 'Want to look around first?'}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            {loaded
              ? 'Everything marked [Sample] is ours, not yours. Remove it whenever you like - your own data is untouched.'
              : 'Load a small example - stock across a warehouse and a van, an item below its reorder point, a draft purchase order and two tools. Remove it in one click.'}
          </p>
          {error && <p className="text-xs text-red-600 mt-1.5">{error}</p>}
        </div>
        <button
          onClick={() => run(loaded ? 'DELETE' : 'POST')}
          disabled={busy}
          className={cn('flex-shrink-0 self-center inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50',
            loaded
              ? 'border border-amber-300 text-amber-800 hover:bg-amber-100'
              : 'border border-slate-200 text-slate-700 hover:bg-slate-50')}
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : loaded ? <Trash2 className="w-3.5 h-3.5" /> : <Wand2 className="w-3.5 h-3.5" />}
          {loaded ? 'Remove sample data' : 'Load sample data'}
        </button>
      </div>
    </div>
  )
}

/** Where to go once the account is actually set up. */
const NEXT_STEPS = [
  { icon: Smartphone,  title: 'Put it in your crew’s hands', body: 'They log materials, receive deliveries and check out tools from their phone.', href: '/field', cta: 'Open field view' },
  { icon: ShoppingCart, title: 'Let stock ask for itself', body: 'Reorder points email procurement and draft the purchase order, grouped by vendor.', href: '/reorder', cta: 'See reorder list' },
  { icon: ShieldCheck,  title: 'Keep tools in date', body: 'Inspection and calibration certificates live with the tool, flagged before they lapse.', href: '/maintenance', cta: 'Schedule a check' },
  { icon: BookOpen,     title: 'Hand your accountant a journal', body: 'Double-entry lines for QuickBooks, Xero or MYOB - Excel or CSV.', href: '/reports/accounting-export', cta: 'Open export' },
]

/**
 * Guided, ordered setup checklist. Reads /api/onboarding/status and walks a
 * new owner through the recommended path — required steps first, optional
 * ones tagged. The next incomplete required step is highlighted with its CTA.
 */
export function GettingStartedGuide() {
  const { data, loading, refetch } = useApi<Status>('/api/onboarding/status')

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4].map(i => <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse" />)}
      </div>
    )
  }
  if (!data) return null

  const { steps, completedCount, totalSteps, requiredDone, requiredTotal } = data
  const pct = Math.round((completedCount / totalSteps) * 100)

  // The first not-done step (required steps come first in the array) is the
  // one we actively spotlight.
  const nextId = steps.find(s => !s.done)?.id ?? null
  const essentialsDone = requiredDone >= requiredTotal

  return (
    <div className="space-y-5">
      {/* Try before you type anything in */}
      {(!essentialsDone || data.sampleLoaded) && (
        <SampleDataCard loaded={!!data.sampleLoaded} onChange={refetch} />
      )}

      {/* Header + progress */}
      <div className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-white p-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center flex-shrink-0">
            {essentialsDone
              ? <PartyPopper className="w-5 h-5 text-indigo-600" />
              : <Sparkles className="w-5 h-5 text-indigo-600" />}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-slate-900">
              {essentialsDone ? "You're up and running 🎉" : 'Get set up in a few steps'}
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">
              {essentialsDone
                ? 'The essentials are done. The optional steps below make Stocked even more powerful.'
                : 'Follow these in order — each links straight to the right place. You can bulk-import most of it from CSV/Excel.'}
            </p>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <div className="flex-1 bg-indigo-100 rounded-full h-2">
            <div className="bg-indigo-500 h-2 rounded-full transition-all" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-xs font-medium text-indigo-700 whitespace-nowrap">
            {completedCount} of {totalSteps} done
          </span>
        </div>
      </div>

      {/* Steps */}
      <ol className="space-y-2.5">
        {steps.map((step, i) => {
          const isNext = step.id === nextId
          return (
            <li
              key={step.id}
              className={cn(
                'rounded-xl border p-4 transition-colors',
                step.done
                  ? 'border-slate-100 bg-slate-50/60'
                  : isNext
                    ? 'border-indigo-300 bg-white shadow-sm ring-1 ring-indigo-100'
                    : 'border-slate-200 bg-white'
              )}
            >
              <div className="flex items-start gap-3">
                {/* Status / number */}
                <div className="flex-shrink-0 mt-0.5">
                  {step.done ? (
                    <CheckCircle2 className="w-6 h-6 text-green-500" />
                  ) : (
                    <div className={cn(
                      'w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold',
                      isNext ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400'
                    )}>
                      {i + 1}
                    </div>
                  )}
                </div>

                {/* Body */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className={cn(
                      'text-sm font-semibold',
                      step.done ? 'text-slate-500' : 'text-slate-900'
                    )}>
                      {step.label}
                    </p>
                    {step.optional && (
                      <span className="text-[10px] uppercase tracking-wide font-semibold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                        Optional
                      </span>
                    )}
                    {!step.done && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                        <Clock className="w-3 h-3" /> ~{step.estMin} min
                      </span>
                    )}
                  </div>
                  {!step.done && (
                    <p className="text-xs text-slate-500 mt-1">{step.description}</p>
                  )}
                </div>

                {/* CTA */}
                {step.done ? (
                  <span className="text-xs font-medium text-green-600 flex-shrink-0 self-center">Done</span>
                ) : (
                  <Link
                    href={step.href}
                    className={cn(
                      'flex-shrink-0 self-center inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors',
                      isNext
                        ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                        : 'border border-slate-200 text-slate-700 hover:bg-slate-50'
                    )}
                  >
                    {step.cta}
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                )}
              </div>
            </li>
          )
        })}
      </ol>

      {/* Where to go once the basics are done */}
      {essentialsDone && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-sm font-semibold text-slate-900">Where to go next</p>
          <p className="text-xs text-slate-500 mt-0.5">
            The parts that save the most time once your data is in.
          </p>
          <div className="grid sm:grid-cols-2 gap-3 mt-4">
            {NEXT_STEPS.map(n => (
              <Link key={n.href} href={n.href}
                className="flex items-start gap-3 rounded-xl border border-slate-200 p-3 hover:border-indigo-300 hover:shadow-sm transition-all group">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center flex-shrink-0">
                  <n.icon className="w-4 h-4 text-indigo-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900 group-hover:text-indigo-700 transition-colors">{n.title}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{n.body}</p>
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 mt-1.5">
                    {n.cta} <ArrowRight className="w-3 h-3" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
