import Link from 'next/link'
import { Package } from 'lucide-react'

export const metadata = {
  title: 'Privacy Policy — Stocked',
  description: 'How Stocked collects, uses, and protects your data.',
}

const EFFECTIVE_DATE = 'June 2, 2026'
const CONTACT_EMAIL  = 'privacy@stocked.tech'
const COMPANY_NAME   = 'Stocked'

export default function PrivacyPage() {
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
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Privacy Policy</h1>
        <p className="text-sm text-slate-400 mb-10">Effective date: {EFFECTIVE_DATE}</p>

        <div className="prose prose-slate max-w-none text-sm leading-relaxed space-y-8">

          <section>
            <h2 className="text-lg font-semibold text-slate-800 mb-3">1. Who we are</h2>
            <p className="text-slate-600">
              {COMPANY_NAME} (&quot;we&quot;, &quot;our&quot;, &quot;us&quot;) operates the Stocked inventory management
              platform accessible at this website and via our mobile applications. This Privacy
              Policy explains how we collect, use, disclose, and safeguard your information when
              you use our service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-800 mb-3">2. Information we collect</h2>
            <div className="space-y-3 text-slate-600">
              <p><strong>Account information.</strong> When you register, we collect your name, email
              address, and the name of your organization. We use this to create and manage your
              account.</p>
              <p><strong>Business data.</strong> We store the inventory records, purchase orders,
              assets, transactions, and other data that you and your team enter into Stocked.
              This data belongs to you.</p>
              <p><strong>Usage data.</strong> We automatically collect information about how you
              interact with the service, including IP addresses, browser type, pages visited, and
              actions taken within the app. This data helps us improve the product.</p>
              <p><strong>Payment information.</strong> We use Stripe to process payments. We do not
              store your full credit card number — Stripe handles payment data under their own
              privacy policy and PCI-DSS compliance.</p>
              <p><strong>Communications.</strong> If you contact us by email, we retain that
              correspondence to assist you and improve support.</p>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-800 mb-3">3. How we use your information</h2>
            <ul className="list-disc pl-5 space-y-1.5 text-slate-600">
              <li>Provide, maintain, and improve the Stocked service</li>
              <li>Process transactions and send billing-related emails</li>
              <li>Send transactional notifications (e.g. invite emails, maintenance alerts)</li>
              <li>Respond to your support requests</li>
              <li>Monitor for and prevent fraud, abuse, and security incidents</li>
              <li>Comply with legal obligations</li>
            </ul>
            <p className="text-slate-600 mt-3">
              We do <strong>not</strong> sell your personal data or your business data to third
              parties. We do not use your business data to train machine-learning models without
              your explicit consent.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-800 mb-3">4. Data sharing and sub-processors</h2>
            <p className="text-slate-600 mb-3">
              We share your data only with the following trusted sub-processors, each of which is
              bound by contractual data protection obligations:
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border border-slate-200 rounded-lg overflow-hidden">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold text-slate-700">Provider</th>
                    <th className="text-left px-3 py-2 font-semibold text-slate-700">Purpose</th>
                    <th className="text-left px-3 py-2 font-semibold text-slate-700">Location</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-600">
                  <tr>
                    <td className="px-3 py-2">Supabase</td>
                    <td className="px-3 py-2">Database and authentication hosting</td>
                    <td className="px-3 py-2">US (AWS)</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2">Stripe</td>
                    <td className="px-3 py-2">Payment processing</td>
                    <td className="px-3 py-2">US</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2">Resend</td>
                    <td className="px-3 py-2">Transactional email delivery</td>
                    <td className="px-3 py-2">US</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2">Vercel</td>
                    <td className="px-3 py-2">Application hosting and CDN</td>
                    <td className="px-3 py-2">Global (US primary)</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-800 mb-3">5. Data retention</h2>
            <p className="text-slate-600">
              We retain your account data for as long as your account is active. If you delete your
              account, we will delete your personal data within 30 days, except where we are
              required to retain it for legal, tax, or fraud-prevention purposes. Aggregated,
              anonymised analytics data may be retained indefinitely.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-800 mb-3">6. Security</h2>
            <p className="text-slate-600">
              We implement industry-standard security measures including TLS in transit, AES-256
              encryption at rest (via Supabase / AWS), row-level security so each organization can
              only access its own data, and regular automated backups. No system is 100% secure;
              if you discover a vulnerability please email{' '}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-indigo-600 hover:underline">{CONTACT_EMAIL}</a>.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-800 mb-3">7. Your rights</h2>
            <p className="text-slate-600 mb-3">
              Depending on your jurisdiction, you may have the following rights regarding your
              personal data:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-slate-600">
              <li><strong>Access.</strong> Request a copy of the personal data we hold about you.</li>
              <li><strong>Rectification.</strong> Ask us to correct inaccurate data.</li>
              <li><strong>Erasure.</strong> Request deletion of your data (&quot;right to be forgotten&quot;).</li>
              <li><strong>Portability.</strong> Receive your data in a machine-readable format.</li>
              <li><strong>Restriction.</strong> Ask us to restrict processing in certain circumstances.</li>
              <li><strong>Objection.</strong> Object to processing based on legitimate interests.</li>
            </ul>
            <p className="text-slate-600 mt-3">
              To exercise any right, email{' '}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-indigo-600 hover:underline">{CONTACT_EMAIL}</a>.
              We will respond within 30 days.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-800 mb-3">8. Cookies</h2>
            <p className="text-slate-600">
              We use only functional cookies required for authentication (Supabase session tokens).
              We do not use third-party tracking, advertising, or analytics cookies.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-800 mb-3">9. Children</h2>
            <p className="text-slate-600">
              Stocked is intended for business use by persons 18 years or older. We do not
              knowingly collect data from children under 13. If you believe we have inadvertently
              collected such data, contact us immediately.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-800 mb-3">10. Changes to this policy</h2>
            <p className="text-slate-600">
              We may update this policy from time to time. When we do, we will update the effective
              date at the top of this page and, for material changes, notify account owners by
              email at least 14 days before changes take effect.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-800 mb-3">11. Contact us</h2>
            <p className="text-slate-600">
              If you have questions about this policy or your data, please email{' '}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-indigo-600 hover:underline">{CONTACT_EMAIL}</a>.
            </p>
          </section>

        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-slate-100 py-6">
        <div className="max-w-3xl mx-auto px-6 flex gap-6 text-xs text-slate-400">
          <Link href="/privacy" className="hover:text-slate-600">Privacy Policy</Link>
          <Link href="/terms"   className="hover:text-slate-600">Terms of Service</Link>
          <a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-slate-600">Contact</a>
        </div>
      </div>
    </div>
  )
}
