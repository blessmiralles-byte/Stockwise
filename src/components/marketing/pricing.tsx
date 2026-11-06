'use client'

/**
 * The pricing block — the one part of the landing page that needs the browser,
 * because of the monthly/annual toggle.
 *
 * The region arrives as a prop, worked out on the server from the request's
 * country header. It used to be fetched here after the page had loaded, which
 * meant the HTML we served contained two pulsing grey boxes instead of the
 * prices — so crawlers, link previews and anyone on a slow connection saw a
 * pricing section with no prices in it. The server already had the answer.
 */

import { useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, Star, Minus } from 'lucide-react'
import { PLAN_CONFIG, monthlyPrice, annualPrice, type PricingRegion } from '@/lib/plan-config'
import { FEATURES as PLAN_FEATURES, featuresIntroducedAt } from '@/lib/entitlements'

// ── Pricing ───────────────────────────────────────────────────────────────────
export function Pricing({ region }: { region: PricingRegion }) {
  const [interval, setInterval] = useState<'monthly' | 'annual'>('monthly')

  const plans = [
    { key: 'starter' as const, highlight: false, cta: 'Start free trial' },
    { key: 'pro'     as const, highlight: true,  cta: 'Start free trial' },
  ]

  return (
    <section className="py-24 bg-white" id="pricing">
      <div className="max-w-5xl mx-auto px-6">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold text-slate-900 mb-3">Simple pricing.</h2>
          <p className="text-slate-500">
            Two plans. Start on either and move up when you need to. 14 days free,
            no credit card. Cancel anytime — no phone call, no email.
          </p>
        </div>

        {/* Monthly / Annual toggle */}
        <div className="flex justify-center mb-12">
          <div className="inline-flex items-center bg-slate-100 rounded-lg p-1 text-sm">
            <button onClick={() => setInterval('monthly')}
              className={`px-5 py-2 rounded-md font-medium transition-colors ${interval === 'monthly' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}`}>
              Monthly
            </button>
            <button onClick={() => setInterval('annual')}
              className={`px-5 py-2 rounded-md font-medium transition-colors flex items-center gap-2 ${interval === 'annual' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}`}>
              Annual
              <span className="text-[11px] font-semibold text-green-600 bg-green-100 rounded-full px-2 py-0.5">2 months free</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 items-start max-w-3xl mx-auto">
          {plans.map(({ key, highlight, cta }) => {
            const cfg = PLAN_CONFIG[key]
            return (
              <div
                key={key}
                className={`rounded-2xl border p-6 space-y-5 relative ${
                  highlight
                    ? 'border-indigo-300 bg-indigo-600 text-white shadow-xl shadow-indigo-200'
                    : 'border-slate-200 bg-white'
                }`}
              >
                {highlight && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-amber-400 text-amber-900 text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1">
                    {/* Not "Most Popular" — we have no customers to count yet. */}
                    <Star className="w-3 h-3" /> Recommended
                  </span>
                )}
                <div>
                  <p className={`font-bold text-lg ${highlight ? 'text-white' : 'text-slate-900'}`}>{cfg.label}</p>
                  {interval === 'annual' ? (
                    <>
                      <p className={`text-3xl font-extrabold mt-1 ${highlight ? 'text-white' : 'text-slate-900'}`}>
                        ${annualPrice(key, region).toLocaleString()}
                        <span className={`text-sm font-normal ${highlight ? 'text-indigo-200' : 'text-slate-500'}`}>/yr</span>
                      </p>
                      <p className={`text-xs mt-0.5 ${highlight ? 'text-indigo-200' : 'text-green-600'}`}>≈ ${Math.round(annualPrice(key, region) / 12)}/mo · 2 months free</p>
                    </>
                  ) : (
                    <p className={`text-3xl font-extrabold mt-1 ${highlight ? 'text-white' : 'text-slate-900'}`}>
                      ${monthlyPrice(key, region)}
                      <span className={`text-sm font-normal ${highlight ? 'text-indigo-200' : 'text-slate-500'}`}>/mo</span>
                    </p>
                  )}
                </div>
                <ul className="space-y-2">
                  {cfg.features.map(f => (
                    <li key={f} className={`flex items-start gap-2 text-sm ${highlight ? 'text-indigo-100' : 'text-slate-600'}`}>
                      <CheckCircle2 className={`w-4 h-4 flex-shrink-0 mt-0.5 ${highlight ? 'text-indigo-200' : 'text-green-500'}`} />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href={`/register?plan=${key}&interval=${interval}`}
                  className={`block text-center py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                    highlight
                      ? 'bg-white text-indigo-700 hover:bg-indigo-50'
                      : 'bg-indigo-600 text-white hover:bg-indigo-700'
                  }`}
                >
                  {cta}
                </Link>
              </div>
            )
          })}

        </div>

        <PlanComparison />

        <p className="text-center text-sm text-slate-500 mt-6">
          Your free trial includes everything in Pro. Need more than 15 users?{' '}
          <a href="mailto:hello@stocked.tech" className="font-medium text-indigo-600 hover:underline">Talk to us</a>.
        </p>
      </div>
    </section>
  )
}

// ── Starter vs Pro comparison ──────────────────────────────────────────────────
// Pro rows come from lib/entitlements.ts, so this table can't drift from what the
// app actually unlocks.
// Every Pro row carries a description (they come from entitlements.ts). When
// these were bare nouns, Starter read as a stub next to it — same visual
// weight, a third of the substance. Say what each one does.
const SHARED_ROWS: { label: string; description: string }[] = [
  { label: 'Inventory, locations & transfers', description: 'Live stock by location, with batch and expiry tracking.' },
  { label: 'Purchase orders & receiving',      description: 'Raise POs, receive partial deliveries, match vendor invoices.' },
  { label: 'Barcode scanning & mobile app',    description: 'Scan any barcode to pull up stock, a tool, or a PO from the field.' },
  { label: 'Stock counts with sign-off',       description: 'Count sheets, variance review, and posted adjustments.' },
  { label: 'Fixed assets & depreciation',      description: 'Asset register, four depreciation methods, disposal entries.' },
  { label: 'Tool custody',                     description: 'Who has what, when it\'s due back, and what\'s overdue.' },
  { label: 'Maintenance scheduling',           description: 'Service intervals, alerts before they fall due, signed-off history.' },
  { label: 'Reports & accounting export',      description: 'Valuation, movement, job materials, depreciation — CSV or Excel.' },
  { label: 'Audit log',                        description: 'Who changed what, and when — kept for every plan.' },
]

function PlanComparison() {
  const proRows = featuresIntroducedAt('pro').map(f => PLAN_FEATURES[f])
  const yes = <CheckCircle2 className="w-4 h-4 text-green-500 mx-auto" aria-label="Included" />
  const no  = <Minus className="w-4 h-4 text-slate-300 mx-auto" aria-label="Not included" />
  const row = (label: React.ReactNode, starter: React.ReactNode, pro: React.ReactNode, key: string) => (
    <tr key={key} className="border-t border-slate-100">
      <td className="py-3 pr-3 text-slate-700">{label}</td>
      <td className="py-3 px-2 text-center text-slate-600 w-20 sm:w-28">{starter}</td>
      <td className="py-3 px-2 text-center text-slate-900 font-medium w-20 sm:w-28 bg-indigo-50/60">{pro}</td>
    </tr>
  )
  return (
    <div className="mt-16 max-w-3xl mx-auto">
      <h3 className="text-xl font-bold text-slate-900 text-center mb-6">Compare plans</h3>
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className="text-left pb-3 font-semibold text-slate-500 text-xs uppercase tracking-wide">Feature</th>
            <th className="pb-3 font-semibold text-slate-900">Starter</th>
            <th className="pb-3 font-semibold text-indigo-700 bg-indigo-50/60 rounded-t-lg">Pro</th>
          </tr>
        </thead>
        <tbody>
          {row('Users', 'Up to 5', 'Up to 15', 'users')}
          {SHARED_ROWS.map(r => row(
            <>
              <span className="font-medium text-slate-900">{r.label}</span>
              <span className="block text-xs text-slate-500 mt-0.5">{r.description}</span>
            </>,
            yes, yes, r.label,
          ))}
          {proRows.map(f => row(
            <>
              <span className="font-medium text-slate-900">{f.label}</span>
              <span className="block text-xs text-slate-500 mt-0.5">{f.description}</span>
            </>,
            no, yes, f.label,
          ))}
          {row('Support', 'Email', 'Priority, same-day', 'support')}
          {row('We import your existing data for you', no, yes, 'import')}
        </tbody>
      </table>
    </div>
  )
}