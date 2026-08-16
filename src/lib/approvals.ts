import { createServiceClient } from '@/lib/supabase/service'

type Svc = ReturnType<typeof createServiceClient>

/** Owners/admins have unlimited approval authority. */
export function isUnlimited(role?: string): boolean {
  return role === 'owner' || role === 'admin'
}

/** Sum of quantity × unit_cost across line items. */
export function sumLineValue(
  items: any[] | null | undefined,
  qtyKey = 'quantity',
  costKey = 'unit_cost',
): number {
  return (items ?? []).reduce(
    (s, it) => s + Number(it?.[qtyKey] ?? 0) * Number(it?.[costKey] ?? 0),
    0,
  )
}

export function fmtMoney(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

/**
 * Walk up the reporting chain from `startId` to find the first member whose
 * approval limit (for the given kind) covers `amount`. Falls back to the org
 * owner. Used to tell an under-authorized approver who to escalate to.
 */
export async function findAuthorizedApprover(
  supabase: Svc,
  orgId: string,
  startId: string | null | undefined,
  kind: 'requisition' | 'po',
  amount: number,
): Promise<{ id: string; name: string } | null> {
  const col = kind === 'requisition' ? 'requisition_approval_limit' : 'po_approval_limit'
  const seen = new Set<string>()
  let cur: string | null | undefined = startId

  while (cur && !seen.has(cur)) {
    seen.add(cur)
    const { data: p } = await supabase
      .from('user_profiles')
      .select(`id, full_name, email, role, reports_to, ${col}`)
      .eq('id', cur)
      .eq('org_id', orgId)
      .single()
    if (!p) break
    const limit = (p as any)[col]
    if (isUnlimited((p as any).role) || (limit != null && Number(limit) >= amount)) {
      return { id: (p as any).id, name: (p as any).full_name || (p as any).email }
    }
    cur = (p as any).reports_to
  }

  const { data: owner } = await supabase
    .from('user_profiles')
    .select('id, full_name, email')
    .eq('org_id', orgId)
    .eq('role', 'owner')
    .limit(1)
    .single()
  return owner ? { id: owner.id, name: owner.full_name || owner.email } : null
}

/**
 * Enforce a member's approval limit for a document amount. Returns an error
 * message (to return as 403) if they're not authorized, or null if they are.
 */
export async function checkApprovalLimit(
  supabase: Svc,
  opts: {
    orgId: string
    approverId: string
    approverRole?: string
    kind: 'requisition' | 'po'
    amount: number
  },
): Promise<string | null> {
  const { orgId, approverId, approverRole, kind, amount } = opts
  if (amount <= 0 || isUnlimited(approverRole)) return null

  const col = kind === 'requisition' ? 'requisition_approval_limit' : 'po_approval_limit'
  const { data: me } = await supabase
    .from('user_profiles')
    .select(`reports_to, ${col}`)
    .eq('id', approverId)
    .eq('org_id', orgId)
    .single()

  const limit = me ? (me as any)[col] : null
  if (limit != null && Number(limit) >= amount) return null

  const approver = await findAuthorizedApprover(supabase, orgId, (me as any)?.reports_to ?? null, kind, amount)
  const label = kind === 'requisition' ? 'requisition' : 'purchase order'
  return `This ${label} totals ${fmtMoney(amount)}, above your approval limit${
    limit != null ? ` of ${fmtMoney(Number(limit))}` : ''
  }. It needs approval from ${approver?.name ?? 'the owner'}.`
}
