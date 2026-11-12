# Stocked — handoff and pre-launch fix list (2026-11-12)

Paste one step at a time into a new session opened in `C:\Users\Bless Miralles\stockwise`.
Each step is written so it can be run on its own. Do them in order; steps 1–2 are the
only ones blocking anything.

## Where things stand

- Web app: this folder. Next.js 16 (read `AGENTS.md` first), Supabase, Vercel deploys from `main`.
- Mobile app: `C:\dev\stocked-mobile` (Expo, branch `master`).
- **Two commits are on local `main` and NOT pushed** (`d90368e` job codes, `248773b` returns).
- All SQL scripts have been run in Supabase, including `scripts/migrate-returns.sql`.
- Returns (from a job, to a vendor) are built and unit-tested but **never tested against the real database**.
- 811 unit tests pass; `npx next build` compiles.

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
