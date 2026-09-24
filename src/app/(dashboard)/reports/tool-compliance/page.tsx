'use client'

import { useState, useMemo } from 'react'
import { Topbar } from '@/components/layout/topbar'
import { Card, CardContent } from '@/components/ui/card'
import { useApi } from '@/lib/use-api'
import { formatCurrency, formatDate, cn } from '@/lib/utils'
import {
  assetCompliance, certificateState, KIND_LABEL, CERT_WARNING_DAYS, type ScheduleLike,
} from '@/lib/asset-compliance'
import {
  AlertTriangle, CheckCircle2, Clock, Loader2, ShieldCheck, Search, PackageX, Download,
} from 'lucide-react'

type Tab = 'checks' | 'incidents'

interface Schedule extends ScheduleLike {
  id: string
  title: string
  scheduled_date: string | null
  completed_date?: string | null
  asset?: { id: string; asset_tag: string; name: string; status: string } | null
}

interface Incident {
  id: string
  kind: 'lost' | 'stolen' | 'damaged'
  status: 'open' | 'recovered' | 'written_off'
  occurred_on: string
  last_seen?: string | null
  description?: string | null
  police_report_no?: string | null
  held_by?: string | null
  estimated_loss?: number | null
  resolution_note?: string | null
  asset?: { id: string; asset_tag: string; name: string } | null
  reporter?: { full_name?: string; email?: string } | null
}

const INCIDENT_LABEL = { lost: 'Lost', stolen: 'Stolen', damaged: 'Damaged' }
const STATUS_STYLE: Record<string, string> = {
  open:        'bg-red-100 text-red-700',
  recovered:   'bg-green-100 text-green-700',
  written_off: 'bg-slate-200 text-slate-600',
}

