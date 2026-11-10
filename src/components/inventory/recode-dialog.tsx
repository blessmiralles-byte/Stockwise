'use client'

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { X, Download, Upload, Loader2, CheckCircle2, AlertCircle, ArrowRight } from 'lucide-react'
import { downloadExcel } from '@/lib/export-sheet'
import { readRecodeSheet, type RecodePlan, type RecodeRow } from '@/lib/item-code'

/**
 * Replace item codes in bulk with the ones the company already uses.
 *
 * Download the current codes, fill in a "New code" column in Excel, upload it,
 * and see exactly what will change — and why any row can't — before anything
 * does. The sheet is read here in the browser; the server re-plans it on apply
 * so nothing stale gets written.
 */
export function RecodeDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy]       = useState<'download' | 'read' | 'apply' | null>(null)
  const [error, setError]     = useState('')
  const [fileName, setFileName] = useState('')
  const [rows, setRows]       = useState<RecodeRow[] | null>(null)
  const [plan, setPlan]       = useState<RecodePlan | null>(null)
  const [applied, setApplied] = useState<number | null>(null)

  const download = async () => {
    setBusy('download'); setError('')
    try {
      const res  = await fetch('/api/products/recode')
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Could not load your items'); return }
      const items = (json.data ?? []) as { sku: string; name: string; barcode: string | null }[]
      await downloadExcel('Item codes', [{
        name: 'Item codes',
        rows: [
          ['Current code', 'Item name', 'Barcode', 'New code'],
          ...items.map(i => [i.sku, i.name, i.barcode ?? '', '']),
        ],
      }])
    } catch {
      setError('Could not download the sheet. Try again.')
    } finally { setBusy(null) }
  }

  const preview = async (sheetRows: RecodeRow[]) => {
    const res  = await fetch('/api/products/recode', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows: sheetRows }),
    })
    const json = await res.json()
    if (!res.ok) { setError(json.error ?? 'Could not check the sheet'); return }
    setPlan(json.data)
  }

  const readFile = async (file: File) => {
    setBusy('read'); setError(''); setPlan(null); setRows(null); setFileName(file.name)
    try {
      const XLSX = await import('xlsx')
      const isCsv = file.name.toLowerCase().endsWith('.csv')
      // raw for CSV keeps codes like 00123 as text instead of turning them into 123.
      const book = XLSX.read(await file.arrayBuffer(), { type: 'array', raw: isCsv })
      const sheet = book.Sheets[book.SheetNames[0]]
      const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: false })
      const read = readRecodeSheet(grid)
      if ('error' in read) { setError(read.error); return }
      setRows(read.rows)
      await preview(read.rows)
    } catch {
      setError('We couldn’t read that file. Upload the .xlsx you downloaded here, or a .csv.')
    } finally { setBusy(null) }
  }

  const apply = async () => {
    if (!rows) return
    setBusy('apply'); setError('')
    try {
      const res  = await fetch('/api/products/recode', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows, apply: true }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Could not change the codes'); return }
      setApplied(json.data?.changes?.length ?? 0)
      onDone()
    } catch {
      setError('Network error — nothing was changed. Try again.')
    } finally { setBusy(null) }
  }

  const reset = () => {
    setPlan(null); setRows(null); setFileName(''); setError('')
    if (fileRef.current) fileRef.current.value = ''
  }

  const SHOW = 100

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h3 className="font-semibold text-slate-900">Update item codes</h3>
            <p className="text-xs text-slate-500 mt-0.5">Bring over the codes your team already uses.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5 overflow-y-auto">
          {applied !== null ? (
            <div className="text-center py-8">
              <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto mb-3" />
              <p className="font-semibold text-slate-900">{applied} item code{applied === 1 ? '' : 's'} updated</p>
              <p className="text-sm text-slate-500 mt-1">
                Past transactions, orders and counts now show the new codes.
              </p>
            </div>
          ) : (
            <>
              <ol className="space-y-4">
                <li className="flex gap-3">
                  <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-semibold flex items-center justify-center flex-shrink-0">1</span>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-900">Download your current codes</p>
                    <p className="text-xs text-slate-500 mt-0.5 mb-2">Every item, with an empty <strong>New code</strong> column.</p>
                    <Button size="sm" variant="outline" className="gap-1.5" onClick={download} disabled={busy !== null}>
                      {busy === 'download' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                      Download sheet
                    </Button>
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-semibold flex items-center justify-center flex-shrink-0">2</span>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-900">Fill in the New code column</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Only for items you want to change — leave the rest blank. Don&apos;t edit the Current code column; that&apos;s how we know which item each row is.
                    </p>
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-semibold flex items-center justify-center flex-shrink-0">3</span>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-900">Upload it and check the changes</p>
                    <p className="text-xs text-slate-500 mt-0.5 mb-2">Nothing changes until you confirm.</p>
                    <input
                      ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) readFile(f) }}
                    />
                    <Button size="sm" variant="outline" className="gap-1.5" onClick={() => fileRef.current?.click()} disabled={busy !== null}>
                      {busy === 'read' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                      {fileName ? 'Choose a different file' : 'Upload sheet'}
                    </Button>
                    {fileName && <span className="ml-2 text-xs text-slate-400">{fileName}</span>}
                  </div>
                </li>
              </ol>

              {plan && (
                <div className="space-y-4 border-t border-slate-100 pt-4">
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 font-medium">{plan.changes.length} to change</span>
                    {plan.problems.length > 0 && (
                      <span className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 font-medium">{plan.problems.length} can&apos;t be applied</span>
                    )}
                    <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-500">{plan.unchanged} left as they are</span>
                  </div>

                  {plan.problems.length > 0 && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50/60">
                      <p className="px-3 pt-2.5 text-xs font-semibold text-amber-800">
                        These rows will be skipped — fix them in the sheet and upload again, or go ahead without them:
                      </p>
                      <ul className="p-3 space-y-1 text-xs text-amber-900">
                        {plan.problems.slice(0, SHOW).map((p, i) => (
                          <li key={i}><span className="font-mono text-amber-700">Line {p.line}</span> — {p.reason}</li>
                        ))}
                        {plan.problems.length > SHOW && <li className="text-amber-700">…and {plan.problems.length - SHOW} more</li>}
                      </ul>
                    </div>
                  )}

                  {plan.changes.length > 0 && (
                    <div className="rounded-xl border border-slate-200 overflow-hidden">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-50 text-slate-500">
                          <tr>
                            <th className="text-left font-medium px-3 py-2">Item</th>
                            <th className="text-left font-medium px-3 py-2">Code</th>
                          </tr>
                        </thead>
                        <tbody>
                          {plan.changes.slice(0, SHOW).map(c => (
                            <tr key={c.id} className="border-t border-slate-100">
                              <td className="px-3 py-2 text-slate-700">{c.name || '—'}</td>
                              <td className="px-3 py-2 font-mono">
                                <span className="text-slate-400">{c.from}</span>
                                <ArrowRight className="inline w-3 h-3 mx-1.5 text-slate-300" />
                                <span className="text-slate-900 font-medium">{c.to}</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {plan.changes.length > SHOW && (
                        <p className="px-3 py-2 text-xs text-slate-400 border-t border-slate-100">…and {plan.changes.length - SHOW} more</p>
                      )}
                    </div>
                  )}

                  {plan.changes.length === 0 && plan.problems.length === 0 && (
                    <p className="text-sm text-slate-500">No new codes in that sheet — fill in the New code column for the items you want to change.</p>
                  )}
                </div>
              )}
            </>
          )}

          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 text-sm text-red-700">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" /> {error}
            </div>
          )}
        </div>

        <div className="flex gap-2 justify-end px-5 py-4 border-t border-slate-100">
          {applied !== null ? (
            <Button size="sm" onClick={onClose}>Done</Button>
          ) : (
            <>
              {plan && <Button variant="ghost" size="sm" onClick={reset} disabled={busy !== null}>Start over</Button>}
              <Button variant="outline" size="sm" onClick={onClose} disabled={busy === 'apply'}>Cancel</Button>
              <Button size="sm" className="gap-1.5" onClick={apply} disabled={!plan || plan.changes.length === 0 || busy !== null}>
                {busy === 'apply' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                {plan && plan.changes.length > 0
                  ? `Change ${plan.changes.length} code${plan.changes.length === 1 ? '' : 's'}`
                  : 'Change codes'}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
