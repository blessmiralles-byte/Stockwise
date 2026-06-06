import Link from 'next/link'
import { Package } from 'lucide-react'

export const metadata = {
  title: 'Terms of Service — StockWise',
  description: 'The terms and conditions for using StockWise.',
}

const EFFECTIVE_DATE = 'June 2, 2026'
const CONTACT_EMAIL  = 'legal@stockwise.app'

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Minimal nav */}
      <nav className="border-b border-slate-100 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center">
              <Package className="w-3.5 h-3.5 text-white" strokeWidth={2.5} />
            </div>
            <span className="font-bold text-slate-900">StockWise</span>
          </Link>
          <Link href="/" className="text-sm text-slate-500 hover:text-slate-700">← Back to home</Link>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Terms of Service</h1>
        <p className="text-sm text-slate-400 mb-10">Effective date: {EFFECTIVE_DATE}</p>

        <div className="prose prose-slate max-w-none text-sm leading-relaxed space-y-8">

          <section>
            <h2 className="text-lg font-semibold text-slate-800 mb-3">1. Acceptance of terms</h2>
            <p className="text-slate-600">
              By creating an account or using StockWise (&quot;Service&quot;), you agree to these Terms of
              Service (&quot;Terms&quot;). If you are accepting on behalf of a company or other legal entity,
              you represent that you have the authority to bind that entity. If you do not agree to
              these Terms, do not use the Service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-800 mb-3">2. The service</h2>
            <p className="text-slate-600">
              StockWise is a cloud-based inventory management platform. We provide the software as
              a service (SaaS) on a subscription basis. We reserve the right to modify or
              discontinue the Service at any time with reasonable notice.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-800 mb-3">3. Accounts and organizations</h2>
            <div className="space-y-3 text-slate-600">
              <p>
                You must register for an account to use the Service. You are responsible for
                maintaining the confidentiality of your credentials and for all activity that occurs
                under your account.
              </p>
              <p>
                Each organization on StockWise has one designated &quot;Owner&quot; who is responsible for
                managing team members, roles, and the subscription. The Owner is responsible for
                ensuring that all team members comply with these Terms.
              </p>
              <p>
                You must provide accurate registration information and keep it updated. Accounts
                created with false information may be terminated without notice.
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-800 mb-3">4. Subscriptions and billing</h2>
            <div className="space-y-3 text-slate-600">
              <p>
                Paid subscriptions are billed in advance on a monthly basis via Stripe. By
                subscribing you authorize us to charge your payment method on a recurring basis.
              </p>
              <p>
                <strong>Free trial.</strong> New accounts receive a 14-day free trial with full
                access to all features. No credit card is required to start a trial. At the end of
                the trial, the account is downgraded to a read-only state unless a paid plan is
                activated.
              </p>
              <p>
                <strong>Cancellations.</strong> You may cancel your subscription at any time via
                the Billing settings page or the Stripe customer portal. Cancellation takes effect
                at the end of the current billing period; no refunds are issued for partial months.
              </p>
              <p>
                <strong>Price changes.</strong> We may change subscription prices with at least
                30 days&apos; notice. Continued use after the effective date constitutes acceptance.
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-800 mb-3">5. Acceptable use</h2>
            <p className="text-slate-600 mb-3">You agree not to:</p>
            <ul className="list-disc pl-5 space-y-1.5 text-slate-600">
              <li>Use the Service for any unlawful purpose or in violation of any regulations</li>
              <li>Attempt to gain unauthorized access to the Service or other users&apos; data</li>
              <li>Transmit viruses, malware, or other malicious code</li>
              <li>Reverse engineer, decompile, or attempt to extract the source code of the Service</li>
              <li>Resell or sub-license the Service without our written permission</li>
              <li>Use automated scripts to scrape, crawl, or stress-test the Service</li>
              <li>Impersonate another person or entity</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-800 mb-3">6. Your data</h2>
            <div className="space-y-3 text-slate-600">
              <p>
                You retain ownership of all data you input into StockWise (&quot;Customer Data&quot;). We
                process Customer Data solely to provide and improve the Service as described in our{' '}
                <Link href="/privacy" className="text-indigo-600 hover:underline">Privacy Policy</Link>.
              </p>
              <p>
                You grant us a limited, non-exclusive licence to host, store, and process Customer
                Data for the purpose of delivering the Service to you.
              </p>
              <p>
                You are responsible for the accuracy, legality, and integrity of Customer Data.
                We are not responsible for loss of data caused by your own actions or by events
                outside our reasonable control.
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-800 mb-3">7. Intellectual property</h2>
            <p className="text-slate-600">
              The Service, including its software, design, and content (excluding Customer Data),
              is the exclusive property of StockWise and is protected by copyright, trademark, and
              other intellectual property laws. You may not copy, modify, or distribute any part
              of the Service without our prior written consent.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-800 mb-3">8. Uptime and service levels</h2>
            <p className="text-slate-600">
              We aim for high availability but do not guarantee any specific uptime percentage
              on Starter or Pro plans. We reserve the right to perform maintenance that temporarily
              interrupts the Service with reasonable notice where practicable. For Enterprise SLA
              commitments, contact us.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-800 mb-3">9. Disclaimer of warranties</h2>
            <p className="text-slate-600">
              THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; WITHOUT WARRANTIES OF ANY KIND,
              EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY,
              FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE
              SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR FREE OF VIRUSES.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-800 mb-3">10. Limitation of liability</h2>
            <p className="text-slate-600">
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, STOCKWISE SHALL NOT BE LIABLE FOR ANY
              INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING OUT OF
              OR RELATED TO YOUR USE OF THE SERVICE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH
              DAMAGES. OUR TOTAL CUMULATIVE LIABILITY TO YOU SHALL NOT EXCEED THE AMOUNTS PAID
              BY YOU TO US IN THE TWELVE (12) MONTHS PRECEDING THE CLAIM.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-800 mb-3">11. Indemnification</h2>
            <p className="text-slate-600">
              You agree to indemnify and hold harmless StockWise and its officers, directors,
              employees, and agents from any claims, damages, or expenses (including reasonable
              attorneys&apos; fees) arising from your use of the Service, violation of these Terms, or
              infringement of any third-party rights by you or your team members.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-800 mb-3">12. Termination</h2>
            <p className="text-slate-600">
              Either party may terminate the agreement at any time. We may suspend or terminate
              your account immediately for material breach of these Terms, non-payment, or
              suspected fraudulent activity. Upon termination, your right to use the Service
              ceases and we will delete your Customer Data within 30 days (subject to legal holds).
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-800 mb-3">13. Governing law</h2>
            <p className="text-slate-600">
              These Terms are governed by and construed in accordance with the laws of the
              jurisdiction in which StockWise is incorporated, without regard to conflict of law
              principles. Any disputes shall be resolved in the courts of that jurisdiction.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-800 mb-3">14. Changes to terms</h2>
            <p className="text-slate-600">
              We may update these Terms from time to time. We will notify account owners by email
              at least 14 days before material changes take effect. Your continued use of the
              Service after the effective date constitutes acceptance of the updated Terms.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-800 mb-3">15. Contact</h2>
            <p className="text-slate-600">
              For questions about these Terms, email{' '}
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
