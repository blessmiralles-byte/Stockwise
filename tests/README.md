# Tests

```bash
npm test          # run once
npm run test:watch
npm run build     # tests must pass before Next builds — this is what Vercel runs
```

Vitest, Node environment, no database. Supabase is faked in memory
(`helpers/fake-supabase.ts`), so the suite runs in about a second and can gate
every deploy.

## What's covered, and why

| File | Protects against |
|---|---|
| `entitlements.test.ts` | Paid features leaking to Starter; an unknown plan from the billing webhook unlocking everything (it must fail closed). |
| `billing.test.ts` | Locking a paying customer out, or leaving an expired trial open. Regional prices and the "two months free" rule. |
| `lemonsqueezy.test.ts` | Mapping a variant to the wrong plan. An unrecognised variant once became Enterprise with 999 seats. |
| `trial-claims.test.ts` | Endless free trials by deleting the account, or through `name+1@gmail.com` aliases — and, just as important, never blocking a genuine trial. |
| `approval-chain.test.ts` | Approvals skipping the reporting line, self-approval, spend above someone's limit, or work getting stuck on a deactivated member. |
| `requisition-value.test.ts` | Mis-valuing a request, which would route it to the wrong approver — including reading another tenant's costs. |
| `journal-mapping.test.ts` | Unbalanced or double-counted accounting entries; the GR/IR split that stops a vendor bill being counted twice. |
| `maintenance-recurrence.test.ts` | Preventive maintenance drifting, skipping, or landing on 31 February. |
| `org-scoping.test.ts` | A route reading or writing another organization's data. It scans every API route for org scoping and authentication — a real leak of this shape shipped once. |

## Adding tests

Put them in `tests/*.test.ts`. Prefer testing the rule (a function in `src/lib`)
over the route that calls it — that's where the logic lives and where a mistake
is expensive. If a query shape isn't supported by the fake client, extend
`helpers/fake-supabase.ts` rather than reaching for a real database.

`org-scoping.test.ts` has an `EXEMPT` list for routes that genuinely aren't
org-scoped (public probes, webhooks, per-user data). Each entry carries a
reason; adding one should be a deliberate decision, not a way to make a failing
test go away.
