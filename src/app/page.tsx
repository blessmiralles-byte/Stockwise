'use client'

import Link from 'next/link'
import {
  Package, BarChart3, QrCode, Truck, ClipboardList, Wrench,
  CheckCircle2, ArrowRight, Shield, Zap, Users, Star,
  ChevronRight, Globe, Lock
} from 'lucide-react'
import { PLAN_CONFIG } from '@/lib/stripe-config'

// ── Hero ──────────────────────────────────────────────────────────────────────
function Hero() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-indigo-950 via-indigo-900 to-slate-900 text-white">
      {/* Grid decoration */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:64px_64px]" />

      <div className="relative max-w-6xl mx-auto px-6 pt-24 pb-28 text-center">
        <div className="inline-flex items-center gap-2 bg-indigo-800/60 border border-indigo-700/50 text-indigo-200 text-xs font-medium px-3 py-1.5 rounded-full mb-8">
          <Zap className="w-3.5 h-3.5" />
          14-day free trial — no credit card required
        </div>

        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-tight mb-6">
          Inventory management<br />
          <span className="text-indigo-300">built for real businesses</span>
        </h1>
        <p className="text-lg text-indigo-200 max-w-2xl mx-auto mb-10">
          StockWise gives your team real-time stock visibility, purchase order workflows,
          barcode scanning, fixed-asset tracking, and financial reports — in one
          beautifully simple app.
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
          Trusted by businesses managing thousands of SKUs
        </p>
      </div>
    </section>
  )
}

// ── Features grid ─────────────────────────────────────────────────────────────
const FEATURES = [
  {
    icon:  Package,
    title: 'Real-time Inventory',
    desc:  'Track stock levels across multiple locations with weighted average or FIFO costing. Get low-stock alerts before you run out.',
  },
  {
    icon:  Truck,
    title: 'Purchase Orders',
    desc:  'Create POs, send to suppliers, and receive goods with a three-way match. SOD controls prevent the same person approving what they ordered.',
  },
  {
    icon:  QrCode,
    title: 'Barcode Scanning',
    desc:  'Scan any barcode to instantly look up products, assets, locations, or POs. Works on any phone — no dedicated scanner needed.',
  },
  {
    icon:  Wrench,
    title: 'Fixed Assets',
    desc:  'Track every asset from purchase to disposal. Automated straight-line or declining-balance depreciation with a full roll-forward report.',
  },
  {
    icon:  ClipboardList,
    title: 'Stock Counts',
    desc:  'Plan, execute, and approve cycle counts without stopping operations. Discrepancies are highlighted for review before adjustments post.',
  },
  {
    icon:  BarChart3,
    title: 'Financial Reports',
    desc:  'Inventory valuation, movement ledger, expense analysis, and asset schedules — ready for your accountant or ERP export.',
  },
]

function Features() {
  return (
    <section className="py-24 bg-white" id="features">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold text-slate-900 mb-3">
            Everything your operations team needs
          </h2>
          <p className="text-slate-500 max-w-xl mx-auto">
            One platform from purchase order to financial close. No spreadsheets,
            no missing stock, no manual reconciliation.
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

// ── Social proof / trust signals ──────────────────────────────────────────────
function TrustBar() {
  return (
    <section className="py-12 bg-slate-50 border-y border-slate-100">
      <div className="max-w-4xl mx-auto px-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 text-center">
          {[
            { icon: Shield,  label: 'SOD Controls',       sub: 'Built-in separation of duties' },
            { icon: Globe,   label: 'Multi-location',      sub: 'Warehouses, stores, sites' },
            { icon: Lock,    label: 'Secure by design',    sub: 'Row-level security on every query' },
            { icon: Users,   label: 'Team roles',          sub: 'Owner, Procurement, Finance & more' },
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

// ── Pricing ───────────────────────────────────────────────────────────────────
function Pricing() {
  const plans = [
    {
      key:       'starter' as const,
      highlight: false,
      cta:       'Start free trial',
    },
    {
      key:       'pro' as const,
      highlight: true,
      cta:       'Start free trial',
    },
  ]

  return (
    <section className="py-24 bg-white" id="pricing">
      <div className="max-w-5xl mx-auto px-6">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-bold text-slate-900 mb-3">Simple, transparent pricing</h2>
          <p className="text-slate-500">
            Start with a 14-day free trial. Upgrade anytime — cancel anytime.
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
                  href="/register"
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
          All plans include a 14-day free trial. No credit card required to start.
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
        <h2 className="text-3xl font-bold mb-4">Ready to take control of your inventory?</h2>
        <p className="text-indigo-200 mb-8">
          Join businesses that have replaced spreadsheets with StockWise.
          Set up in minutes — your team will be scanning barcodes by tomorrow.
        </p>
        <Link
          href="/register"
          className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-white text-indigo-700 font-semibold text-sm hover:bg-indigo-50 transition-colors shadow-lg">
          Get started free
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
    </section>
  )
}

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
          <a href="#features" className="hover:text-white transition-colors">Features</a>
          <a href="#pricing"  className="hover:text-white transition-colors">Pricing</a>
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
      <div className="pt-16"> {/* offset for fixed nav */}
        <Hero />
        <TrustBar />
        <Features />
        <Pricing />
        <CtaBanner />
        <Footer />
      </div>
    </div>
  )
}
