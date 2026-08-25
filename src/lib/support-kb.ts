/**
 * Knowledge base for the in-app Claude support assistant.
 *
 * This is the single source of truth the support bot is grounded in. Keep it
 * factual and feature-accurate — the model is instructed to answer ONLY from
 * this text and to defer to email support for anything not covered here. When
 * a feature ships or changes, update the relevant section below.
 */
export const SUPPORT_KB = `
# Stocked — Product Knowledge Base

Stocked is an inventory, materials, and asset-tracking app for contractors and
field-based businesses. It runs as a web app (dashboard) and an Android mobile
app (field view). Data is organized per organization; the first person to sign
up for an organization is its Owner.

## Accounts, roles & getting started
- The first user to sign up creates the organization and becomes the **Owner**.
- Owners invite teammates from **Settings → Users**. Invited users receive an
  email; when they accept they join the same organization with the role the
  owner assigned (owner, admin, manager, or staff/field).
- New organizations start on a **14-day free trial — no credit card required**.
- The **Getting Started** page walks a new owner through first setup: adding
  vendors, products, locations, and inviting the team.
- To change your organization name, go to **Settings → Organization**.

## Inventory & products
- Add products manually or by scanning a barcode in the field app.
- Each product tracks quantity on hand, unit cost, and can carry custom
  attributes (e.g. color, unit of measure).
- Items scanned or added in the field that are missing details land in a
  **needs-review** state. A manager reviews them from the **Inventory** tab —
  editing details, setting opening stock, and approving them into the catalog.

## Barcodes
- Products can carry a barcode, used for scanning during receiving, stock moves,
  and the field "Add Item" flow.
- Add or edit a product's barcode three ways:
  1. **Type or scan it** in the product form — go to **Setup & Import →
     Products**, add or edit a product, and either type the barcode or tap
     **Scan** to capture it with the camera.
  2. **During item review** — open a needs-review item in the **Inventory** tab
     and type or scan its barcode before approving.
  3. **In bulk** — include a **barcode** column in the product import
     spreadsheet (Setup & Import → Products → Download template).
- Scanning uses the device's rear camera and needs camera permission; it works
  on the live site and on phones.

## Receiving goods (field view)
- Field workers open **Receive Goods** to log incoming stock.
- Receiving **against a purchase order** matches quantities to the PO.
- Receiving **without a purchase order** (a "blind receipt") is saved as a
  **draft** and must be approved by a manager before it updates stock or the
  ledger. When receiving without a PO, someone is flagged to confirm the
  value/price of the logged item.
- Field workers can scan and add new products directly while receiving; unknown
  items prompt for the required details before they can be added.

## Purchase orders, requisitions & approvals (Delegation of Authority)
- Requisitions and purchase orders follow an approval flow:
  **Submit for Approval → Approve → Send to Vendor**.
- Each member can have a **reporting line** (who they report to) and
  **approval limits** for requisitions and for purchase orders, set by the
  owner in **Settings → Users**.
- If a requisition or PO exceeds a member's approval limit, it escalates up the
  reporting chain to someone with sufficient authority.
- The purchase order page shows the visual status flow and the buttons available
  at each stage (Submit, Approve, Reject, Send to Vendor).

## Locations & moving stock
- Locations are modeled as a hierarchy: **Building/Site → Floor/Area →
  Room/Zone → Shelf/Bin**, plus vehicles.
- Use **Move stock** on an inventory row for a quick transfer between locations.
- Transfers can be marked **"Delivered later (in transit)"** — the stock leaves
  the source immediately into an In-Transit holding location, and the receiving
  side records the delivery when it arrives (GRN-style received quantity).
  In-transit items appear both in the Inventory tab and the field view's
  Incoming Deliveries screen.

## Tools & asset custody
- Assets/tools can be checked out to a person or crew and checked back in.
- Members can carry an **employee number** as a reference.
- Reports include **all tools currently checked out** and **tools grouped by
  crew name**.

## Scanner (field app)
- The barcode scanner uses the rear camera and the device's native barcode
  detector, with torch and haptic feedback for faster, more reliable scans.

## Forecasting & reordering
- The **Forecasting** page projects demand from your actual usage — it looks at
  consumption and sale transactions to estimate how fast each product moves.
- For each product it suggests a **reorder point**, **reorder quantity**, and
  the **reorder value**, so you can see what's running low and how much to buy.
- The projection window is adjustable (e.g. 30 days); products with little or no
  usage history won't have a meaningful forecast yet.

## Transactions & inventory ledger
- The **Transactions** page is the running history of stock movements —
  receipts, issues/consumption, adjustments, transfers, and sales.
- Every movement is recorded so on-hand quantities and valuation stay accurate;
  this history is also what forecasting is built from.

## Stock counts (physical / cycle counts)
- Use **Stock counts** to do a physical count and reconcile it against the
  system. Create a count, enter the quantities found, and confirm/approve it to
  post any adjustments to the ledger.

## Assets: maintenance & depreciation
- **Maintenance**: schedule maintenance for an asset (with a due date), and mark
  it done — recording who performed it, the cost, and notes. Overdue items are
  flagged as urgent.
- **Depreciation**: assets can be depreciated over time; the depreciation run
  posts the periodic depreciation, and reports show the asset roll-forward.

## Reports
Available under **Reports**:
- **Inventory valuation** — current stock value.
- **Expenses** — consumption/sales spend grouped by cost center OR job code.
- **Cost Analysis** — expenses cross-tabulated by cost center × job code
  (matrix, per-job, and per-cost-center views); shows how a job's cost splits
  across cost centers. Expenses are tracked by tagging consumption/sale
  transactions with a cost center and/or job code.
- **Tools out** — all tools currently checked out.
- **Tools by crew** — checked-out tools grouped by crew.
- **Depreciation** and **Assets roll-forward** — asset value over time.
- **Accounting export** — export accounting data.

## Import & setup
- **Setup & Import** lets you bulk-import data (products, vendors, etc.) from a
  spreadsheet to get started quickly, and configure initial settings.

## Audit log
- The **Audit Log** records key changes made in the account (who did what and
  when) for accountability.

## Billing & plans
- Billing runs through **Lemon Squeezy** (the merchant of record, which handles
  sales tax automatically). Prices are in USD.
- Plans: **Starter** ($49/mo or $490/yr) and **Pro** ($99/mo or $990/yr).
  Annual billing is effectively **2 months free**.
- Only the **Owner** can start or change a subscription, from **Settings →
  Billing** or from the paywall when a trial ends.
- Owners can update the payment method or cancel via **Manage billing** (the
  Lemon Squeezy customer portal).
- When a trial ends or a subscription is cancelled, the account shows a paywall;
  data is preserved and access returns as soon as the owner reactivates.

## Account deletion
- An owner deleting their account removes the organization and all its members.
- A member deleting their own account removes only themselves.
- Account deletion is available from **Settings → Danger Zone** (web) and the
  Account screen (mobile).

## Legal
- Terms of Service and Privacy Policy links are in the app footer and on the
  signup page. Users consent to them at signup.

## Accounting & the journal export
- Stocked produces a **double-entry general journal** from inventory and
  fixed-asset activity, downloadable from **Reports → Accounting Export** as CSV
  for QuickBooks, Xero, MYOB, Wave, or any journal import.
- **Scope:** inventory and fixed assets only. It does **not** post sales revenue
  (revenue is invoiced/journaled in JobLedger — the Sale entry here is the cost
  side, COGS, only) and does **not** calculate sales tax / VAT.
- **How entries map (debit / credit):**
  - Purchase (goods received): Dr Inventory Asset / Cr Accounts Payable
  - Sale: Dr Cost of Goods Sold / Cr Inventory Asset (cost side only)
  - Consumption: Dr Operating Expense / Cr Inventory Asset
  - Stock adjustment +: Dr Inventory Asset / Cr Inventory Shrinkage; − reverses it
  - Transfer: Dr Inventory (destination) / Cr Inventory (source)
  - Depreciation: Dr Depreciation Expense / Cr Accumulated Depreciation
  - Asset purchase: Dr Fixed Assets / Cr Accounts Payable
  - Asset disposal: relieves accumulated depreciation and remaining book value
    against Gain/Loss on Asset Disposal; sale proceeds go to Undeposited Funds
  - Purchase price variance (invoice vs goods received): posts the difference to
    Purchase Price Variance against Accounts Payable
- **Important:** purchases credit Accounts Payable at goods receipt (a "GRNI"
  simplification). Use this export as your source of payables, or map the credit
  to a GRNI / accrued-purchases account so invoices entered elsewhere aren't
  double-counted.
- The Accounting Export page has a "How accounting entries work in Stocked"
  section with the full scope, the mapping, and import steps. For specific
  bookkeeping questions, an accountant should review the export against your
  chart of accounts.

## Support
- For anything not covered here, or for account-specific issues (billing
  disputes, data problems, bugs), contact **support@stocked.tech**.
`.trim()
