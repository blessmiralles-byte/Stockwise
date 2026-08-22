import Link from 'next/link'
import { Package, Trash2, ShieldCheck, Mail } from 'lucide-react'

export const metadata = {
  title: 'Delete your account — Stocked',
  description: 'How to delete your Stocked account and what data is removed.',
}

const CONTACT_EMAIL = 'privacy@stocked.tech'

export default function DeleteAccountPage() {
  return (
    <div className="min-h-screen bg-white">
      <nav className="border-b border-slate-100 px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center">
              <Package className="w-3.5 h-3.5 text-white" strokeWidth={2.5} />
            </div>
            <span className="font-bold text-slate-900">Stocked</span>
          </Link>
          <Link href="/" className="text-sm text-slate-500 hover:text-slate-700">← Back to home</Link>
        </div>
      </nav>

      <div className="max-w-2xl mx-auto px-6 py-14">
        <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center mb-5">
          <Trash2 className="w-6 h-6 text-red-500" />
        </div>
        <h1 className="text-3xl font-bold text-slate-900 mb-3">Delete your Stocked account</h1>
        <p className="text-base text-slate-500 leading-relaxed mb-10">
          You can permanently delete your Stocked account and its data at any time. Here&apos;s how,
          and exactly what gets removed.
        </p>

        <section className="mb-8">
          <h2 className="text-lg font-semibold text-slate-800 mb-3">Delete it yourself (fastest)</h2>
          <ol className="list-decimal pl-5 space-y-2 text-slate-600 text-sm leading-relaxed">
            <li>Sign in to Stocked at <Link href="/login" className="text-indigo-600 hover:underline">stocked.tech</Link> (web) or in the mobile app.</li>
            <li>Go to <strong>Settings → General</strong>.</li>
            <li>Scroll to <strong>Delete account</strong>, confirm, and your account is removed immediately.</li>
          </ol>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-semibold text-slate-800 mb-3">Request deletion by email</h2>
          <p className="text-sm text-slate-600 leading-relaxed">
            Prefer we handle it? Email{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-indigo-600 hover:underline">{CONTACT_EMAIL}</a>{' '}
            from the address on your account with the subject <em>&ldquo;Delete my account&rdquo;</em>. We verify
            ownership and complete the deletion within <strong>30 days</strong>.
          </p>
        </section>

        <section className="mb-8">
          <div className="rounded-2xl border border-slate-200 p-5">
            <div className="flex items-center gap-2 mb-3">
              <ShieldCheck className="w-5 h-5 text-slate-500" />
              <h2 className="text-lg font-semibold text-slate-800">What gets deleted</h2>
            </div>
            <ul className="space-y-1.5 text-sm text-slate-600">
              <li>• Your login and profile (name, email).</li>
              <li>• If you&apos;re the account <strong>Owner</strong>: your entire organization — inventory, assets, vendors, purchase orders, transactions, reports, and every team member&apos;s access.</li>
              <li>• If you&apos;re a <strong>team member</strong>: only your own login. Your organization&apos;s data stays with the owner.</li>
            </ul>
            <p className="text-xs text-slate-400 mt-4">
              Deletion is permanent and cannot be undone. Some records may be retained only where
              required by law (e.g. tax/payment records held by our payment processor), and backups
              are purged on a rolling 30-day cycle.
            </p>
          </div>
        </section>

        <div className="flex flex-wrap gap-3">
          <Link href="/login"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition-colors">
            Sign in to delete <Trash2 className="w-4 h-4" />
          </Link>
          <a href={`mailto:${CONTACT_EMAIL}`}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-50 transition-colors">
            <Mail className="w-4 h-4" /> Email a request
          </a>
        </div>
      </div>

      <div className="border-t border-slate-100 py-6">
        <div className="max-w-2xl mx-auto px-6 flex gap-6 text-xs text-slate-400">
          <Link href="/privacy" className="hover:text-slate-600">Privacy Policy</Link>
          <Link href="/terms" className="hover:text-slate-600">Terms of Service</Link>
          <a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-slate-600">Contact</a>
        </div>
      </div>
    </div>
  )
}
