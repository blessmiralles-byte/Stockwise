'use client'

import { useState, useCallback, useRef } from 'react'
import { Topbar } from '@/components/layout/topbar'
import {
  Upload, Download, FileSpreadsheet, CheckCircle2,
  AlertCircle, Loader2, X, ChevronDown, ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Entity config ─────────────────────────────────────────────────────────────
const ENTITIES = [
  {
    id:       'products',
    label:    'Products / Inventory Items',
    desc:     'Name, SKU, barcode, unit, reorder point',
    color:    'bg-indigo-50 text-indigo-600',
    required: ['name'],
    columns:  ['name', 'sku', 'barcode', 'unit_of_measure', 'reorder_point', 'description'],
  },
  {
    id:       'assets',
    label:    'Fixed Assets',
    desc:     'Name, asset tag, cost, depreciation method',
    color:    'bg-purple-50 text-purple-600',
    required: ['name', 'asset_tag'],
    columns:  ['name', 'asset_tag', 'serial_number', 'purchase_cost', 'purchase_date', 'useful_life_years', 'depreciation_method', 'status', 'notes'],
  },
  {
    id:       'locations',
    label:    'Storage Locations',
    desc:     'Name, code, type, address',
    color:    'bg-green-50 text-green-600',
    required: ['name', 'code'],
    columns:  ['name', 'code', 'type', 'address'],
  },
  {
    id:       'suppliers',
    label:    'Suppliers',
    desc:     'Name, contact, email, payment terms',
    color:    'bg-amber-50 text-amber-600',
    required: ['name'],
    columns:  ['name', 'contact_name', 'email', 'phone', 'payment_terms', 'lead_time_days', 'notes'],
  },
]

// ── Upload zone ───────────────────────────────────────────────────────────────
function DropZone({
  onFile, file, onClear,
}: {
  onFile: (f: File) => void
  file:   File | null
  onClear: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) onFile(f)
  }

  if (file) {
    return (
      <div className="flex items-center justify-between px-4 py-3 bg-indigo-50 border-2 border-indigo-200 rounded-xl">
        <div className="flex items-center gap-3">
          <FileSpreadsheet className="w-5 h-5 text-indigo-600 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-indigo-900">{file.name}</p>
            <p className="text-xs text-indigo-500">{(file.size / 1024).toFixed(1)} KB</p>
          </div>
        </div>
        <button onClick={onClear} className="p-1.5 rounded-lg hover:bg-indigo-100 transition-colors">
          <X className="w-4 h-4 text-indigo-500" />
        </button>
      </div>
    )
  }

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={cn(
        'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors',
        dragging ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50'
      )}>
      <Upload className="w-8 h-8 mx-auto mb-3 text-slate-400" />
      <p className="text-sm font-medium text-slate-700">Drop your file here, or click to browse</p>
      <p className="text-xs text-slate-400 mt-1">Supports CSV, XLSX, XLS — max 5 MB, 1 000 rows</p>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.xlsx,.xls"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f) }}
      />
    </div>
  )
}

