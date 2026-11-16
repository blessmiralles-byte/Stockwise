# Stocked — handoff and pre-launch fix list (2026-11-12)

Paste one step at a time into a new session opened in `C:\Users\Bless Miralles\stockwise`.
Each step is written so it can be run on its own. Do them in order; steps 1–2 are the
only ones blocking anything.

## Where things stand

- Web app: this folder. Next.js 16 (read `AGENTS.md` first), Supabase, Vercel deploys from `main`.
- Mobile app: `C:\dev\stocked-mobile` (Expo, branch `master`).
- Everything is pushed to `main` (up to `3626c63`).
- All SQL scripts have been run in Supabase, including `scripts/migrate-returns.sql`.
- **Step 1 is DONE (2026-11-12)**: returns tested signed in against the real database, all 11 checks passed, no fixes needed.
- **Step 2 is DONE (2026-11-12)**: every role tested signed in; fixes in `src/lib/permissions.ts` (the single place for who-may-do-what). Rerun after any permission change: start the dev server, then `node scripts/test-roles.js setup`, `node scripts/test-roles.js run`, `node scripts/test-roles.js remove`.
- **Step 3 is DONE (2026-11-12)**: a location with an open count (open/counting/reviewing) takes no stock movements; rule in `src/lib/count-freeze.ts`, applied at every path that moves stock. Tested live. Start at Step 4.
- If the dev server starts answering every dynamic API route (`/api/x/[id]`) with an HTML 404, it is a stuck dev server, not the code: stop and start it again.
- 838 unit tests pass; `npm run build` passes (2026-11-17, at `b333bcf`).
- **Step 4 is PARTLY done (2026-11-16)**: all 12 test-mode checkouts open with the right product and price. Not yet done: one paid test checkout → webhook → plan change, then upgrade, downgrade, cancel, expiry. The owner pays with the Lemon Squeezy test card; the throwaway company is in the session scratchpad (`walk-creds.json`) and must be purged at the end.
- Also shipped 2026-11-16: sign-up rejects an already-registered email; reset-password email works from any browser (Supabase template now links to `/auth/confirm?token_hash=…`, copy in `docs/email-templates/reset-password.html`); the paywall offers Stocked Tools free or paid (`/api/billing/tools-free`); Add Tool hides Category and adds locations inline for Tools plans; a tool's current certificate can be entered when scheduling an inspection or calibration.
- **A launch-readiness audit was run 2026-11-17. Its findings are the "Launch audit" section below. Do A1 before anything else.**

## Rules for whoever runs these steps

- `npm run build` runs the tests then the build. Both must pass before any push.
- Every database query in an API route must be scoped with `.eq('org_id', auth.orgId)`.
- Database changes: write a script in `scripts/`, the owner pastes it into the Supabase SQL editor. Never assume it has been run.
- On this Windows machine, do not put scripts or commit messages in shell heredocs. Write them to a file, then `node file.js` or `git commit -F file.txt`.
- Never tell the owner something works unless it was exercised through a real route while signed in.

### How to test as a signed-in user (used in several steps)

1. Create a throwaway company with the Supabase service role: `auth.admin.createUser` with
   `email_confirm: true` and metadata `onboarding_complete: true`, then its organization and
   owner profile. Mark the names "(delete me)".
2. Start the dev server (port 3005), sign in at `http://localhost:3005/login`.
3. Call the real routes with `fetch` from the page and check balances and reports after each call.
4. Delete the company afterwards with the `purge_organization` database function, then delete the login.

---

## Launch audit (2026-11-17) — fix list, most serious first

Each item says what was observed, where, and how to prove the fix. Items marked **BLOCKER**
must be done before any real customer signs up. Nothing here depends on Lemon Squeezy going
live or on business registration.

### A1 — BLOCKER: any signed-in customer can read and change other companies' data

