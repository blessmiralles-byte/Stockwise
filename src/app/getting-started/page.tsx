import Link from 'next/link'
import {
  Package, UserPlus, MapPin, Tag, Truck, Boxes, ArrowLeftRight,
  Building2, Users, ScanBarcode, Upload, CheckCircle2, ArrowRight,
} from 'lucide-react'

export const metadata = {
  title: 'Getting Started — Stocked',
  description: 'A step-by-step guide to setting up your Stocked account, from your first location to inviting your team.',
}

interface Step {
  n:        number
  icon:     any
  title:    string
  optional?: boolean
  what:     string
  how:      string[]
}

const STEPS: Step[] = [
  {
    n: 1,
    icon: UserPlus,
    title: 'Create your account & name your company',
    what: 'Start a free 14-day trial — no credit card required. The person who signs up first becomes the account Owner.',
    how: [
      'Sign up with your name, email, and a password.',
      'Give your workspace a company name when prompted — it appears on reports, purchase orders, and team invites.',
      'You can change the name anytime under Settings → Organization.',
    ],
  },
  {
    n: 2,
    icon: MapPin,
    title: 'Add your storage locations',
    what: 'Locations are where you keep stock and assets — warehouses, storerooms, vehicles, or job sites.',
    how: [
      'Go to Setup → Locations and add each place you hold inventory.',
      'Nest locations if you like — e.g. a Warehouse with Shelves inside it.',
      'Have a lot? Use “Import from CSV/Excel” to add them all at once.',
    ],
  },
  {
    n: 3,
    icon: Tag,
    title: 'Set up categories',
    what: 'Categories group your products and assets so you can filter lists and read cleaner reports.',
    how: [
      'Go to Setup → Categories.',
      'Choose whether each category applies to products, fixed assets, or both.',
      'Keep it simple to start — you can always add more later.',
    ],
  },
  {
    n: 4,
    icon: Truck,
    title: 'Add your vendors',
    what: 'Your vendors are needed to raise purchase orders and receive stock against them.',
    how: [
      'Go to Setup → Vendors.',
      'Capture payment terms, lead time, and an over-receipt tolerance so receiving is accurate.',
      'Import your existing vendor list from CSV/Excel in one go.',
    ],
  },
  {
    n: 5,
    icon: Boxes,
    title: 'Import your products',
    what: 'This is your catalog — the items you buy, hold, and consume.',
    how: [
      'Go to Setup → Products.',
      'Download the CSV template, fill in name, SKU, barcode, unit, and reorder point, then upload.',
      'Or add a few items by hand to get going quickly.',
    ],
  },
  {
    n: 6,
    icon: ArrowLeftRight,
    title: 'Record your opening stock',
    what: 'Enter what you currently have on hand so your balances and inventory valuation start out accurate.',
    how: [
      'Go to New Transaction and record a purchase/receipt (or an adjustment) for each item.',
      'Set the quantity and unit cost — this establishes your starting value.',
      'From here on, every movement keeps your balances and costs up to date automatically.',
    ],
  },
  {
    n: 7,
    icon: Building2,
    title: 'Add fixed assets & tools',
    optional: true,
    what: 'Track equipment and tools alongside your stock — with depreciation and check-in / check-out custody.',
    how: [
      'Go to Setup → Fixed Assets.',
      'Record purchase cost, useful life, and a depreciation method (straight-line, declining balance, and more).',
      'Turn on check-out approval per tool if you want to control who takes what into the field.',
    ],
  },
  {
    n: 8,
    icon: Users,
    title: 'Invite your team',
    optional: true,
    what: 'Bring coworkers in and give each the right level of access.',
    how: [
      'Go to Settings → Users and send invites by email.',
      'Assign a role — Owner, Procurement, Operations, Receiver, Finance, or Viewer.',
      'Roles keep sensitive actions (like approving POs or editing costs) to the right people.',
    ],
  },
]