function csv(rows: (string | number | null | undefined)[][]) {
  return rows.map(r => r.map(c => {
    const v = c == null ? '' : String(c)
    return /[",\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v
  }).join(',')).join('\n')
}

function download(name: string, body: string) {
  const url = URL.createObjectURL(new Blob([body], { type: 'text/csv;charset=utf-8;' }))
  const a = document.createElement('a')
  a.href = url; a.download = name; a.click()
  URL.revokeObjectURL(url)
}

export default function ToolCompliancePage() {
  const [tab, setTab]       = useState<Tab>('checks')
  const [search, setSearch] = useState('')

  const { data: inspData, loading: loadingChecks } =
    useApi<{ data: Schedule[] }>('/api/maintenance?kind=inspection')
  const { data: calData, loading: loadingCal } =
    useApi<{ data: Schedule[] }>('/api/maintenance?kind=calibration')
  const { data: incData, loading: loadingInc, refetch } =
    useApi<{ data: Incident[] }>('/api/assets/incidents')

  const schedules = useMemo(
    () => [...(inspData?.data ?? []), ...(calData?.data ?? [])],
    [inspData, calData],
  )

  // One row per tool, rolled up from its checks.
  const tools = useMemo(() => {
    const byAsset = new Map<string, { asset: any; items: Schedule[] }>()
    for (const s of schedules) {
      if (!s.asset) continue
      const entry = byAsset.get(s.asset.id) ?? { asset: s.asset, items: [] }
      entry.items.push(s)
      byAsset.set(s.asset.id, entry)
    }
    return [...byAsset.values()]
      .map(({ asset, items }) => ({ asset, items, compliance: assetCompliance(items) }))
      .sort((a, b) => {
        const rank = (c: any) => (c.overdue ? 0 : c.expired ? 1 : c.expiringSoon ? 2 : 3)
        return rank(a.compliance) - rank(b.compliance) ||
          (a.asset.name ?? '').localeCompare(b.asset.name ?? '')
      })
  }, [schedules])

  const q = search.trim().toLowerCase()
  const shownTools = q
    ? tools.filter(t => `${t.asset.name} ${t.asset.asset_tag}`.toLowerCase().includes(q))
    : tools
  const incidents = incData?.data ?? []
  const shownIncidents = q
    ? incidents.filter(i => `${i.asset?.name} ${i.asset?.asset_tag} ${i.held_by}`.toLowerCase().includes(q))
    : incidents

  const counts = {
    overdue:  tools.filter(t => t.compliance.overdue).length,
    expired:  tools.filter(t => t.compliance.expired).length,
    expiring: tools.filter(t => t.compliance.expiringSoon).length,
    open:     incidents.filter(i => i.status === 'open').length,
    lossValue: incidents.filter(i => i.status !== 'recovered')
      .reduce((sum, i) => sum + Number(i.estimated_loss ?? 0), 0),
  }

  const exportChecks = () => download('inspections-certificates.csv', csv([
    ['Asset tag', 'Tool', 'Check', 'Next due', 'Certificate', 'Valid until', 'State'],
    ...shownTools.flatMap(t => t.items.map(i => [
      t.asset.asset_tag, t.asset.name, KIND_LABEL[(i.kind as 'inspection') ?? 'inspection'],
      i.scheduled_date, i.certificate_no, i.certified_until, certificateState(i.certified_until),
    ])),
  ]))

  const exportIncidents = () => download('tool-losses.csv', csv([
    ['Date', 'Asset tag', 'Tool', 'Type', 'Status', 'Held by', 'Last seen', 'Police report', 'Estimated loss', 'Notes'],
    ...shownIncidents.map(i => [
      i.occurred_on, i.asset?.asset_tag, i.asset?.name, INCIDENT_LABEL[i.kind], i.status,
      i.held_by, i.last_seen, i.police_report_no, i.estimated_loss, i.description,
    ]),
  ]))

  const resolve = async (incident: Incident, status: 'recovered' | 'written_off') => {
    const note = window.prompt(
      status === 'recovered' ? 'Where was it found? (optional)' : 'Reason for writing it off (optional)',
    )
    if (note === null) return
    await fetch('/api/assets/incidents', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: incident.id, status, resolution_note: note || undefined }),
    })
    refetch()
  }

  const loading = loadingChecks || loadingCal || loadingInc

  return (
    <div>
      <Topbar title="Tool Compliance" />
      <div className="p-6 space-y-5 max-w-5xl">
        <p className="text-sm text-slate-500">
          Inspection and calibration certificates, and the register of lost, stolen or damaged kit.
        </p>

        {/* Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Checks overdue',       value: counts.overdue,  tone: 'text-red-600',   icon: AlertTriangle },
            { label: 'Certificates expired', value: counts.expired,  tone: 'text-red-600',   icon: ShieldCheck },
            { label: `Expiring in ${CERT_WARNING_DAYS} days`, value: counts.expiring, tone: 'text-amber-600', icon: Clock },
            { label: 'Open loss reports',    value: counts.open,     tone: 'text-slate-900', icon: PackageX },
          ].map(s => (
            <Card key={s.label}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <s.icon className="w-3.5 h-3.5" /> {s.label}
                </div>
                <p className={cn('text-2xl font-bold mt-1', s.tone)}>{s.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Tabs + search */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
            {([['checks', 'Inspections & certificates'], ['incidents', `Losses & damage${counts.open ? ` (${counts.open})` : ''}`]] as const).map(([v, label]) => (
              <button key={v} onClick={() => setTab(v as Tab)}
                className={cn('px-3 py-1.5 rounded-md text-xs font-semibold transition-all',
                  tab === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700')}>
                {label}
              </button>
            ))}
          </div>
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tools…"
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <button onClick={tab === 'checks' ? exportChecks : exportIncidents}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50">
            <Download className="w-3.5 h-3.5" /> CSV
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
        ) : tab === 'checks' ? (
          shownTools.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-sm text-slate-400">
              No inspection or calibration schedules yet. Add one from <span className="font-medium">Maintenance → Schedule</span> and
              pick Inspection or Calibration.
            </CardContent></Card>
          ) : (
            <Card><CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr className="text-xs uppercase tracking-wide text-slate-500">
                    <th className="text-left px-4 py-3 font-semibold">Tool</th>
                    <th className="text-left px-4 py-3 font-semibold">Checks</th>
                    <th className="text-left px-4 py-3 font-semibold">Next due</th>
                    <th className="text-left px-4 py-3 font-semibold">Certificate</th>
                    <th className="text-left px-4 py-3 font-semibold">State</th>
                  </tr>
                </thead>
                <tbody>
                  {shownTools.map(({ asset, items, compliance }) => {
                    const cert = items.find(i => i.certified_until === compliance.certifiedUntil)
                    return (
                      <tr key={asset.id} className="border-b border-slate-50">
                        <td className="px-4 py-3">
                          <p className="font-medium text-slate-900">{asset.name}</p>
                          <p className="text-xs text-slate-400 font-mono">{asset.asset_tag}</p>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">
                          {[...new Set(items.map(i => KIND_LABEL[(i.kind as 'inspection') ?? 'inspection']))].join(' · ')}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {compliance.overdue
                            ? <span className="text-red-600 font-medium">Overdue</span>
                            : compliance.nextDue ? formatDate(compliance.nextDue) : '—'}
                        </td>
                        <td className="px-4 py-3">
                          {compliance.certifiedUntil ? (
                            <>
                              <p className="text-slate-700">{formatDate(compliance.certifiedUntil)}</p>
                              {cert?.certificate_no && <p className="text-xs text-slate-400 font-mono">{cert.certificate_no}</p>}
                            </>
                          ) : <span className="text-slate-400">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          {compliance.overdue || compliance.expired ? (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 bg-red-100 px-2 py-0.5 rounded-full">
                              <AlertTriangle className="w-3 h-3" /> {compliance.overdue ? 'Check overdue' : 'Certificate expired'}
                            </span>
                          ) : compliance.expiringSoon ? (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                              <Clock className="w-3 h-3" /> Expiring soon
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                              <CheckCircle2 className="w-3 h-3" /> In date
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </CardContent></Card>
          )
        ) : shownIncidents.length === 0 ? (
          <Card><CardContent className="p-8 text-center text-sm text-slate-400">
            Nothing reported lost, stolen or damaged. Report one from a tool&apos;s row on the Assets page.
          </CardContent></Card>
        ) : (
          <>
            {counts.lossValue > 0 && (
              <p className="text-xs text-slate-500">
                Value still unaccounted for: <span className="font-semibold text-slate-700">{formatCurrency(counts.lossValue)}</span>
              </p>
            )}
            <div className="space-y-3">
              {shownIncidents.map(i => (
                <Card key={i.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-slate-900">{i.asset?.name ?? 'Tool'}</span>
                          <span className="text-xs text-slate-400 font-mono">{i.asset?.asset_tag}</span>
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                            {INCIDENT_LABEL[i.kind]}
                          </span>
                          <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full', STATUS_STYLE[i.status])}>
                            {i.status === 'written_off' ? 'Written off' : i.status === 'recovered' ? 'Recovered' : 'Open'}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-1">
                          {formatDate(i.occurred_on)}
                          {i.held_by && <> · held by {i.held_by}</>}
                          {i.last_seen && <> · last seen {i.last_seen}</>}
                          {i.reporter?.full_name && <> · reported by {i.reporter.full_name}</>}
                        </p>
                        {i.description && <p className="text-sm text-slate-600 mt-2">{i.description}</p>}
                        {i.police_report_no && <p className="text-xs text-slate-500 mt-1">Police report: {i.police_report_no}</p>}
                        {i.resolution_note && <p className="text-xs text-slate-500 mt-1 italic">“{i.resolution_note}”</p>}
                      </div>
                      <div className="text-right">
                        {i.estimated_loss != null && (
                          <p className="text-sm font-semibold text-slate-900">{formatCurrency(Number(i.estimated_loss))}</p>
                        )}
                        {i.status === 'open' && (
                          <div className="flex gap-2 mt-2">
                            <button onClick={() => resolve(i, 'recovered')}
                              className="px-2.5 py-1.5 rounded-lg border border-green-200 text-green-700 text-xs font-semibold hover:bg-green-50">
                              Found it
                            </button>
                            <button onClick={() => resolve(i, 'written_off')}
                              className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-slate-50">
                              Write off
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
