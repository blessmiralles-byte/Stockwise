import Link from 'next/link'
import {
  Package, BarChart3, Truck, ClipboardList, Wrench,
  CheckCircle2, ArrowRight, Shield, Zap, Users, ShieldCheck, PackageX,
  ChevronRight, Smartphone, TrendingDown, CalendarClock, History,
  Hammer, HardHat, Building2, MapPin,
} from 'lucide-react'
import { isPricingRegion } from '@/lib/plan-config'
import { requestPricingRegion } from '@/lib/pricing-region-server'
import { Pricing } from '@/components/marketing/pricing'
import { AttributionTracker } from '@/components/marketing/attribution-tracker'

// ── Nav ───────────────────────────────────────────────────────────────────────
function Nav() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-indigo-950/90 backdrop-blur-sm border-b border-indigo-900/60">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center">
            <Package className="w-4 h-4 text-white" strokeWidth={2.5} />
          </div>
          <span className="text-white font-bold text-lg tracking-tight">Stocked</span>
        </div>

        {/* lg, not sm: the full section names need the room, and below this
            width they pushed the sign-in buttons off the page. */}
        <div className="hidden lg:flex items-center gap-6 text-sm text-indigo-300">
          <a href="#features"   className="hover:text-white transition-colors">Features</a>
          <a href="#assets"     className="hover:text-white transition-colors">Assets &amp; Tool Custody</a>
          <a href="#industries" className="hover:text-white transition-colors">Who it&apos;s for</a>
          <a href="#pricing"    className="hover:text-white transition-colors">Pricing</a>
        </div>

        <div className="flex items-center gap-3">
          <Link href="/login"    className="text-sm text-indigo-300 hover:text-white transition-colors">Sign in</Link>
          <Link href="/register" className="text-sm px-4 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white font-semibold transition-colors">
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
    <section className="relative overflow-hidden bg-gradient-to-br from-indigo-950 via-indigo-900 to-slate-900 text-white">
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:64px_64px]" />

      <div className="relative max-w-6xl mx-auto px-6 pt-24 pb-28 text-center">
        <div className="inline-flex items-center gap-2 bg-indigo-800/60 border border-indigo-700/50 text-indigo-200 text-xs font-medium px-3 py-1.5 rounded-full mb-8">
          <Zap className="w-3.5 h-3.5" />
          Free 14-day trial · No credit card needed
        </div>

        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-tight mb-6">
          Nothing walks off site<br />
          <span className="text-indigo-300">unaccounted for</span>
        </h1>

        <p className="text-lg text-indigo-200 max-w-2xl mx-auto mb-10">
          Materials, tools, and equipment on one system. Your crew requests from
          their phone. You approve. Stock deducts against the job — automatically.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/register"
            className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white font-semibold text-sm transition-colors shadow-lg shadow-indigo-900/40">
            Start free trial
            <ArrowRight className="w-4 h-4" />
          </Link>
          {/* Sign in is already in the nav — this slot answers "how much work
              is this?", which is the objection at this moment. */}
          <Link
            href="/getting-started"
            className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-sm transition-colors border border-white/10">
            See how it works
          </Link>
        </div>

        <p className="text-xs text-indigo-400 mt-5">
          Set up in an afternoon. Import your product list and go.
        </p>
      </div>
    </section>
  )
}