const TIPS = [
  {
    icon: Upload,
    title: 'Bulk-import everything',
    body: 'Every Setup tab has an “Import from CSV/Excel” button with a downloadable template. It’s the fastest way to load locations, vendors, products, and assets.',
  },
  {
    icon: ScanBarcode,
    title: 'Use the mobile app in the field',
    body: 'Scan barcodes to receive, transfer, and consume stock from your phone. It queues actions offline and syncs when you’re back on signal.',
  },
  {
    icon: CheckCircle2,
    title: 'Follow the in-app guide',
    body: 'Once you’re signed in, the “Start here” tab on the Setup page tracks your progress and links straight to each step.',
  },
]

export default function GettingStartedPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Minimal nav */}
      <nav className="border-b border-slate-100 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center">
              <Package className="w-3.5 h-3.5 text-white" strokeWidth={2.5} />
            </div>
            <span className="font-bold text-slate-900">Stocked</span>
          </Link>
          <Link href="/" className="text-sm text-slate-500 hover:text-slate-700">← Back to home</Link>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-6 py-16">
        {/* Hero */}
        <div className="mb-12">
          <h1 className="text-3xl font-bold text-slate-900 mb-3">Getting started with Stocked</h1>
          <p className="text-base text-slate-500 leading-relaxed">
            Set up your account in about 20 minutes. Follow these steps in order — the first six get
            you fully operational, and the last two make Stocked even more powerful. Most of it can be
            bulk-imported from a spreadsheet.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/register"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors">
              Start your free trial <ArrowRight className="w-4 h-4" />
            </Link>
            <Link href="/login"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-50 transition-colors">
              Sign in
            </Link>
          </div>
        </div>

        {/* Steps */}
        <div className="space-y-5">
          {STEPS.map(step => {
            const Icon = step.icon
            return (
              <section key={step.n} className="rounded-2xl border border-slate-200 p-6">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-11 h-11 rounded-xl bg-indigo-50 flex items-center justify-center">
                    <Icon className="w-5 h-5 text-indigo-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-indigo-500">STEP {step.n}</span>
                      {step.optional && (
                        <span className="text-[10px] uppercase tracking-wide font-semibold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                          Optional
                        </span>
                      )}
                    </div>
                    <h2 className="text-lg font-semibold text-slate-900 mt-0.5">{step.title}</h2>
                    <p className="text-sm text-slate-500 mt-1.5 leading-relaxed">{step.what}</p>
                    <ul className="mt-3 space-y-1.5">
                      {step.how.map((line, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                          <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                          <span>{line}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </section>
            )
          })}
        </div>

        {/* Tips */}
        <div className="mt-14">
          <h2 className="text-xl font-bold text-slate-900 mb-5">A few tips for a smooth start</h2>
          <div className="grid sm:grid-cols-3 gap-4">
            {TIPS.map(tip => {
              const Icon = tip.icon
              return (
                <div key={tip.title} className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
                  <Icon className="w-5 h-5 text-indigo-600 mb-2" />
                  <p className="text-sm font-semibold text-slate-900">{tip.title}</p>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">{tip.body}</p>
                </div>
              )
            })}
          </div>
        </div>

        {/* Closing CTA */}
        <div className="mt-14 rounded-2xl bg-gradient-to-br from-indigo-600 to-indigo-700 p-8 text-center">
          <h2 className="text-xl font-bold text-white">Ready to set up your inventory?</h2>
          <p className="text-sm text-indigo-100 mt-1.5">Free for 14 days. No credit card required.</p>
          <Link href="/register"
            className="mt-5 inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white text-indigo-700 text-sm font-semibold hover:bg-indigo-50 transition-colors">
            Create your account <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-slate-100 py-6">
        <div className="max-w-3xl mx-auto px-6 flex gap-6 text-xs text-slate-400">
          <Link href="/privacy" className="hover:text-slate-600">Privacy Policy</Link>
          <Link href="/terms"   className="hover:text-slate-600">Terms of Service</Link>
          <Link href="/getting-started" className="hover:text-slate-600">Getting Started</Link>
        </div>
      </div>
    </div>
  )
}
