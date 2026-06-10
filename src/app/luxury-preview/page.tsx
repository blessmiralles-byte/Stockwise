'use client'

/**
 * /luxury-preview
 *
 * Luxury dark redesign preview — deep navy + gold palette, Playfair Display
 * serif headlines, editorial spacing, spotlight sections for Field & Fixed Assets.
 *
 * Visit: /luxury-preview to compare against the current landing page.
 * This page does NOT affect the live landing page (/).
 */

import Link from 'next/link'
import { Playfair_Display } from 'next/font/google'
import {
  Package, ArrowRight, CheckCircle2, ChevronRight,
  Zap, Users, Globe, Lock, Smartphone, Wrench,
  Truck, BarChart3, ClipboardList, Star, Shield,
  HardHat, Gauge, Hammer, HeartPulse, UtensilsCrossed,
  Building2, MapPin,
} from 'lucide-react'
import { PLAN_CONFIG } from '@/lib/stripe-config'

const serif = Playfair_Display({
  subsets: ['latin'],
  weight: ['400', '600', '700', '900'],
  style: ['normal', 'italic'],
})

// ── Design tokens (used as Tailwind arbitrary values throughout) ──────────────
// bg-main:    #09090E  |  bg-raised:  #0D0D16  |  bg-card:   #131320
// gold:       #C9A96E  |  gold-light: #E8D5A3  |  gold-dim:  rgba(201,169,110,0.12)
// text-hi:    #F0F0F4  |  text-mid:   #8A8A9E  |  text-lo:   #52526A

// ── Data ──────────────────────────────────────────────────────────────────────

const FEATURES = [
  {
    icon: Smartphone,
    title: 'Mobile & Field Access',
    desc: 'Field staff update stock and check out equipment from their phone — on site, not back at the office. Any barcode, any phone, live data instantly.',
  },
  {
    icon: Wrench,
    title: 'Fixed Assets & Equipment',
    desc: 'Track every tool, vehicle, and piece of equipment. Know where it is, who has it, and what it\'s worth. Depreciation and maintenance included.',
  },
  {
    icon: Truck,
    title: 'Purchase Orders',
    desc: 'Create POs, send to suppliers, and receive goods in a few taps. Built-in controls keep your process clean and auditable.',
  },
  {
    icon: Package,
    title: 'Real-time Inventory',
    desc: 'Always know what you have and where it is. Set reorder points so you\'re alerted before a job falls through.',
  },
  {
    icon: ClipboardList,
    title: 'Stock Counts',
    desc: 'Run stocktakes without stopping operations. Count, review discrepancies, and post — only after a second set of eyes approves.',
  },
  {
    icon: BarChart3,
    title: 'Financial Reports',
    desc: 'Inventory value, stock movement, and asset depreciation schedules — export-ready whenever your accountant needs them.',
  },
]

const INDUSTRIES = [
  {
    icon: Hammer,
    title: 'Trade & Contractors',
    desc: 'Electricians, plumbers, HVAC, civil works — track materials consumed per job, manage tools in the field, and keep every purchase order clean.',
  },
  {
    icon: HardHat,
    title: 'Construction & Fitout',
    desc: 'Site managers, builders, and project teams — track materials across active sites, manage equipment check-out, and stay audit-ready.',
  },
  {
    icon: HeartPulse,
    title: 'Healthcare & Aged Care',
    desc: 'Hospitals, clinics, pharmacies, and retirement homes — manage medical supplies, equipment, and consumables with full traceability.',
  },
  {
    icon: UtensilsCrossed,
    title: 'Hospitality & F&B',
    desc: 'Hotels, restaurants, and Airbnbs — track linen to laundry, kitchen stock, amenities, and everything in between across all your properties.',
  },
  {
    icon: Building2,
    title: 'Facilities Management',
    desc: 'Building services, cleaning, and property maintenance — manage parts inventory, fixed assets, and maintenance schedules across every site.',
  },
  {
    icon: MapPin,
    title: 'Field Service Teams',
    desc: 'Technical crews and on-site operations — equip your team with mobile stock access, equipment check-in/out, and live inventory from the field.',
  },
]