// ── Positioning ───────────────────────────────────────────────────────────────
// The page had no "why us". This is the only place that explains why Stocked
// exists, so it sits directly under the hero.
function Positioning() {
  return (
    <section className="py-16 bg-white border-b border-slate-100">
      <div className="max-w-4xl mx-auto px-6 text-center">
        <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-4">
          Three systems, or one.
        </h2>
        <p className="text-slate-600 max-w-2xl mx-auto mb-10 leading-relaxed">
          Consumables in a spreadsheet. Tools on a whiteboard. Fixed assets in your
          accountant&apos;s depreciation schedule, once a year. Stocked replaces all
          three — and every dollar lands on the job that used it.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-left">
          {[
            { icon: Package,   title: 'Materials', sub: 'Stock, purchase orders, receiving, and counts — costed to the job that consumed them.' },
            { icon: Wrench,    title: 'Tools',     sub: 'Who has it, when it\'s due back, and whether it\'s still certified.' },
            { icon: Building2, title: 'Assets',    sub: 'Capital equipment from purchase to disposal, with depreciation your accountant can post.' },
          ].map(p => (
            <div key={p.title} className="p-5 rounded-2xl bg-slate-50 border border-slate-100">
              <p.icon className="w-5 h-5 text-indigo-600 mb-3" />
              <h3 className="font-semibold text-slate-900 mb-1.5">{p.title}</h3>
              <p className="text-sm text-slate-500 leading-relaxed">{p.sub}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Trust bar ─────────────────────────────────────────────────────────────────
function TrustBar() {
  return (
    <section className="py-12 bg-slate-50 border-y border-slate-100">
      <div className="max-w-4xl mx-auto px-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 text-center">
          {[
            { icon: Package,       label: 'One register',      sub: 'Consumables, tools, and fixed assets — not three systems' },
            { icon: ClipboardList, label: 'Costed to the job', sub: 'Every unit booked to the job that consumed it' },
            { icon: Smartphone,    label: 'Field-first',       sub: 'Request, scan, and receive from any phone' },
            { icon: Shield,        label: 'Built-in controls',  sub: 'The person who orders can\'t sign off the delivery' },
          ].map(item => (
            <div key={item.label} className="space-y-1">
              <item.icon className="w-6 h-6 text-indigo-500 mx-auto" />
              <p className="text-sm font-semibold text-slate-800">{item.label}</p>
              <p className="text-xs text-slate-500">{item.sub}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Features ──────────────────────────────────────────────────────────────────
const FEATURES = [
  {
    icon:  ClipboardList,
    title: 'Requisitions & Job Costing',
    desc:  'Crews request materials from their phone with a cost center and job code. You approve, stock deducts automatically, and every unit is booked to the job that consumed it — so you finally know what each job really cost.',
  },
  {
    icon:  Package,
    title: 'Real-time Inventory',
    desc:  'Always know what you have and where it is across every location. Reorder points alert you before you run out, and expiry and batch tracking keep dated stock from going to waste.',
  },
  {
    icon:  Truck,
    title: 'Purchase Orders & Receiving',
    desc:  'Create POs, send them to vendors, and receive goods in a few taps. Partial deliveries, over-receipt tolerances, and vendor invoices matched against what actually arrived.',
  },
  {
    icon:  Smartphone,
    title: 'Mobile & Field Access',
    desc:  'Field staff update stock and check out equipment directly from their phone — on site, not back at the office. Scan any barcode to pull up live inventory, assets, or a purchase order instantly.',
  },
  // Assets and tool custody are not cards here — the section below owns that
  // pillar properly, and duplicating it was what made the page feel unfocused.
  {
    icon:  Shield,
    title: 'Approval limits',
    desc:  'Set who reports to whom and how much each person can approve. A request goes to their manager first, then climbs the line until someone has the authority to sign it off — with the full trail on the document.',
  },
  {
    icon:  BarChart3,
    title: 'Reports & Accounting Export',
    desc:  'Inventory valuation, stock movement, cost of goods, per-job material costs, and depreciation schedules — export-ready whenever your accountant asks for them.',
  },
]

function Features() {
  return (
    <section className="py-24 bg-white" id="features">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold text-slate-900 mb-3">
            Inventory and job costing, from the purchase order to the job site
          </h2>
          <p className="text-slate-500 max-w-xl mx-auto">
            Your warehouse, your crew, and your accountant working off the same
            numbers — and every unit landing on the job that consumed it.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map(f => (
            <div key={f.title} className="p-6 rounded-2xl border border-slate-100 bg-slate-50 hover:border-indigo-100 hover:bg-indigo-50/30 transition-colors group">
              <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center mb-4 group-hover:bg-indigo-200 transition-colors">
                <f.icon className="w-5 h-5 text-indigo-600" />
              </div>
              <h3 className="font-semibold text-slate-900 mb-2">{f.title}</h3>
              <p className="text-sm text-slate-500 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Fixed Assets module ───────────────────────────────────────────────────────
const ASSET_FEATURES = [
  {
    icon:  Building2,
    title: 'Full asset register',
    desc:  'Every tool, vehicle, and machine with its own tag, serial number, location, custodian, purchase cost, and current book value — one source of truth for what you own.',
  },
  {
    icon:  TrendingDown,
    title: 'Automated depreciation',
    desc:  'Straight-line, declining balance, double-declining, or units of production. Run it per period in a click; assets even depreciate through to their exact disposal date.',
  },
  {
    icon:  CalendarClock,
    title: 'Maintenance schedules',
    desc:  'Set service intervals and get alerted before maintenance is due. Log what was done, by whom, and what it cost — the full service history stays with the asset.',
  },
  {
    icon:  Users,
    title: 'Tool custody',
    desc:  'Check tools out to a person, van, or job and always know who has what and when it\'s due back. Overdue tools are flagged, and the crew checks them in and out from their phones.',
  },
  {
    icon:  ShieldCheck,
    title: 'Inspections & calibration',
    desc:  'Safety and calibration checks on their own cycle, with the certificate number and expiry stored against the tool. See what\'s due, what\'s lapsed, and what expires this month — and stop uncertified tools going out.',
  },
  {
    icon:  PackageX,
    title: 'Lost, stolen & damaged',
    desc:  'Report a missing tool in seconds: who had it, where it was last seen, the police report number. It comes out of service immediately, owners are notified, and you see your total losses in one number.',
  },
  {
    icon:  History,
    title: 'Disposal & audit trail',
    desc:  'Retire, sell, or dispose of an asset with the correct accounting entries posted automatically — accumulated depreciation relieved, gain or loss recognized — and a complete history from purchase to disposal.',
  },
  {
    icon:  BarChart3,
    title: 'For your accountant',
    desc:  'Depreciation schedules, an asset roll-forward (opening cost, additions, disposals, closing net book value), and journal entries ready to import into QuickBooks Online or Xero.',
  },
]

function Assets() {
  return (
    <section className="py-24 bg-slate-900 text-white" id="assets">
      <div className="max-w-6xl mx-auto px-6">
        <div className="grid lg:grid-cols-[1fr_1.4fr] gap-12 items-start">
          {/* Left: pitch */}
          <div>
            <div className="inline-flex items-center gap-2 bg-indigo-500/15 border border-indigo-400/30 text-indigo-300 text-xs font-semibold px-3 py-1.5 rounded-full mb-5">
              <Wrench className="w-3.5 h-3.5" />
              Fixed asset tracking &amp; tool custody
            </div>
            <h2 className="text-3xl font-bold mb-4 leading-tight">
              Your tools are assets, not consumables
            </h2>
            <p className="text-slate-300 leading-relaxed mb-6">
              A $40,000 excavator and a box of fittings don&apos;t belong in the same column.
              Stocked tracks capital equipment from purchase to disposal — depreciation,
              maintenance, custody, certificates — so your fixed-asset register stays in step
              with your accountant, and you always know where each tool is.
            </p>
            <ul className="space-y-2.5 mb-8">
              {[
                'Depreciation and disposal entries your accountant can post as-is — GAAP and IFRS',
                'One audit trail, from the invoice to the write-off',
                'Scan an asset tag with any phone',
                'Certificates that can\'t quietly lapse',
              ].map(point => (
                <li key={point} className="flex items-start gap-2.5 text-sm text-slate-200">
                  <CheckCircle2 className="w-4 h-4 text-indigo-400 flex-shrink-0 mt-0.5" />
                  {point}
                </li>
              ))}
            </ul>
            <Link
              href="/register"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white font-semibold text-sm transition-colors">
              Start free trial <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          {/* Right: capability grid */}
          <div className="grid sm:grid-cols-2 gap-4">
            {ASSET_FEATURES.map(f => (
              <div key={f.title} className="p-5 rounded-2xl bg-slate-800/60 border border-slate-700/60">
                <div className="w-9 h-9 bg-indigo-500/20 rounded-lg flex items-center justify-center mb-3">
                  <f.icon className="w-4 h-4 text-indigo-300" />
                </div>
                <h3 className="font-semibold text-white text-sm mb-1.5">{f.title}</h3>
                <p className="text-xs text-slate-400 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

// ── Industries ────────────────────────────────────────────────────────────────
// Contractors only. Healthcare and hospitality get their own landing pages —
// "track linen to laundry" on a page that opens with job costing costs us the
// contractor we came for.
const INDUSTRIES = [
  {
    icon:  Hammer,
    title: 'Trade contractors',
    desc:  'Electricians, plumbers, HVAC, heavy civil — track materials consumed per job, manage tools in the field, and keep every purchase order clean.',
  },
  {
    icon:  HardHat,
    title: 'Construction & build-out',
    desc:  'Site managers, builders, and project teams — track materials across active sites, manage equipment check-out, and stay audit-ready.',
  },
  {
    icon:  MapPin,
    title: 'Field service teams',
    desc:  'Technical crews and on-site operations — mobile stock access, tool check-in and check-out, and live inventory from the field.',
  },
]

function Industries() {
  return (
    <section className="py-24 bg-slate-50" id="industries">
      <div className="max-w-6xl mx-auto px-6">
        {/* Label */}
        <div className="flex items-center gap-4 mb-5">
          <div className="h-px flex-1 bg-slate-200" />
          <span className="text-indigo-500 text-xs font-semibold tracking-widest uppercase">
            Who it&apos;s for
          </span>
          <div className="h-px flex-1 bg-slate-200" />
        </div>

        <div className="text-center mb-14">
          <h2 className="text-3xl font-bold text-slate-900 mb-3">
            Built for the businesses that keep the world running
          </h2>
          <p className="text-slate-500 max-w-xl mx-auto">
            For owner-operators and ops managers running 5 to 40 people — the businesses
            too big for a spreadsheet and too small for an ERP.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {INDUSTRIES.map(ind => (
            <div key={ind.title} className="p-6 rounded-2xl bg-white border border-slate-100 hover:border-indigo-100 hover:shadow-sm transition-all group">
              <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center mb-4 group-hover:bg-indigo-100 transition-colors">
                <ind.icon className="w-5 h-5 text-indigo-600" />
              </div>
              <h3 className="font-semibold text-slate-900 mb-2">{ind.title}</h3>
              <p className="text-sm text-slate-500 leading-relaxed">{ind.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── CTA banner ────────────────────────────────────────────────────────────────
function CtaBanner() {
  return (
    <section className="py-20 bg-indigo-600">
      <div className="max-w-3xl mx-auto px-6 text-center text-white">
        <h2 className="text-3xl font-bold mb-4">Stop running your stock on a spreadsheet.</h2>
        <p className="text-indigo-200 mb-8">
          Import your product list, set your locations, and your crew can request from
          their phones the same day. Know what every job cost you in materials by the
          end of your first week.
        </p>
        <Link
          href="/register"
          className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-white text-indigo-700 font-semibold text-sm hover:bg-indigo-50 transition-colors shadow-lg">
          Start your free trial
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
    </section>
  )
}

// ── Footer ────────────────────────────────────────────────────────────────────
function Footer() {
  return (
    <footer className="bg-slate-900 text-slate-400 py-12">
      <div className="max-w-6xl mx-auto px-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center">
              <Package className="w-3.5 h-3.5 text-white" strokeWidth={2.5} />
            </div>
            <span className="text-white font-semibold">Stocked</span>
          </div>

          <div className="flex gap-6 text-sm">
            <Link href="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link>
            <Link href="/terms"   className="hover:text-white transition-colors">Terms of Service</Link>
            <a href="mailto:hello@stocked.tech" className="hover:text-white transition-colors">Contact</a>
          </div>

          <p className="text-xs text-slate-600">
            © {new Date().getFullYear()} Stocked. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
/**
 * A Server Component, so the visitor's pricing region is resolved here — from
 * the country header on this very request — and the real prices go into the
 * HTML we send. Reading the request makes this route dynamic rather than
 * statically cached, which is the deliberate trade: a correct price in the
 * markup for every visitor, instead of a cacheable page with two grey boxes
 * where the prices should be.
 */
export default async function LandingPage({
  searchParams,
}: {
  searchParams: Promise<{ region?: string }>
}) {
  // ?region= previews the other price band — never in production, so the
  // public page can't be made to show a price checkout won't charge.
  const { region: override } = await searchParams
  const isProd = process.env.VERCEL_ENV === 'production'
  const region = !isProd && isPricingRegion(override)
    ? override
    : await requestPricingRegion()

  return (
    <div className="min-h-screen">
      <AttributionTracker />
      <Nav />
      <div className="pt-16">
        <Hero />
        <Positioning />
        <TrustBar />
        <Features />
        <Assets />
        <Industries />
        <Pricing region={region} />
        <CtaBanner />
        <Footer />
      </div>
    </div>
  )
}