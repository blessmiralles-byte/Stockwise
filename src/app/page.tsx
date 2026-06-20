'use client'

import Link from 'next/link'
import {
  Package, BarChart3, Truck, ClipboardList, Wrench,
  CheckCircle2, ArrowRight, Shield, Zap, Users, Star,
  ChevronRight, Globe, Lock, Smartphone, CalendarClock,
  Hammer, HardHat, HeartPulse, UtensilsCrossed, Building2, MapPin,
} from 'lucide-react'
import { PLAN_CONFIG } from '@/lib/stripe-config'

// ── Nav ───────────────────────────────────────────────────────────────────────
function Nav() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-indigo-950/90 backdrop-blur-sm border-b border-indigo-900/60">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center">
            <Package className="w-4 h-4 text-white" strokeWidth={2.5} />
          </div>
          <span className="text-white font-bold text-lg tracking-tight">StockWise</span>
        </div>

        <div className="hidden sm:flex items-center gap-6 text-sm text-indigo-300">
          <a href="#features"   className="hover:text-white transition-colors">Features</a>
          <a href="#industries" className="hover:text-white transition-colors">Industries</a>
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
          Stop losing money<br />
          <span className="text-indigo-300">to stock you can't see</span>
        </h1>

        <p className="text-lg text-indigo-200 max-w-2xl mx-auto mb-10">
          Built for operations and services businesses — trade contractors, healthcare teams,
          hospitality operators, and field crews. Real-time stock, expiry tracking, equipment
          management, and mobile field access, all in one place.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/register"
            className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white font-semibold text-sm transition-colors shadow-lg shadow-indigo-900/40">
            Start free trial
            <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-sm transition-colors border border-white/10">
            Sign in
          </Link>
        </div>

        <p className="text-xs text-indigo-400 mt-5">
          For the businesses that keep the world running
        </p>
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
            { icon: Smartphone,    label: 'Field-ready',         sub: 'Update stock from any job site' },
            { icon: CalendarClock, label: 'Expiry tracking',     sub: 'Alerts before stock expires' },
            { icon: Lock,          label: 'Private by default',  sub: 'Your data invisible to others' },
            { icon: Users,         label: '6 team roles',        sub: 'Right access for every job title' },
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
    icon:  Package,
    title: 'Real-time Inventory',
    desc:  'Always know what you have and where it is across every location. Set reorder points so you get alerted before you run out — not after a job falls through.',
  },
  {
    icon:  CalendarClock,
    title: 'Expiry & Batch Tracking',
    desc:  'Set expiry dates on any product or batch — medicines, food supplies, chemicals, and consumables. Get automatic alerts before stock expires so nothing goes to waste and compliance stays intact.',
  },
  {
    icon:  Smartphone,
    title: 'Mobile & Field Access',
    desc:  'Field staff update stock and check out equipment directly from their phone — on site, not back at the office. Scan any barcode to pull up live inventory, assets, or a purchase order instantly.',
  },
  {
    icon:  Wrench,
    title: 'Fixed Assets & Equipment',
    desc:  'Track every tool, vehicle, and piece of equipment — where it is, who has it, and what it\'s worth. Automated depreciation, maintenance schedules, and a full audit trail from purchase to disposal.',
  },
  {
    icon:  Truck,
    title: 'Purchase Orders',
    desc:  'Create POs, send them to suppliers, and receive goods in a few taps. Built-in controls mean the person who orders can\'t also approve the receipt — keeping your process clean.',
  },
  {
    icon:  BarChart3,
    title: 'Financial Reports',
    desc:  'Inventory value, stock movement, cost of goods, and asset depreciation schedules — export-ready whenever your accountant asks for them.',
  },
]