// ── Result panel ──────────────────────────────────────────────────────────────
function ResultPanel({ result, entity }: { result: any; entity: string }) {
  const [errExpanded, setErrExpanded] = useState(false)

  return (
    <div className="space-y-3">
      <div className={cn(
        'flex items-start gap-3 p-4 rounded-xl border',
        result.imported > 0 ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'
      )}>
        {result.imported > 0
          ? <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
          : <AlertCircle  className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />}
        <div>
          <p className={cn('font-semibold text-sm', result.imported > 0 ? 'text-green-800' : 'text-amber-800')}>
            {result.imported > 0
              ? `Successfully imported ${result.imported.toLocaleString()} ${entity}`
              : 'No records were imported'}
          </p>
          <p className="text-xs text-slate-600 mt-0.5">
            {result.skipped > 0 && `${result.skipped} row${result.skipped !== 1 ? 's' : ''} skipped`}
            {result.errors?.length > 0 && ` · ${result.errors.length} error${result.errors.length !== 1 ? 's' : ''}`}
          </p>
        </div>
      </div>

      {result.errors?.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <button
            onClick={() => setErrExpanded(e => !e)}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors text-left">
            <p className="text-xs font-semibold text-red-700">
              {result.errors.length} validation error{result.errors.length !== 1 ? 's' : ''}
            </p>
            {errExpanded
              ? <ChevronDown className="w-4 h-4 text-slate-400" />
              : <ChevronRight className="w-4 h-4 text-slate-400" />}
          </button>
          {errExpanded && (
            <div className="px-4 pb-3 space-y-1 max-h-48 overflow-y-auto">
              {result.errors.map((e: string, i: number) => (
                <p key={i} className="text-xs text-red-700 bg-red-50 px-2 py-1 rounded">{e}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function ImportPage() {
  const [entityId, setEntityId] = useState('products')
  const [file, setFile]         = useState<File | null>(null)
  const [loading, setLoading]   = useState(false)
  const [result, setResult]     = useState<any>(null)
  const [error, setError]       = useState('')

  const entity = ENTITIES.find(e => e.id === entityId)!

  const downloadTemplate = () => {
    window.location.href = `/api/import/${entityId}`
  }

  const handleImport = useCallback(async () => {
    if (!file) return
    setLoading(true); setError(''); setResult(null)
    try {
      const form = new FormData()
      form.append('file', file)
      const res  = await fetch(`/api/import/${entityId}`, { method: 'POST', body: form })
      const json = await res.json()
      if (!res.ok && !json.imported && !json.errors) {
        setError(json.error ?? 'Import failed')
        return
      }
      setResult(json)
      if (json.imported > 0) setFile(null)
    } catch {
      setError('Network error — please try again.')
    } finally {
      setLoading(false)
    }
  }, [file, entityId])

  const handleEntityChange = (id: string) => {
    setEntityId(id); setFile(null); setResult(null); setError('')
  }

  return (
    <div>
      <Topbar title="Import Data" />
      <div className="p-6 max-w-3xl mx-auto space-y-6">

        {/* Header info */}
        <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-100 rounded-xl">
          <Upload className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-blue-800 leading-relaxed">
            <p className="font-semibold mb-0.5">Bulk data import</p>
            <p>
              Upload a CSV or Excel file to add records in bulk. Download the template for the correct
              column format. Extra columns are ignored — only required fields must be present.
            </p>
          </div>
        </div>

        {/* Entity selector */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-sm font-semibold text-slate-900 mb-3">1. Choose what to import</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {ENTITIES.map(e => (
              <button
                key={e.id}
                onClick={() => handleEntityChange(e.id)}
                className={cn(
                  'flex items-start gap-3 p-3.5 rounded-xl border-2 text-left transition-all',
                  entityId === e.id
                    ? 'border-indigo-500 bg-indigo-50/50'
                    : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                )}>
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${e.color}`}>
                  <FileSpreadsheet className="w-4 h-4" />
                </div>
                <div>
                  <p className={cn('text-sm font-semibold', entityId === e.id ? 'text-indigo-900' : 'text-slate-800')}>
                    {e.label}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">{e.desc}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Template download */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-slate-900">2. Download the template</p>
            <button
              onClick={downloadTemplate}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors">
              <Download className="w-3.5 h-3.5" />
              Download {entityId}-template.csv
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="text-xs w-full border-collapse">
              <thead>
                <tr className="bg-slate-50">
                  {entity.columns.map(col => (
                    <th key={col} className={cn(
                      'px-3 py-2 text-left font-semibold border border-slate-200',
                      entity.required.includes(col) ? 'text-red-700' : 'text-slate-500'
                    )}>
                      {col}
                      {entity.required.includes(col) && <span className="ml-0.5">*</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  {entity.columns.map(col => (
                    <td key={col} className="px-3 py-2 text-slate-400 border border-slate-100 italic">
                      example…
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-400 mt-2">
            <span className="text-red-600 font-semibold">* Required</span> — other columns are optional
          </p>
        </div>

        {/* File upload */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-sm font-semibold text-slate-900 mb-3">3. Upload your file</p>
          <DropZone file={file} onFile={setFile} onClear={() => { setFile(null); setResult(null) }} />

          {file && (
            <div className="mt-4">
              <button
                onClick={handleImport}
                disabled={loading}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                {loading
                  ? <><Loader2 className="w-4 h-4 animate-spin" />Importing…</>
                  : <><Upload className="w-4 h-4" />Import {entity.label}</>}
              </button>
            </div>
          )}

          {error && (
            <div className="mt-4 flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
        </div>

        {/* Result */}
        {result && !loading && (
          <ResultPanel result={result} entity={entity.label.toLowerCase()} />
        )}

      </div>
    </div>
  )
}