const FIELD_ITEMS = [
  'Scan barcodes with any smartphone camera — no hardware needed',
  'Check equipment in and out directly from the field',
  'Receive purchase orders on delivery — no paperwork',
  'Update stock counts without returning to base',
]

const ASSET_ITEMS = [
  'Full register: photos, serial numbers, location & assigned user',
  'Track equipment deployed to job sites and field staff',
  'Straight-line and declining-balance depreciation — runs automatically',
  'Maintenance schedules with email reminders before due dates',
  'Asset check-in / check-out via barcode scan',
  'Roll-forward report ready for your accountant',
]

// ── Shared section label ───────────────────────────────────────────────────────

function SectionLabel({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-4 mb-6">
      <div className="h-px flex-1 bg-[#C9A96E]/10" />
      <span className="text-[#C9A96E] text-[11px] font-semibold tracking-[0.25em] uppercase">
        {label}
      </span>
      <div className="h-px flex-1 bg-[#C9A96E]/10" />
    </div>
  )
}

// ── Nav ───────────────────────────────────────────────────────────────────────

function Nav() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-[#C9A96E]/10 bg-[#09090E]/90 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">

        {/* Logo */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 border border-[#C9A96E]/40 rounded-lg flex items-center justify-center">
            <Package className="w-4 h-4 text-[#C9A96E]" strokeWidth={1.5} />
          </div>
          <span className="text-white font-semibold tracking-wide">StockWise</span>
        </div>

        {/* Links */}
        <div className="hidden sm:flex items-center gap-8 text-sm text-[#8A8A9E]">
          <a href="#features"   className="hover:text-[#C9A96E] transition-colors">Features</a>
          <a href="#industries" className="hover:text-[#C9A96E] transition-colors">Industries</a>
          <a href="#pricing"    className="hover:text-[#C9A96E] transition-colors">Pricing</a>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <Link href="/login" className="text-sm text-[#8A8A9E] hover:text-white transition-colors">
            Sign in
          </Link>
          <Link
            href="/register"
            className="text-sm px-4 py-2 rounded-lg border border-[#C9A96E]/50 text-[#C9A96E] hover:bg-[#C9A96E]/10 font-medium transition-all"
          >
            Start free
          </Link>
        </div>
      </div>
    </nav>
  )
}

// ── Hero ──────────────────────────────────────────────────────────────────────

function Hero() {
  return (
    <section className="relative min-h-screen bg-[#09090E] flex items-center overflow-hidden">
      {/* Ambient gold glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[500px] bg-[#C9A96E]/5 rounded-full blur-[140px] pointer-events-none" />
      {/* Grid texture */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(201,169,110,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(201,169,110,0.025)_1px,transparent_1px)] bg-[size:80px_80px]" />

      <div className="relative max-w-5xl mx-auto px-6 py-32 text-center w-full">

        {/* Eyebrow with rules */}
        <div className="flex items-center justify-center gap-4 mb-10">
          <div className="h-px w-10 bg-[#C9A96E]/40" />
          <span className="text-[#C9A96E] text-[11px] font-semibold tracking-[0.25em] uppercase">
            Free 14-day trial · No card needed
          </span>
          <div className="h-px w-10 bg-[#C9A96E]/40" />
        </div>

        {/* Headline */}
        <h1 className={`${serif.className} text-5xl sm:text-6xl lg:text-[72px] font-bold text-white leading-[1.08] mb-8`}>
          Stop losing money<br />
          <em className="text-[#C9A96E] not-italic italic">to stock you can't see</em>
        </h1>

        {/* Sub */}
        <p className="text-lg text-[#8A8A9E] max-w-2xl mx-auto mb-12 leading-relaxed">
          Built for operations and services businesses — trade contractors,
          healthcare teams, hospitality operators, and field crews. Real-time
          stock, equipment tracking, and mobile field access, all in one place.
        </p>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/register"
            className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-[#C9A96E] text-[#09090E] font-semibold text-sm hover:bg-[#E8D5A3] transition-colors shadow-[0_0_50px_rgba(201,169,110,0.3)]"
          >
            Start your free trial
            <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center justify-center px-8 py-4 rounded-xl border border-white/10 text-white/60 font-medium text-sm hover:border-white/20 hover:text-white transition-all"
          >
            Sign in
          </Link>
        </div>

        <p className="text-xs text-[#52526A] mt-8 tracking-wide">
          Built for trade, services, and field operations
        </p>
      </div>
    </section>
  )
}

// ── Trust strip ───────────────────────────────────────────────────────────────

function TrustStrip() {
  const items = [
    { value: '14-day', label: 'Free trial' },
    { value: '6',      label: 'Team roles' },
    { value: '∞',      label: 'Products & assets' },
    { value: '100%',   label: 'Field-ready' },
  ]
  return (
    <div className="border-y border-[#C9A96E]/10 bg-[#09090E]">
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 text-center">
          {items.map(item => (
            <div key={item.label}>
              <p className={`${serif.className} text-3xl text-[#C9A96E] font-bold`}>{item.value}</p>
              <p className="text-[11px] text-[#8A8A9E] mt-1.5 tracking-[0.15em] uppercase">{item.label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Features ──────────────────────────────────────────────────────────────────

function Features() {
  return (
    <section className="py-28 bg-[#09090E]" id="features">
      <div className="max-w-6xl mx-auto px-6">
        <SectionLabel label="Platform" />
        <div className="text-center mb-16">
          <h2 className={`${serif.className} text-4xl font-bold text-white mb-4`}>
            Everything from purchase order to the job site
          </h2>
          <p className="text-[#8A8A9E] max-w-lg mx-auto leading-relaxed">
            One platform connecting your warehouse, your field team, and your accountant.
            No spreadsheets, no surprises.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map(f => (
            <div
              key={f.title}
              className="group p-6 rounded-2xl bg-[#131320] border border-[#C9A96E]/10 hover:border-[#C9A96E]/30 hover:bg-[#16162A] transition-all duration-200"
            >
              <div className="w-9 h-9 rounded-lg border border-[#C9A96E]/20 flex items-center justify-center mb-4 group-hover:border-[#C9A96E]/50 transition-colors">
                <f.icon className="w-4 h-4 text-[#C9A96E]" strokeWidth={1.5} />
              </div>
              <h3 className="font-semibold text-[#F0F0F4] mb-2">{f.title}</h3>
              <p className="text-sm text-[#8A8A9E] leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Industries ────────────────────────────────────────────────────────────────

function Industries() {
  return (
    <section className="py-28 bg-[#0D0D16]" id="industries">
      <div className="max-w-6xl mx-auto px-6">
        <SectionLabel label="Operations & Services" />
        <div className="text-center mb-16">
          <h2 className={`${serif.className} text-4xl font-bold text-white mb-4`}>
            Built for the businesses<br />
            <em className="text-[#C9A96E] not-italic italic">that keep the world running</em>
          </h2>
          <p className="text-[#8A8A9E] max-w-xl mx-auto leading-relaxed">
            Trade contractors, healthcare teams, hospitality operators, facilities managers —
            any operations-driven business that needs to know what it has,
            where it is, and when to restock.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {INDUSTRIES.map(ind => (
            <div
              key={ind.title}
              className="p-6 rounded-2xl bg-[#131320] border border-[#C9A96E]/10 hover:border-[#C9A96E]/30 hover:bg-[#16162A] transition-all"
            >
              <div className="w-10 h-10 rounded-xl border border-[#C9A96E]/20 flex items-center justify-center mb-4">
                <ind.icon className="w-4 h-4 text-[#C9A96E]" strokeWidth={1.5} />
              </div>
              <h3 className={`${serif.className} text-lg font-semibold text-white mb-2`}>{ind.title}</h3>
              <p className="text-sm text-[#8A8A9E] leading-relaxed">{ind.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Field spotlight ───────────────────────────────────────────────────────────

function FieldSpotlight() {
  return (
    <section className="py-28 bg-[#09090E]">
      <div className="max-w-6xl mx-auto px-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">

          {/* Copy */}
          <div>
            <span className="text-[#C9A96E] text-[11px] font-semibold tracking-[0.25em] uppercase mb-4 block">
              Mobile & Field
            </span>
            <h2 className={`${serif.className} text-4xl font-bold text-white mb-6 leading-snug`}>
              Your team updates stock<br />
              <em className="text-[#C9A96E] not-italic italic">from wherever the work is</em>
            </h2>
            <p className="text-[#8A8A9E] mb-8 leading-relaxed">
              No office visit. No paper forms. Field staff scan, receive, and update inventory
              directly from their phone — on the job site, in the van, or at the warehouse.
            </p>
            <ul className="space-y-3">
              {FIELD_ITEMS.map(item => (
                <li key={item} className="flex items-start gap-3 text-sm text-[#8A8A9E]">
                  <CheckCircle2 className="w-4 h-4 text-[#C9A96E] flex-shrink-0 mt-0.5" strokeWidth={1.5} />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* Mock phone card */}
          <div className="flex justify-center lg:justify-end">
            <div className="w-72 rounded-3xl border border-[#C9A96E]/20 bg-[#131320] p-6 shadow-[0_0_80px_rgba(201,169,110,0.08)]">
              <div className="flex items-center gap-2.5 mb-5">
                <div className="w-7 h-7 rounded-lg border border-[#C9A96E]/30 flex items-center justify-center">
                  <Package className="w-3.5 h-3.5 text-[#C9A96E]" strokeWidth={1.5} />
                </div>
                <span className="text-white text-sm font-medium">StockWise Field</span>
                <span className="ml-auto w-2 h-2 rounded-full bg-emerald-400" />
              </div>

              <div className="space-y-2.5">
                {[
                  { label: 'Angle Grinder — 9"',    loc: 'Van 3',      status: 'Out',      gold: true  },
                  { label: 'PVC Pipe 50mm × 6m',     loc: 'Job Site B', status: 'Received', gold: true  },
                  { label: 'Circuit Breaker 40A',    loc: 'Warehouse',  status: 'In stock', gold: false },
                ].map((item, i) => (
                  <div key={i} className="p-3 rounded-xl bg-[#09090E] border border-[#C9A96E]/8">
                    <p className="text-[#F0F0F4] text-xs font-medium">{item.label}</p>
                    <div className="flex items-center justify-between mt-1">
                      <p className="text-[#52526A] text-[10px]">{item.loc}</p>
                      <span className={`text-[10px] font-medium ${item.gold ? 'text-[#C9A96E]' : 'text-emerald-400'}`}>
                        {item.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 p-3 rounded-xl border border-[#C9A96E]/20 bg-[#C9A96E]/5 flex items-center gap-2">
                <Smartphone className="w-3.5 h-3.5 text-[#C9A96E]" strokeWidth={1.5} />
                <span className="text-[#C9A96E] text-xs">Scan barcode to update →</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

// ── Assets spotlight ──────────────────────────────────────────────────────────

function AssetsSpotlight() {
  return (
    <section className="py-28 bg-[#0D0D16]">
      <div className="max-w-6xl mx-auto px-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">

          {/* Mock asset register */}
          <div className="flex justify-center order-2 lg:order-1">
            <div className="w-full max-w-sm rounded-2xl border border-[#C9A96E]/15 bg-[#131320] overflow-hidden shadow-[0_0_80px_rgba(201,169,110,0.07)]">
              <div className="px-5 py-4 border-b border-[#C9A96E]/10 flex items-center justify-between">
                <span className="text-[#F0F0F4] text-sm font-semibold">Asset Register</span>
                <span className="text-[#C9A96E] text-xs">12 active</span>
              </div>

              {[
                { name: 'Hilti Combihammer TE 6-A36', id: 'AST-0041', val: '$1,840', dep: '↓ $184 / yr' },
                { name: 'Transit Van — GHY 221',       id: 'AST-0018', val: '$28,500', dep: '↓ $4,750 / yr' },
                { name: 'Air Compressor 50L',           id: 'AST-0033', val: '$620',    dep: '↓ $124 / yr' },
              ].map((a, i) => (
                <div key={i} className="px-5 py-3.5 border-b border-[#C9A96E]/8 flex items-center justify-between">
                  <div>
                    <p className="text-[#F0F0F4] text-xs font-medium">{a.name}</p>
                    <p className="text-[#52526A] text-[10px] mt-0.5 font-mono">{a.id}</p>
                  </div>
                  <div className="text-right flex-shrink-0 ml-4">
                    <p className="text-[#C9A96E] text-xs font-semibold tabular-nums">{a.val}</p>
                    <p className="text-[#52526A] text-[10px] mt-0.5">{a.dep}</p>
                  </div>
                </div>
              ))}

              <div className="px-5 py-4 space-y-2">
                <div className="flex items-center justify-between text-[10px] text-[#52526A]">
                  <span>Depreciation YTD</span>
                  <span className="text-[#C9A96E]">63%</span>
                </div>
                <div className="h-1.5 rounded-full bg-[#1A1A28]">
                  <div className="h-1.5 w-[63%] rounded-full bg-gradient-to-r from-[#C9A96E]/60 to-[#C9A96E]" />
                </div>
              </div>
            </div>
          </div>

          {/* Copy */}
          <div className="order-1 lg:order-2">
            <span className="text-[#C9A96E] text-[11px] font-semibold tracking-[0.25em] uppercase mb-4 block">
              Fixed Assets
            </span>
            <h2 className={`${serif.className} text-4xl font-bold text-white mb-6 leading-snug`}>
              Know what every asset<br />
              <em className="text-[#C9A96E] not-italic italic">is worth — and where it is</em>
            </h2>
            <p className="text-[#8A8A9E] mb-8 leading-relaxed">
              From hand tools to service vehicles — StockWise tracks every piece of
              equipment through its full life. Depreciation runs automatically.
              Your accountant gets a clean schedule. You get clarity.
            </p>
            <ul className="space-y-3">
              {ASSET_ITEMS.map(item => (
                <li key={item} className="flex items-start gap-3 text-sm text-[#8A8A9E]">
                  <CheckCircle2 className="w-4 h-4 text-[#C9A96E] flex-shrink-0 mt-0.5" strokeWidth={1.5} />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}

// ── Pricing ───────────────────────────────────────────────────────────────────

function Pricing() {
  return (
    <section className="py-28 bg-[#09090E]" id="pricing">
      <div className="max-w-5xl mx-auto px-6">
        <SectionLabel label="Pricing" />
        <div className="text-center mb-14">
          <h2 className={`${serif.className} text-4xl font-bold text-white mb-3`}>
            Honest pricing. No surprises.
          </h2>
          <p className="text-[#8A8A9E]">
            Try everything free for 14 days. No credit card. Cancel in one click.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 items-start">
          {/* Starter */}
          {(['starter', 'pro'] as const).map(key => {
            const cfg = PLAN_CONFIG[key]
            const isPro = key === 'pro'
            return (
              <div
                key={key}
                className={`rounded-2xl p-6 space-y-5 relative ${
                  isPro
                    ? 'border border-[#C9A96E]/40 bg-[#131320] shadow-[0_0_60px_rgba(201,169,110,0.12)]'
                    : 'border border-[#C9A96E]/10 bg-[#131320]'
                }`}
              >
                {isPro && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#C9A96E] text-[#09090E] text-[10px] font-bold px-3 py-1 rounded-full flex items-center gap-1">
                    <Star className="w-2.5 h-2.5" /> Most Popular
                  </span>
                )}
                <div>
                  <p className="font-semibold text-[#F0F0F4]">{cfg.label}</p>
                  <p className="text-3xl font-bold mt-1 text-white tabular-nums">
                    ${cfg.price}
                    <span className="text-sm font-normal text-[#8A8A9E]">/mo</span>
                  </p>
                </div>
                <ul className="space-y-2.5">
                  {cfg.features.map(f => (
                    <li key={f} className="flex items-start gap-2 text-sm text-[#8A8A9E]">
                      <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-[#C9A96E]" strokeWidth={1.5} />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/register"
                  className={`block text-center py-2.5 rounded-xl text-sm font-semibold transition-all ${
                    isPro
                      ? 'bg-[#C9A96E] text-[#09090E] hover:bg-[#E8D5A3]'
                      : 'border border-[#C9A96E]/30 text-[#C9A96E] hover:bg-[#C9A96E]/8'
                  }`}
                >
                  Start free trial
                </Link>
              </div>
            )
          })}

          {/* Enterprise */}
          <div className="rounded-2xl border border-[#C9A96E]/10 bg-[#131320] p-6 space-y-5">
            <div>
              <p className="font-semibold text-[#F0F0F4]">Enterprise</p>
              <p className="text-3xl font-bold mt-1 text-white">Custom</p>
            </div>
            <ul className="space-y-2.5">
              {PLAN_CONFIG.enterprise.features.map(f => (
                <li key={f} className="flex items-start gap-2 text-sm text-[#8A8A9E]">
                  <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-[#C9A96E]" strokeWidth={1.5} />
                  {f}
                </li>
              ))}
            </ul>
            <a
              href="mailto:hello@stockwise.app"
              className="block text-center py-2.5 rounded-xl text-sm font-semibold border border-white/10 text-[#8A8A9E] hover:text-white hover:border-white/20 transition-all"
            >
              Contact Sales
            </a>
          </div>
        </div>

        <p className="text-center text-xs text-[#52526A] mt-8">
          Every plan includes every feature. You're only limited by team size — not what you can do.
        </p>
      </div>
    </section>
  )
}

// ── CTA banner ────────────────────────────────────────────────────────────────

function CtaBanner() {
  return (
    <section className="py-28 bg-[#0D0D16] border-y border-[#C9A96E]/10">
      <div className="max-w-3xl mx-auto px-6 text-center">
        <div className="flex items-center justify-center gap-5 mb-10">
          <div className="h-px w-16 bg-[#C9A96E]/30" />
          <Package className="w-4 h-4 text-[#C9A96E]" strokeWidth={1.5} />
          <div className="h-px w-16 bg-[#C9A96E]/30" />
        </div>

        <h2 className={`${serif.className} text-4xl sm:text-5xl font-bold text-white mb-5 leading-tight`}>
          Your operations deserve<br />
          <em className="text-[#C9A96E] not-italic italic">better than a spreadsheet.</em>
        </h2>

        <p className="text-[#8A8A9E] mb-10 leading-relaxed max-w-lg mx-auto">
          Set up in minutes. Your team — in the office, the ward, the kitchen,
          or out on a job — will be scanning, ordering, and tracking stock by tomorrow.
        </p>

        <Link
          href="/register"
          className="inline-flex items-center gap-2 px-10 py-4 rounded-xl bg-[#C9A96E] text-[#09090E] font-semibold text-sm hover:bg-[#E8D5A3] transition-colors shadow-[0_0_60px_rgba(201,169,110,0.25)]"
        >
          Start your free trial
          <ChevronRight className="w-4 h-4" />
        </Link>

        <p className="text-xs text-[#52526A] mt-5 tracking-wide">
          14 days free · No credit card · Cancel anytime
        </p>
      </div>
    </section>
  )
}

// ── Footer ────────────────────────────────────────────────────────────────────

function Footer() {
  return (
    <footer className="bg-[#09090E] border-t border-[#C9A96E]/10 py-10">
      <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-5">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 border border-[#C9A96E]/30 rounded-lg flex items-center justify-center">
            <Package className="w-3.5 h-3.5 text-[#C9A96E]" strokeWidth={1.5} />
          </div>
          <span className="text-white font-semibold text-sm tracking-wide">StockWise</span>
          <span className="text-[#52526A] text-xs hidden sm:inline">
            — Inventory software that grows with you
          </span>
        </div>

        <div className="flex gap-6 text-xs text-[#52526A]">
          <Link href="/privacy" className="hover:text-[#C9A96E] transition-colors">Privacy</Link>
          <Link href="/terms"   className="hover:text-[#C9A96E] transition-colors">Terms</Link>
          <a href="mailto:hello@stockwise.app" className="hover:text-[#C9A96E] transition-colors">Contact</a>
        </div>

        <p className="text-xs text-[#52526A]">© {new Date().getFullYear()} StockWise</p>
      </div>
    </footer>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function LuxuryPreview() {
  return (
    <div className="min-h-screen">
      <Nav />
      <div className="pt-16">
        <Hero />
        <TrustStrip />
        <Features />
        <Industries />
        <FieldSpotlight />
        <AssetsSpotlight />
        <Pricing />
        <CtaBanner />
        <Footer />
      </div>
    </div>
  )
}
