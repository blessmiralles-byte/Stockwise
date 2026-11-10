import type { Metadata } from 'next'
import Link from 'next/link'
import {
  Wrench, ArrowRight, CheckCircle2, QrCode, Users, CalendarClock, PackageX,
  History, BellRing, Smartphone, Minus,
} from 'lucide-react'
import { PLAN_CONFIG, FREE_TOOL_LIMIT, monthlyPrice, annualPrice, isPricingRegion } from '@/lib/plan-config'
import { requestPricingRegion } from '@/lib/pricing-region-server'
import { AttributionTracker } from '@/components/marketing/attribution-tracker'

/**
 * Stocked Tools — the tool tracker sold on its own.
 *
 * A separate page from the main site because it is a separate pitch: "do you
 * know who has your tools?" needs none of the inventory and purchasing story,
 * and is answered the same afternoon. Priced per region, so like the home page
 * it reads the visitor's country from the request and puts the real price in
 * the HTML.
 */

export const metadata: Metadata = {
  title: 'Tool Tracking for Contractors',
  description:
    `Know who has every tool and when it’s due back. Check tools out to your crew by QR code — free for up to ${FREE_TOOL_LIMIT} tools, no credit card.`,
  alternates: { canonical: '/tools' },
}

const SIGNUP = '/register?product=tools'

const STEPS = [
  { icon: QrCode,        title: 'Label it',     desc: 'Add a tool, print its QR label, stick it on. A name is all it needs.' },
  { icon: Smartphone,    title: 'Scan it out',  desc: 'Find the tool, pick who’s taking it and when it’s due back. Ten seconds at the tool room door.' },
  { icon: CalendarClock, title: 'Get it back',  desc: 'See what’s out and what’s overdue at a glance — and get told before you have to ask.' },
]

const FEATURES = [
  { icon: Users,        title: 'Who has what',            desc: 'Every tool shows who’s holding it, which job it’s on, and when it’s due back. Your crew don’t need logins to be on the list.' },
  { icon: BellRing,     title: 'Overdue reminders',       desc: 'An email the day a tool goes overdue, and once a week while it stays out. A due date that actually does something.' },
  { icon: History,      title: 'Who had it last',         desc: 'The full history of every tool and every person — the first question you ask when something goes missing.' },
  { icon: PackageX,     title: 'Lost, stolen & damaged',  desc: 'A tool that comes back broken goes to maintenance, not back on the shelf. One that doesn’t come back is reported from site in seconds.' },
  { icon: QrCode,       title: 'QR labels, any brand',    desc: 'Print labels for whatever you own. Nothing to buy from a tool maker, and it works the same for every brand in the van.' },
  { icon: CalendarClock, title: 'Inspections & service',  desc: 'Service intervals and certificate dates stay with the tool, so nothing goes out uncertified.' },
]

const ROWS: { label: string; free: string | boolean; paid: string | boolean }[] = [
  { label: 'Tools',                                 free: `Up to ${FREE_TOOL_LIMIT}`, paid: 'Unlimited' },
  { label: 'Team logins',                           free: String(PLAN_CONFIG.tools_free.maxUsers), paid: String(PLAN_CONFIG.tools.maxUsers) },
  { label: 'Borrowers (no login needed)',           free: 'Unlimited', paid: 'Unlimited' },
  { label: 'Check-out, check-in & due dates',       free: true,  paid: true },
  { label: 'QR labels & phone scanning',            free: true,  paid: true },
  { label: 'Lost, stolen & damaged reports',        free: true,  paid: true },
  { label: 'Inspections & service schedules',       free: true,  paid: true },
  { label: 'Overdue reminders by email',            free: false, paid: true },
  { label: 'Tool history by tool and by person',    free: false, paid: true },
  { label: 'Excel export',                          free: false, paid: true },
]

function Cell({ v }: { v: string | boolean }) {
  if (v === true)  return <CheckCircle2 className="w-4 h-4 text-green-500 mx-auto" aria-label="Included" />
  if (v === false) return <Minus className="w-4 h-4 text-slate-300 mx-auto" aria-label="Not included" />
  return <>{v}</>
}

