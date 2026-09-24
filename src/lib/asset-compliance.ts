/**
 * Inspections, calibration and certificates.
 *
 * Safety-critical kit (harnesses, ladders, torque wrenches, test meters) has to
 * be inspected or calibrated on a cycle, and the certificate has to be valid
 * when it's used. These share the maintenance schedule — same recurrence,
 * reminders and sign-off — and are told apart by `kind`.
 *
 * Pure date logic, no database: everything here is unit-tested.
 */

export type ScheduleKind = 'maintenance' | 'inspection' | 'calibration'

export const SCHEDULE_KINDS: { value: ScheduleKind; label: string; blurb: string }[] = [
  { value: 'maintenance', label: 'Maintenance', blurb: 'Servicing and repairs' },
  { value: 'inspection',  label: 'Inspection',  blurb: 'Safety check — produces a certificate' },
  { value: 'calibration', label: 'Calibration', blurb: 'Accuracy check — produces a certificate' },
]

export const KIND_LABEL: Record<ScheduleKind, string> = {
  maintenance: 'Maintenance', inspection: 'Inspection', calibration: 'Calibration',
}

export function isScheduleKind(v: unknown): v is ScheduleKind {
  return v === 'maintenance' || v === 'inspection' || v === 'calibration'
}

/** Inspections and calibration produce a certificate; plain maintenance doesn't. */
export function producesCertificate(kind: string | null | undefined): boolean {
  return kind === 'inspection' || kind === 'calibration'
}

export type CertificateState = 'valid' | 'expiring' | 'expired' | 'none'

/** Days before expiry that a certificate starts being flagged. */
export const CERT_WARNING_DAYS = 30

function toDay(d: string | Date): string {
  return (typeof d === 'string' ? d : d.toISOString()).slice(0, 10)
}

export function daysBetween(from: string | Date, to: string | Date): number {
  const a = Date.parse(toDay(from) + 'T00:00:00Z')
  const b = Date.parse(toDay(to) + 'T00:00:00Z')
  return Math.round((b - a) / 86_400_000)
}

/**
 * Where a certificate stands today. Expiry is inclusive: a certificate valid
 * "until the 30th" is still valid on the 30th.
 */
export function certificateState(certifiedUntil: string | null | undefined, today: string | Date = new Date()): CertificateState {
  if (!certifiedUntil) return 'none'
  const left = daysBetween(today, certifiedUntil)
  if (left < 0) return 'expired'
  return left <= CERT_WARNING_DAYS ? 'expiring' : 'valid'
}

export interface ScheduleLike {
  kind?: string | null
  status?: string | null
  scheduled_date?: string | null
  certified_until?: string | null
  certificate_no?: string | null
}

export interface AssetCompliance {
  /** An inspection or calibration is past its due date. */
  overdue: boolean
  /** A certificate has run out. */
  expired: boolean
  /** A certificate runs out within CERT_WARNING_DAYS. */
  expiringSoon: boolean
  /** Soonest upcoming due date across open checks, if any. */
  nextDue: string | null
  /** Latest expiry across certificates, if any. */
  certifiedUntil: string | null
  /** True when the tool shouldn't leave the store without attention. */
  needsAttention: boolean
}

/**
 * Roll a tool's inspection and calibration schedules into one state for badges,
 * reports and the check-out guard. Plain maintenance is ignored here — it has
 * its own alerts and doesn't gate use of the tool.
 */
export function assetCompliance(schedules: ScheduleLike[], today: string | Date = new Date()): AssetCompliance {
  const checks = (schedules ?? []).filter(s => producesCertificate(s.kind))
  const open   = checks.filter(s => s.status !== 'completed' && s.status !== 'cancelled')

  let overdue = false
  let nextDue: string | null = null
  for (const s of open) {
    if (!s.scheduled_date) continue
    if (daysBetween(today, s.scheduled_date) < 0) overdue = true
    else if (!nextDue || s.scheduled_date < nextDue) nextDue = s.scheduled_date
  }

  const certs = checks.map(s => s.certified_until).filter(Boolean) as string[]
  const certifiedUntil = certs.length ? certs.sort().at(-1)! : null
  const state = certificateState(certifiedUntil, today)

  return {
    overdue,
    expired:      state === 'expired',
    expiringSoon: state === 'expiring',
    nextDue,
    certifiedUntil,
    needsAttention: overdue || state === 'expired',
  }
}

/**
 * Whether a tool may be checked out. Blocking is opt-in per organization: some
 * sites must refuse uncertified kit, others want a warning and a decision by
 * the person holding the job.
 */
export function checkoutBlock(
  compliance: AssetCompliance,
  opts: { blockWhenOverdue?: boolean | null } = {},
): { blocked: boolean; reason: string | null } {
  if (!compliance.needsAttention) return { blocked: false, reason: null }
  const what = compliance.overdue
    ? 'its inspection is overdue'
    : 'its certificate has expired'
  if (!opts.blockWhenOverdue) return { blocked: false, reason: `Heads up: ${what}.` }
  return {
    blocked: true,
    reason: `This tool can’t be checked out because ${what}. Complete the check, or turn off the requirement in Settings → Organization.`,
  }
}