> Observed: signed in as a throwaway owner with only the public anon key, a direct Supabase
> query (`supabase.from('products').select('*')`, no API route) returned other organizations'
> rows from: `products`, `inventory_transactions`, `inventory_balances`, `inventory_batches`,
> `fixed_assets`, `asset_depreciation_log`, `maintenance_schedules`, `locations`, `categories`,
> `suppliers`, `accountable_persons`, `requisitions`, `requisition_items`, `audit_log`,
> `user_profiles` (other customers' names and emails) and `job_codes`. `job_codes` is also
> readable with no login at all. The anon key ships in the browser and in the mobile app, so
> any customer can do this from the browser console.
>
> Cause: `supabase-schema.sql` lines 150–159 create `"Authenticated users full access" … for
> all using (auth.role() = 'authenticated')`, which also allows insert, update and delete.
> Later scripts (`migrate-multitenancy.sql`, `migrate-rls-sod.sql`) add org-scoped policies but
> policies are OR'd, so the open ones still win. `migrate-job-codes.sql` has a fallback
> `job_codes_open … USING (true)`.
>
> Do: (1) give the owner this query to run and paste back, so the fix is written against the
> real state: `select tablename, policyname, cmd, roles, qual, with_check from pg_policies
> where schemaname = 'public' order by 1, 2;` plus `select relname, relrowsecurity from pg_class
> where relnamespace = 'public'::regnamespace and relkind = 'r';`
> (2) Write `scripts/migrate-rls-lockdown.sql`: drop every policy that is not org-scoped, and
> leave one read policy per table of the form `org_id = current_user_org_id()` (child tables
> with no `org_id`, e.g. `requisition_items`, `purchase_order_lines`, `stock_count_lines`, go
> through their parent). Web writes all go through API routes with the service role, so
> authenticated users need **no** direct write policy. Check before removing writes: the mobile
> app (`C:\dev\stocked-mobile\app\(tabs)\index.tsx`, `log.tsx`, `_layout.tsx`) reads
> `products`, `locations`, `suppliers`, `user_profiles`, `inventory_transactions` directly, so
> org-scoped reads must keep working; grep it for direct writes too.
> (3) Commit the read-only probe as `scripts/test-rls.js` (the audit's version: for every table
> in the REST schema, count rows visible to anon and rows with a foreign `org_id` visible to a
> signed-in throwaway owner; also try an anon insert and a cross-org update on a second
> throwaway company, never on real rows). It must print zero anon-readable tables and zero
> foreign rows. Add it to the "rerun after any database change" notes.
> (4) After the owner runs the SQL: rerun the probe, rerun `scripts/test-roles.js`, and open the
> mobile log screen signed in to confirm products and locations still load.

### A2 — BLOCKER: update packages with known security holes

> `npm audit --omit=dev` reports 2 critical and 8 high. Direct ones: `next` 16.2.6 (critical,
> fixed in 16.4.6; also clears `postcss` and `sharp`), `@sentry/nextjs` (critical, fix
> available), `zod` (high, `npm audit fix`), `xlsx` 0.18.5 (high, **no fix on npm**).
> Do: bump `next` to the patched 16.x and read the upgrade notes in `node_modules/next/dist/docs/`
> first (AGENTS.md); bump Sentry; `npm audit fix` for the rest. For `xlsx`: it parses customer
> uploads in `src/app/api/import/[entity]/route.ts` and `src/components/inventory/recode-dialog.tsx`;
> either install the maintained build from the SheetJS CDN tarball or switch the import path to
> `exceljs`, and keep the existing upload size and row caps. Then `npm run build`, a signed-in
> smoke test (login, dashboard, one import, one export), and push.

### A3 — BLOCKER (already Step 5.1): shared API keys reach every company

> `POS_API_KEY` (`src/app/api/pos/sale/route.ts`) is one key for all customers and takes the
> company from the `location_id` in the request, so whoever holds it can sell stock out of any
> company. Same shape as `ACCOUNTING_API_KEY` and `JOBLEDGER_API_KEY` in Step 5.1. Fold POS
> into that work: one key per organization, stored hashed, created and revoked in Settings.
> Until then none of the three keys may be given to a customer.

### A4 — Site basics missing on the live site

> Checked on https://www.stocked.tech:
> 1. `/robots.txt` and `/sitemap.xml` return 404, though `proxy.ts` lists them as public. Add
>    `src/app/robots.ts` and `src/app/sitemap.ts` (home, `/tools`, `/getting-started`,
>    `/privacy`, `/terms`, `/register`, `/login`; disallow `/api/` and the app pages).
> 2. `/api/health` returns 401, so no uptime monitor can use it. Add it to `API_EXEMPT_PATHS`
>    in `src/proxy.ts`; also stop returning the raw database error text to anonymous callers.
> 3. No security headers except HSTS, and `X-Powered-By: Next.js` is sent. In `next.config.ts`
>    set `poweredByHeader: false` and add headers: `X-Content-Type-Options: nosniff`,
>    `X-Frame-Options: DENY` (or CSP `frame-ancestors 'none'`), `Referrer-Policy:
>    strict-origin-when-cross-origin`, `Permissions-Policy` (camera allowed for self, since the
>    scanner uses it), and a Content-Security-Policy that still allows Supabase, Sentry, Lemon
>    Squeezy checkout and inline Next scripts. Verify the scanner, checkout redirect and
>    support chat still work with the CSP on.
> 4. Any unknown URL redirects to `/login` (e.g. `/nonexistent-page`). Add `src/app/not-found.tsx`
>    and have `proxy.ts` let unmatched public URLs reach it.
> 5. There is no `error.tsx` outside `(field)`. Add `src/app/global-error.tsx` and
>    `src/app/(dashboard)/error.tsx` with a plain message, a retry button, and a Sentry capture.
> 6. `/one-pager` is public and `/luxury-preview` still exists (Step 5.2). Remove both, and
>    remove `/one-pager` from `PUBLIC_PATHS`.
> 7. `public/` holds only the default Next/Vercel SVGs. Remove them; confirm the favicon, app
>    icon and Open Graph image render (they come from `src/app`).

### A5 — Email links

> 1. `docs/email-templates/confirm-signup.html` still uses `{{ .ConfirmationURL }}`: a new
>    customer who opens the confirmation on a different device lands on the sign-in page with
>    an error. Change it to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/dashboard`
>    (same fix as the reset email), verify `/auth/confirm` handles `type=email` and that the
>    onboarding gate still runs, then give the owner the file to paste into Supabase →
>    Authentication → Emails → Confirm signup. Do the same check for the Invite, Magic Link and
>    Change Email templates and put a copy of each in `docs/email-templates/`.
> 2. Not yet proven: that a brand-new sign-up email arrives. The last real one was 2026-10-21.
>    A probe to an `@example.com` address returned "Error sending confirmation email" (likely
>    just the undeliverable address). Ask the owner to sign up with a `+test` alias and confirm
>    arrival; if it fails, check Supabase → Authentication → SMTP settings (custom SMTP through
>    Resend with the stocked.tech domain; the built-in sender is limited to a few emails an hour
>    and must not be used in production).
> 3. Step 8's "check each notification email arrives" is still open.

### A6 — Dates use UTC, not the customer's day (extends Step 5.3)

> Seen live: at 01:00 in Manila the Schedule Maintenance form defaulted to yesterday's date.
> 56 places build "today" with `new Date().toISOString().split('T')[0]` (or `.slice(0, 10)`).
> Add one helper for "today in the organization's time zone" (the browser's local date on
> client forms; the org time zone on the server) and replace them all, together with the report
> ranges in Step 5.3. Includes `completed_date` in the Mark as Done dialog, which is also shown
> as a disabled field the user cannot correct.

### A7 — Stocked Tools gaps found while testing the free plan

> 1. Tools accounts can add locations (inline, on Add Tool) but cannot rename or remove one:
>    `/locations` is allowed by `TOOLS_PAGES_ALLOWED` in `src/lib/entitlements.ts` but is not in
>    their sidebar. Add a simple Locations entry to the Tools sidebar (names only, no codes).
> 2. Add Tool → Maintenance tab only schedules plain maintenance. Let it choose Inspection or
>    Calibration and take the current certificate, reusing the fields added to `ScheduleDialog`
>    in `src/app/(dashboard)/maintenance/page.tsx`.
> 3. After switching to Tools Free from the paywall, the 409 a second call gets says "active
>    plan … cancel it" even when the account is already on Tools Free; give that case its own
>    message in `src/app/api/billing/tools-free/route.ts`.
> 4. Walk every page a Tools Free and a paid Tools account can reach (Tools, Maintenance,
>    Reports, Audit Log, Settings, Scan) at phone width and desktop: no field or report may ask
>    for data the plan gives no way to enter, and no link may lead to a blocked page.
> 5. The paywall's switch to Tools Free was tested on a local copy only. Repeat it once on the
>    live site with a throwaway company.

### A8 — Privacy policy and terms

> 1. `src/app/privacy/page.tsx` lists Supabase, Vercel, Resend and Lemon Squeezy but not Sentry
>    (error reports), Anthropic (the support chat sends the customer's messages there) or
>    Upstash (rate limiting, if configured). Add them.
> 2. `src/app/terms/page.tsx` §13 says "the jurisdiction in which Stocked is incorporated".
>    Leave a clearly marked constant for the legal entity name, address and governing law so
>    the owner fills one place once registration is done (owner checklist item).

### A9 — Vercel environment variables to confirm (owner reads them off, Opus compares)

> Used by the code: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
> `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SITE_URL` (must be `https://www.stocked.tech`),
> `CRON_SECRET` (all five crons in `vercel.json` return 401 without it), `RESEND_API_KEY`,
> `RESEND_FROM_EMAIL`, `TRIAL_HASH_PEPPER` (one trial per email), `ANTHROPIC_API_KEY` (support
> chat), `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (without them rate limits are
> per server instance and do little on Vercel), `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`,
> `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`, `LEMONSQUEEZY_API_KEY`, `LEMONSQUEEZY_STORE_ID`,
> `LEMONSQUEEZY_WEBHOOK_SECRET`, the 12 `LEMONSQUEEZY_VARIANT_*` ids, optional
> `LEMONSQUEEZY_VARIANT_ENTERPRISE`, `UPCITEMDB_API_KEY`, `RETENTION_PURGE`.
> Do: add a `scripts/check-env.js` that lists which are missing, and a signed-in owner-only
> `/api/admin/config-check` that reports set/unset (never values) so this can be checked on
> the live site. `.env.local` still has unused `STRIPE_SECRET_KEY`, `BUSINESS_NAME`,
> `NOTIFICATION_EMAIL`; `src/lib/billing.ts` and `src/lib/account-export.ts` still mention
> Stripe. Clean up. Confirm in the Vercel dashboard that each cron ran last night.

### A10 — Code health (not blocking)

> `npx eslint src` reports 767 errors and is not part of the build: 718 `no-explicit-any`, 19
> unescaped entities, and about 25 React hook errors (`set-state-in-effect`, `purity`,
> `immutability`, `static-components`) that can be real bugs, starting with
> `src/lib/use-api.ts`. Fix the hook errors, downgrade `no-explicit-any` to a warning, then add
> lint to `npm run build`.

### Checked and found fine (no action)

- Build and 838 tests pass. All 107 API routes have an auth check; the six without a session
  helper are the health probe, the public pricing region, and the key-protected POS and
  JobLedger routes.
- Anonymous calls are refused on the live site: webhook, all five cron routes, accounting,
  POS, support chat, `/api/products`, `/dashboard`.
- With no login, the public key reads nothing except `job_codes` (A1), and an anonymous insert
  into `organizations` is refused.
- Tools plans are blocked server-side from non-Tools API routes (`toolsApiBlock` in
  `src/lib/api-auth.ts`), not just hidden in the menu.
- Sign-up is open, email confirmation is required, only the email provider is enabled.
- `stocked.tech` redirects to `www`; HSTS is on.

---

## Step 1 — Test returns for real, then push

> Test the returns feature end to end on a throwaway company, as a signed-in owner, using the
> method in HANDOFF.md. Code: `src/app/api/returns/route.ts`, `src/lib/returns.ts`,
> `src/lib/stock-direction.ts`, screen `src/app/(dashboard)/transactions/new/page.tsx`.
>
> Set up: two locations, one item, a vendor, a job code and a cost center. Create a purchase
> order for 100, approve, send, receive all 100. Issue 10 to the job.
>
> Check each of these and report pass or fail with the numbers:
> 1. `GET /api/returns?product_id=…` lists the job with 10 out, and the purchase order with 100 received.
> 2. Return 4 from the job: stock goes up 4; Expenses and Cost Analysis reports show the job at 6 units; the unit cost matches the issue.
> 3. Return 7 more from the job is refused (only 6 left). Return from a job the item never went to is refused.
> 4. Return 10 to the vendor as "replacement": stock down 10, the order shows 90 received and status `partial`, and the 10 can be received again.
> 5. Return 5 to the vendor as "credit": stock down 5, the line shows ordered and received both reduced by 5, status `received`.
> 6. Return to vendor more than was received is refused. Return more than is on hand is refused with a plain message, not a 500.
> 7. Stock valuation report: closing value equals opening + purchases − issues ± adjustments, with returns netted.
> 8. Item ledger running balance equals the on-hand balance.
> 9. Accounting export shows "Return from Job" and "Return to Vendor" lines with the right accounts.
> 10. Repeat 2 and 4 with an item whose costing method is FIFO.
> 11. Use the New Transaction screen once for each kind of return, by clicking, not by fetch.
>
> Fix anything that fails, add a unit test for it, run `npm run build`, delete the test company,
> then push `main`.

## Step 2 — Role-by-role permission test

> All testing so far was done as the owner. Create one throwaway company with one user per role
> (owner, operations, procurement, finance, receiver, viewer, and a field role if one exists;
> roles are in `src/lib/api-auth.ts`). Sign in as each and check:
> - A procurement user cannot approve their own purchase order, and cannot set a draft order to approved, sent or received (`src/lib/po-status.ts`).
> - Only receiver or owner can receive goods.
> - A viewer cannot post any stock movement, return, adjustment or stock count approval.
> - The person who created a stock count cannot approve it when another approver exists.
> - Each role's sidebar only shows pages it can actually load (no page that 403s).
> Report a table of role × action × expected × actual. Fix mismatches, add tests, build.

## Step 3 — Freeze stock during an open count

> If stock is issued at a location while a stock count is open there, approving the count posts
> the wrong adjustment. Block stock movements at a location while a count for it is in
> `counting` or `reviewing` status, with a plain message naming the count number. Apply it in
> `src/app/api/inventory/route.ts`, `src/app/api/returns/route.ts`,
> `src/app/api/purchase-orders/[id]/receive/route.ts`, transfers, and requisition fulfilment
> (`src/lib/requisition-fulfilment.ts`). Put the rule in one pure function with unit tests.
> Then test it signed in.

## Step 4 — Billing end to end (Lemon Squeezy test mode)

> Walk billing in Lemon Squeezy test mode on a throwaway company: trial → subscribe to Starter,
> Pro and Stocked Tools (monthly and annual, standard and ASEAN price) → webhook updates the
> plan → upgrade → downgrade → cancel → expiry. Plans and prices are in `src/lib/plan-config.ts`
> and `src/lib/entitlements.ts`. Confirm each plan unlocks and locks the right features and that
> a Tools plan is held to 20 tools on the free tier. List every env var that must be set in
> Vercel for live mode. Do not enter any real card; use Lemon Squeezy's published test card.

Owner tasks for this step: create the "Stocked Tools" product in Lemon Squeezy with four
variants ($25/mo and $250/yr standard; $20/mo and $200/yr ASEAN) and set
`LEMONSQUEEZY_VARIANT_TOOLS_STANDARD`, `_ASEAN`, `_STANDARD_ANNUAL`, `_ASEAN_ANNUAL` in Vercel.

## Step 5 — Close the remaining safety gaps

> Do these as separate small commits:
> 1. `ACCOUNTING_API_KEY` and `JOBLEDGER_API_KEY` are shared keys and the caller supplies the
>    org id (`src/app/api/accounting/journal/route.ts`, `src/app/api/jobledger/*`). Replace with
>    a key per organization, stored hashed, so one customer's key cannot read another's data.
> 2. Remove or protect the public pages `/one-pager` and `/luxury-preview`.
> 3. Report date ranges use UTC day boundaries, so a Philippine user's early-morning entries
>    land on the previous day. Use the organization's time zone in `src/lib/report-data.ts`
>    (`parseRange`) and in the expenses, cost-analysis, valuation and journal routes.
> 4. `src/app/api/inventory/ledger/route.ts` reads only the first 500 rows, oldest first, so the
>    running balance is wrong for a busy item. Page it with `src/lib/fetch-paged.ts`.
> 5. Search every API route for selects with no `.range()` or `.limit()` that feed a total, and
>    page them the same way.

## Step 6 — Automated tests that sign in

> There are no tests that exercise a route with a session and the database together; every real
> bug this month was found by hand that way. Add a small suite (separate command, not part of
> the Vercel build) that creates a throwaway company, signs in, and runs: purchase order →
> approve → receive → issue to job → return from job → return to vendor → transfer → stock
> count with a shortage → approve. Assert balances and report totals after each step, and
> always purge the company at the end, even on failure.

## Step 7 — Mobile app

> In `C:\dev\stocked-mobile`: add the two return types to `app/(tabs)/log.tsx` (they post to
> `/api/returns`, see the web screen for the fields) and add labels for `return` and
> `vendor_return` in `app/(tabs)/index.tsx`. Also add the same two types to the web field page
> `src/app/(field)/field/log/page.tsx`. Then produce a new Android build with EAS.

Owner task: install the build on a phone and run receive, issue, return, tool check-out and check-in.

## Step 8 — Smaller follow-ups (any order)

- Forecasting (`src/app/api/forecasting/route.ts`) counts gross issues; subtract job returns.
- Vendor performance report (`src/lib/procurement-reports.ts`) should count returns per vendor.
- Photos on tools (needs Supabase Storage).
- An in-app Cancel subscription button.
- Check that each notification email actually arrives (approval, overdue tools, low stock).

## Owner-only checklist before launch

- [ ] Lemon Squeezy switched to live, with live variant ids in Vercel
- [ ] Google Play developer verification
- [ ] Email forwarding for the stocked.tech addresses
- [ ] Supabase backups confirmed on (and one restore tried)
- [ ] Error monitoring and uptime alerts set up
- [ ] Legal entity name and address on the site
- [ ] Decide whether to turn on `RETENTION_PURGE=on`
- [ ] Never give `ACCOUNTING_API_KEY` or `JOBLEDGER_API_KEY` to a customer until Step 5.1 is done