export default async function StockedToolsPage({
  searchParams,
}: {
  searchParams: Promise<{ region?: string }>
}) {
  // ?region= previews the other price band — never in production, so the page
  // can't be made to show a price checkout won't charge.
  const { region: override } = await searchParams
  const isProd = process.env.VERCEL_ENV === 'production'
  const region = !isProd && isPricingRegion(override) ? override : await requestPricingRegion()
  const PRICE  = monthlyPrice('tools', region)
  const YEARLY = annualPrice('tools', region)

  return (
    <div className="min-h-screen">
      <AttributionTracker />

      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-indigo-950/90 backdrop-blur-sm border-b border-indigo-900/60">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/tools" className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center">
              <Wrench className="w-4 h-4 text-white" strokeWidth={2.5} />
            </div>
            <span className="text-white font-bold text-lg tracking-tight">Stocked Tools</span>
          </Link>
          <div className="hidden lg:flex items-center gap-6 text-sm text-indigo-300">
            <a href="#how"      className="hover:text-white transition-colors">How it works</a>
            <a href="#features" className="hover:text-white transition-colors">Features</a>
            <a href="#pricing"  className="hover:text-white transition-colors">Pricing</a>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm text-indigo-300 hover:text-white transition-colors">Sign in</Link>
            <Link href={SIGNUP} className="text-sm px-4 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white font-semibold transition-colors">
              Start free
            </Link>
          </div>
        </div>
      </nav>

      <div className="pt-16">
        {/* Hero */}
        <section className="relative overflow-hidden bg-gradient-to-br from-indigo-950 via-indigo-900 to-slate-900 text-white">
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:64px_64px]" />
          <div className="relative max-w-6xl mx-auto px-6 pt-24 pb-28 text-center">
            <div className="inline-flex items-center gap-2 bg-indigo-800/60 border border-indigo-700/50 text-indigo-200 text-xs font-medium px-3 py-1.5 rounded-full mb-8">
              <Wrench className="w-3.5 h-3.5" />
              Free for up to {FREE_TOOL_LIMIT} tools · No credit card
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-tight mb-6">
              Know who has<br />
              <span className="text-indigo-300">every tool</span>
            </h1>
            <p className="text-lg text-indigo-200 max-w-2xl mx-auto mb-10">
              Tool tracking for contractors. Scan a tool out to your crew, see when
              it&apos;s due back, and hear about it when it isn&apos;t.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link href={SIGNUP}
                className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white font-semibold text-sm transition-colors shadow-lg shadow-indigo-900/40">
                Start free <ArrowRight className="w-4 h-4" />
              </Link>
              <a href="#how"
                className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-sm transition-colors border border-white/10">
                See how it works
              </a>
            </div>
            <p className="text-xs text-indigo-400 mt-5">
              In use the same afternoon. No time limit on the free plan.
            </p>
          </div>
        </section>

        {/* How it works */}
        <section className="py-20 bg-white border-b border-slate-100" id="how">
          <div className="max-w-4xl mx-auto px-6">
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 text-center mb-12">
              Three steps, no training
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              {STEPS.map((s, i) => (
                <div key={s.title} className="p-5 rounded-2xl bg-slate-50 border border-slate-100">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-semibold flex items-center justify-center">{i + 1}</span>
                    <s.icon className="w-5 h-5 text-indigo-600" />
                  </div>
                  <h3 className="font-semibold text-slate-900 mb-1.5">{s.title}</h3>
                  <p className="text-sm text-slate-500 leading-relaxed">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="py-24 bg-slate-50" id="features">
          <div className="max-w-6xl mx-auto px-6">
            <div className="text-center mb-14">
              <h2 className="text-3xl font-bold text-slate-900 mb-3">
                Tool tracking and equipment check-out, without the spreadsheet
              </h2>
              <p className="text-slate-500 max-w-xl mx-auto">
                Built for crews of 2 to 20 with mixed-brand tools and no time for software.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {FEATURES.map(f => (
                <div key={f.title} className="p-6 rounded-2xl border border-slate-100 bg-white">
                  <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center mb-4">
                    <f.icon className="w-5 h-5 text-indigo-600" />
                  </div>
                  <h3 className="font-semibold text-slate-900 mb-2">{f.title}</h3>
                  <p className="text-sm text-slate-500 leading-relaxed">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section className="py-24 bg-white" id="pricing">
          <div className="max-w-3xl mx-auto px-6">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold text-slate-900 mb-3">Simple pricing.</h2>
              <p className="text-slate-500">
                Free while you&apos;re small. One flat price when you&apos;re not — not per tool, not per person.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 items-start">
              <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-5">
                <div>
                  <p className="font-bold text-lg text-slate-900">Free</p>
                  <p className="text-3xl font-extrabold mt-1 text-slate-900">$0</p>
                  <p className="text-xs mt-0.5 text-slate-500">Up to {FREE_TOOL_LIMIT} tools, for as long as you like</p>
                </div>
                <ul className="space-y-2">
                  {PLAN_CONFIG.tools_free.features.map(f => (
                    <li key={f} className="flex items-start gap-2 text-sm text-slate-600">
                      <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5 text-green-500" />{f}
                    </li>
                  ))}
                </ul>
                <Link href={SIGNUP} className="block text-center py-2.5 rounded-xl text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors">
                  Start free
                </Link>
              </div>

              <div className="rounded-2xl border border-indigo-300 bg-indigo-600 text-white shadow-xl shadow-indigo-200 p-6 space-y-5">
                <div>
                  <p className="font-bold text-lg">{PLAN_CONFIG.tools.label}</p>
                  <p className="text-3xl font-extrabold mt-1">
                    ${PRICE}<span className="text-sm font-normal text-indigo-200">/mo</span>
                  </p>
                  <p className="text-xs mt-0.5 text-indigo-200">or ${YEARLY}/yr — 2 months free</p>
                </div>
                <ul className="space-y-2">
                  {PLAN_CONFIG.tools.features.map(f => (
                    <li key={f} className="flex items-start gap-2 text-sm text-indigo-100">
                      <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5 text-indigo-200" />{f}
                    </li>
                  ))}
                </ul>
                <Link href={SIGNUP} className="block text-center py-2.5 rounded-xl text-sm font-semibold bg-white text-indigo-700 hover:bg-indigo-50 transition-colors">
                  Start free, upgrade when you need to
                </Link>
              </div>
            </div>

            <table className="w-full text-sm mt-14">
              <thead>
                <tr>
                  <th className="text-left pb-3 font-semibold text-slate-500 text-xs uppercase tracking-wide">Compare</th>
                  <th className="pb-3 font-semibold text-slate-900 w-24 sm:w-32">Free</th>
                  <th className="pb-3 font-semibold text-indigo-700 bg-indigo-50/60 rounded-t-lg w-24 sm:w-32">${PRICE}/mo</th>
                </tr>
              </thead>
              <tbody>
                {ROWS.map(r => (
                  <tr key={r.label} className="border-t border-slate-100">
                    <td className="py-3 pr-3 text-slate-700">{r.label}</td>
                    <td className="py-3 px-2 text-center text-slate-600"><Cell v={r.free} /></td>
                    <td className="py-3 px-2 text-center text-slate-900 font-medium bg-indigo-50/60"><Cell v={r.paid} /></td>
                  </tr>
                ))}
              </tbody>
            </table>

            <p className="text-center text-sm text-slate-500 mt-8">
              Cancel anytime — no phone call, no email. If you stop paying, you drop back to the free plan and keep your tools.
            </p>
          </div>
        </section>

        {/* Upgrade path */}
        <section className="py-16 bg-slate-900 text-white">
          <div className="max-w-3xl mx-auto px-6 text-center">
            <h2 className="text-2xl font-bold mb-3">Tracking materials too?</h2>
            <p className="text-slate-300 mb-6 leading-relaxed">
              Stocked Tools is the tool tracker from Stocked. The full product adds inventory,
              purchase orders, receiving, and job costing — and your tools and their history
              move up with you.
            </p>
            <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-indigo-300 hover:text-white transition-colors">
              See everything Stocked does <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </section>

        {/* CTA */}
        <section className="py-20 bg-indigo-600">
          <div className="max-w-3xl mx-auto px-6 text-center text-white">
            <h2 className="text-3xl font-bold mb-4">You already know what a lost tool costs.</h2>
            <p className="text-indigo-200 mb-8">
              Add your first tools, print their labels, and scan one out before the end of the day.
            </p>
            <Link href={SIGNUP}
              className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-white text-indigo-700 font-semibold text-sm hover:bg-indigo-50 transition-colors shadow-lg">
              Start free <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </section>

        {/* Footer */}
        <footer className="bg-slate-900 text-slate-400 py-12">
          <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center">
                <Wrench className="w-3.5 h-3.5 text-white" strokeWidth={2.5} />
              </div>
              <span className="text-white font-semibold">Stocked Tools</span>
            </div>
            <div className="flex gap-6 text-sm">
              <Link href="/"        className="hover:text-white transition-colors">Stocked</Link>
              <Link href="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link>
              <Link href="/terms"   className="hover:text-white transition-colors">Terms of Service</Link>
              <a href="mailto:hello@stocked.tech" className="hover:text-white transition-colors">Contact</a>
            </div>
            <p className="text-xs text-slate-600">© {new Date().getFullYear()} Stocked. All rights reserved.</p>
          </div>
        </footer>
      </div>
    </div>
  )
}