function Features() {
  return (
    <section className="py-24 bg-white" id="features">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold text-slate-900 mb-3">
            Everything from purchase order to the job site
          </h2>
          <p className="text-slate-500 max-w-xl mx-auto">
            One platform that connects your warehouse, your field team, and your
            accountant. No spreadsheets, no missing stock, no surprises.
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

// ── Industries ────────────────────────────────────────────────────────────────
const INDUSTRIES = [
  {
    icon:  Hammer,
    title: 'Trade & Contractors',
    desc:  'Electricians, plumbers, HVAC, civil works — track materials consumed per job, manage tools in the field, and keep every purchase order clean.',
  },
  {
    icon:  HardHat,
    title: 'Construction & Fitout',
    desc:  'Site managers, builders, and project teams — track materials across active sites, manage equipment check-out, and stay audit-ready.',
  },
  {
    icon:  HeartPulse,
    title: 'Healthcare & Aged Care',
    desc:  'Hospitals, clinics, pharmacies, and retirement homes — manage medical supplies and medications with expiry alerts, batch tracking, and full traceability.',
  },
  {
    icon:  UtensilsCrossed,
    title: 'Hospitality & F&B',
    desc:  'Hotels, restaurants, and Airbnbs — track linen to laundry, kitchen stock with expiry dates, amenities, and supplies across all your properties.',
  },
  {
    icon:  Building2,
    title: 'Facilities Management',
    desc:  'Building services, cleaning, and property maintenance — manage parts inventory, fixed assets, and maintenance schedules across every site.',
  },
  {
    icon:  MapPin,
    title: 'Field Service Teams',
    desc:  'Technical crews and on-site operations — equip your team with mobile stock access, equipment check-in/out, and live inventory from the field.',
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
            Operations & Services
          </span>
          <div className="h-px flex-1 bg-slate-200" />
        </div>

        <div className="text-center mb-14">
          <h2 className="text-3xl font-bold text-slate-900 mb-3">
            Built for the businesses that keep the world running
          </h2>
          <p className="text-slate-500 max-w-xl mx-auto">
            Trade contractors, healthcare teams, hospitality operators, facilities managers —
            any operations-driven business that needs to know what it has,
            where it is, and when to restock.
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

// ── Pricing ───────────────────────────────────────────────────────────────────
function Pricing() {
  const plans = [
    { key: 'starter' as const, highlight: false, cta: 'Start free trial' },
    { key: 'pro'     as const, highlight: true,  cta: 'Start free trial' },
  ]

  return (
    <section className="py-24 bg-white" id="pricing">
      <div className="max-w-5xl mx-auto px-6">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-bold text-slate-900 mb-3">Honest pricing. No surprises.</h2>
          <p className="text-slate-500">
            Try everything free for 14 days. No credit card. Cancel in one click.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 items-start">
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
                    <Star className="w-3 h-3" /> Most Popular
                  </span>
                )}
                <div>
                  <p className={`font-bold text-lg ${highlight ? 'text-white' : 'text-slate-900'}`}>{cfg.label}</p>
                  <p className={`text-3xl font-extrabold mt-1 ${highlight ? 'text-white' : 'text-slate-900'}`}>
                    ${cfg.price}
                    <span className={`text-sm font-normal ${highlight ? 'text-indigo-200' : 'text-slate-500'}`}>/mo</span>
                  </p>
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
                  href={`/register?plan=${key}`}
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

          {/* Enterprise */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 space-y-5">
            <div>
              <p className="font-bold text-lg text-slate-900">Enterprise</p>
              <p className="text-2xl font-extrabold mt-1 text-slate-900">Custom</p>
            </div>
            <ul className="space-y-2">
              {PLAN_CONFIG.enterprise.features.map(f => (
                <li key={f} className="flex items-start gap-2 text-sm text-slate-600">
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5 text-green-500" />
                  {f}
                </li>
              ))}
            </ul>
            <a
              href="mailto:hello@stockwise.app"
              className="block text-center py-2.5 rounded-xl text-sm font-semibold bg-slate-200 text-slate-700 hover:bg-slate-300 transition-colors"
            >
              Contact Sales
            </a>
          </div>
        </div>

        <p className="text-center text-xs text-slate-400 mt-8">
          Every plan includes the full inventory, asset, and field toolkit. Higher tiers simply add
          seats, priority support, and audit-trail export.
        </p>
      </div>
    </section>
  )
}

// ── CTA banner ────────────────────────────────────────────────────────────────
function CtaBanner() {
  return (
    <section className="py-20 bg-indigo-600">
      <div className="max-w-3xl mx-auto px-6 text-center text-white">
        <h2 className="text-3xl font-bold mb-4">Your operations deserve better than a spreadsheet.</h2>
        <p className="text-indigo-200 mb-8">
          Set up in minutes. Your team — in the office, the ward, the kitchen, or out on a job —
          will be scanning, ordering, and tracking stock by tomorrow.
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
            <span className="text-white font-semibold">StockWise</span>
          </div>

          <div className="flex gap-6 text-sm">
            <Link href="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link>
            <Link href="/terms"   className="hover:text-white transition-colors">Terms of Service</Link>
            <a href="mailto:hello@stockwise.app" className="hover:text-white transition-colors">Contact</a>
          </div>

          <p className="text-xs text-slate-600">
            © {new Date().getFullYear()} StockWise. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function LandingPage() {
  return (
    <div className="min-h-screen">
      <Nav />
      <div className="pt-16">
        <Hero />
        <TrustBar />
        <Features />
        <Industries />
        <Pricing />
        <CtaBanner />
        <Footer />
      </div>
    </div>
  )
}
