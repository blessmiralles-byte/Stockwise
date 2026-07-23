'use client'

import Link from 'next/link'
import { useApi } from '@/lib/use-api'
import { cn } from '@/lib/utils'
import { CheckCircle2, ArrowRight, Sparkles, PartyPopper, Clock } from 'lucide-react'

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
}

/**
 * Guided, ordered setup checklist. Reads /api/onboarding/status and walks a
 * new owner through the recommended path — required steps first, optional
 * ones tagged. The next incomplete required step is highlighted with its CTA.
 */
export function GettingStartedGuide() {
  const { data, loading } = useApi<Status>('/api/onboarding/status')

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
    </div>
  )
}
