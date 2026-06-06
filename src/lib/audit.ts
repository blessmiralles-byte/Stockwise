/**
 * Tamper-evident audit logging for sensitive operations.
 * Inserts into audit_log via service role (bypasses RLS so no user can block it).
 * Errors are swallowed — audit logging must NEVER break the primary operation.
 *
 * Run scripts/migrate-audit-log.sql before using this.
 */
import { createServiceClient } from '@/lib/supabase/service'

export type AuditAction =
  | 'user.role_change'
  | 'user.deactivate'
  | 'user.reactivate'
  | 'stock_count.approve'
  | 'stock_count.create'
  | 'purchase_order.cancel'
  | 'requisition.approve'
  | 'requisition.reject'
  | 'asset.dispose'
  | 'asset.value_change'
  | 'asset.depreciation_run'
  | 'period.close'
  | 'cost_center.create'
  | 'cost_center.update'

export async function logAudit(params: {
  actorId: string
  orgId?: string
  action: AuditAction
  tableName?: string
  recordId?: string
  oldValue?: Record<string, unknown>
  newValue?: Record<string, unknown>
}): Promise<void> {
  try {
    const supabase = createServiceClient()
    await supabase.from('audit_log').insert({
      actor_id:   params.actorId,
      org_id:     params.orgId      ?? null,
      action:     params.action,
      table_name: params.tableName  ?? null,
      record_id:  params.recordId   ?? null,
      old_value:  params.oldValue   ?? null,
      new_value:  params.newValue   ?? null,
    })
  } catch (err) {
    console.error('[audit] Failed to write audit log entry:', (err as Error).message)
  }
}
