import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAnyRole } from '@/lib/api-auth'
import { rateLimit } from '@/lib/rate-limit'
import {
  EXPORT_TABLES, EXPORT_ROW_LIMIT, toSheetRows, summarySheet,
} from '@/lib/account-export'

/**
 * GET /api/account/export — everything in the account as one Excel workbook,
 * a tab per table, with a summary tab listing what is inside.
 *
 * Owner or admin: it contains every record in the organization, including the
 * team list and the audit log.
 *
 * Reading a whole account is heavy, so it is capped per table and rate limited.
 */

/** Three per five minutes: enough to retry, not enough to hammer the database. */
const exportLimiter = rateLimit({ windowMs: 5 * 60_000, max: 3 })

export async function GET() {
  const auth = await requireAnyRole('owner', 'admin')
  if (auth.error) return auth.error

  const { ok } = await exportLimiter(auth.userId)
  if (!ok) {
    return NextResponse.json(
      { error: 'An export is already on its way — try again in a few minutes.' },
      { status: 429 },
    )
  }

  const supabase = createServiceClient()
  const { data: org } = await supabase
    .from('organizations').select('name').eq('id', auth.orgId).maybeSingle()
  const orgName = (org as any)?.name ?? 'Your organization'

  const book = XLSX.utils.book_new()
  const counts: Record<string, number> = {}
  const truncated: string[] = []

  // Summary goes in first so it is the tab people land on; filled in below.
  const summaryIndex = 'Summary'
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([[]]), summaryIndex)

  for (const spec of EXPORT_TABLES) {
    const { data, error } = await supabase
      .from(spec.table)
      .select(spec.columns.join(', '))
      .eq('org_id', auth.orgId)
      .order(spec.orderBy ?? 'id', { ascending: true })
      .limit(EXPORT_ROW_LIMIT)

    // A table that doesn't exist yet (a migration not run) shouldn't sink the
    // whole export — note it as empty and carry on.
    if (error) {
      console.warn('[account-export]', spec.table, error.message)
      counts[spec.sheet] = 0
      XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([spec.columns]), spec.sheet)
      continue
    }

    const rows = (data ?? []) as unknown as Record<string, unknown>[]
    counts[spec.sheet] = rows.length
    if (rows.length >= EXPORT_ROW_LIMIT) truncated.push(spec.sheet)

    const sheet = XLSX.utils.aoa_to_sheet(toSheetRows(spec, rows))
    sheet['!cols'] = spec.columns.map(c => ({ wch: Math.min(Math.max(c.length + 2, 12), 40) }))
    XLSX.utils.book_append_sheet(book, sheet, spec.sheet)
  }

  const generatedAt = new Date().toISOString().slice(0, 10)
  book.Sheets[summaryIndex] = XLSX.utils.aoa_to_sheet(
    summarySheet({ orgName, generatedAt, counts, truncated }),
  )
  book.Sheets[summaryIndex]['!cols'] = [{ wch: 28 }, { wch: 12 }]

  const buffer = XLSX.write(book, { bookType: 'xlsx', type: 'buffer' }) as Buffer
  const filename = `stocked-export-${orgName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${generatedAt}.xlsx`

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
