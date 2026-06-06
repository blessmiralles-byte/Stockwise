'use client'

import { useState, useRef } from 'react'
import { X, Printer, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────
export interface LabelAsset {
  id:          string
  asset_tag:   string
  name:        string
  category?:   { name: string } | null
  location?:   { name: string; code?: string } | null
  accountable_person?: { name: string; department?: string } | null
}

type LabelSize = 'small' | 'standard' | 'large'
type Columns   = 1 | 2 | 3

// ── Label size config ─────────────────────────────────────────────────────────
const SIZE_CFG: Record<LabelSize, {
  label:    string
  hint:     string
  qrPx:     number
  widthPx:  number
  heightPx: number
}> = {
  small: {
    label:    'Small',
    hint:     '50 × 25 mm  ·  Dymo 30336',
    qrPx:     60,
    widthPx:  189,   // ~50mm @96dpi
    heightPx: 94,    // ~25mm @96dpi
  },
  standard: {
    label:    'Standard',
    hint:     '90 × 50 mm  ·  Avery / general',
    qrPx:     100,
    widthPx:  340,
    heightPx: 189,
  },
  large: {
    label:    'Large',
    hint:     '100 × 70 mm  ·  A4 portion',
    qrPx:     130,
    widthPx:  378,
    heightPx: 264,
  },
}

// ── Single label (preview) ────────────────────────────────────────────────────
function Label({ asset, size }: { asset: LabelAsset; size: LabelSize }) {
  const cfg = SIZE_CFG[size]
  const qrSrc = `/api/barcode/generate?code=${encodeURIComponent(asset.asset_tag)}&size=${cfg.qrPx * 2}&format=png_dataurl`
  // We use a server-rendered img via the generate endpoint
  const imgSrc = `/api/barcode/generate?code=${encodeURIComponent(asset.asset_tag)}&size=${cfg.qrPx * 2}`

  const isSmall = size === 'small'

  return (
    <div
      className="border border-slate-300 bg-white rounded flex items-center overflow-hidden flex-shrink-0 print:rounded-none print:border-slate-400"
      style={{ width: cfg.widthPx, height: cfg.heightPx }}
    >
      {/* QR code */}
      <div className="flex-shrink-0 flex items-center justify-center bg-white p-1.5 border-r border-slate-200 h-full"
        style={{ width: cfg.qrPx + 12 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imgSrc}
          alt={asset.asset_tag}
          width={cfg.qrPx}
          height={cfg.qrPx}
          className="block"
        />
      </div>

      {/* Text block */}
      <div className="flex-1 px-2 py-1.5 min-w-0 overflow-hidden flex flex-col justify-center gap-0.5">
        <p
          className="font-mono font-bold text-slate-900 leading-none"
          style={{ fontSize: isSmall ? 9 : 11 }}
        >
          {asset.asset_tag}
        </p>
        <p
          className="font-semibold text-slate-800 leading-tight truncate"
          style={{ fontSize: isSmall ? 8 : 11 }}
        >
          {asset.name}
        </p>
        {!isSmall && (
          <>
            {(asset.category?.name || asset.location?.name) && (
              <p className="text-slate-500 leading-tight truncate" style={{ fontSize: 9 }}>
                {[asset.category?.name, asset.location?.name].filter(Boolean).join('  ·  ')}
              </p>
            )}
            {asset.accountable_person?.name && (
              <p className="text-slate-400 leading-tight truncate" style={{ fontSize: 8 }}>
                {asset.accountable_person.name}
                {asset.accountable_person.department ? ` — ${asset.accountable_person.department}` : ''}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── Print Labels Dialog ───────────────────────────────────────────────────────
export function PrintLabelsDialog({
  assets,
  onClose,
}: {
  assets: LabelAsset[]
  onClose: () => void
}) {
  const [size,    setSize]    = useState<LabelSize>('standard')
  const [columns, setColumns] = useState<Columns>(2)
  const printRef = useRef<HTMLDivElement>(null)

  const doPrint = () => {
    const cfg = SIZE_CFG[size]

    // Build a standalone HTML page with all labels and auto-print
    const labelsHtml = assets.map(a => {
      const imgSrc = `/api/barcode/generate?code=${encodeURIComponent(a.asset_tag)}&size=${cfg.qrPx * 2}`
      const isSmall = size === 'small'

      const location  = [a.category?.name, a.location?.name].filter(Boolean).join(' · ')
      const person    = a.accountable_person?.name
        ? `${a.accountable_person.name}${a.accountable_person.department ? ' — ' + a.accountable_person.department : ''}`
        : ''

      return `
        <div class="label">
          <div class="qr-box" style="width:${cfg.qrPx + 12}px">
            <img src="${imgSrc}" width="${cfg.qrPx}" height="${cfg.qrPx}" />
          </div>
          <div class="text-box">
            <p class="tag" style="font-size:${isSmall ? 9 : 11}px">${escHtml(a.asset_tag)}</p>
            <p class="name" style="font-size:${isSmall ? 8 : 11}px">${escHtml(a.name)}</p>
            ${!isSmall && location  ? `<p class="meta" style="font-size:9px">${escHtml(location)}</p>`  : ''}
            ${!isSmall && person    ? `<p class="person" style="font-size:8px">${escHtml(person)}</p>`   : ''}
          </div>
        </div>`
    }).join('\n')

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Asset Labels — StockWise</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: system-ui, -apple-system, sans-serif;
    background: white;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(${columns}, ${cfg.widthPx}px);
    gap: 6px;
    padding: 12px;
  }
  .label {
    width: ${cfg.widthPx}px;
    height: ${cfg.heightPx}px;
    border: 1px solid #94a3b8;
    display: flex;
    align-items: center;
    overflow: hidden;
    background: white;
    page-break-inside: avoid;
  }
  .qr-box {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border-right: 1px solid #e2e8f0;
    height: 100%;
    padding: 4px;
  }
  .qr-box img { display: block; }
  .text-box {
    flex: 1;
    padding: 4px 6px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 2px;
  }
  .tag    { font-family: ui-monospace, monospace; font-weight: 700; color: #0f172a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .name   { font-weight: 600; color: #1e293b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .meta   { color: #64748b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .person { color: #94a3b8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  @media print {
    body { margin: 0; }
    .grid { padding: 4px; gap: 4px; }
  }
</style>
</head>
<body>
<div class="grid">${labelsHtml}</div>
<script>
  // Wait for all QR images to load before printing
  var imgs = document.images;
  var loaded = 0;
  function tryPrint() {
    loaded++;
    if (loaded >= imgs.length) { window.print(); window.onafterprint = function() { window.close(); }; }
  }
  if (imgs.length === 0) {
    window.print(); window.onafterprint = function() { window.close(); };
  } else {
    for (var i = 0; i < imgs.length; i++) {
      imgs[i].onload  = tryPrint;
      imgs[i].onerror = tryPrint;
    }
  }
<\/script>
</body>
</html>`

    const win = window.open('', '_blank', 'width=900,height=700')
    if (!win) {
      alert('Pop-up blocked — please allow pop-ups for this site and try again.')
      return
    }
    win.document.write(html)
    win.document.close()
  }

  const cfg = SIZE_CFG[size]

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl flex flex-col max-h-[92vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-100 flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Print Asset Labels</h2>
            <p className="text-xs text-slate-400 mt-0.5">{assets.length} label{assets.length !== 1 ? 's' : ''} ready to print</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="w-4 h-4" /></Button>
        </div>

        {/* Options bar */}
        <div className="flex items-center gap-4 px-6 py-3 border-b border-slate-100 bg-slate-50 flex-shrink-0">
          {/* Label size */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-500">Label size</span>
            <div className="flex rounded-lg border border-slate-200 overflow-hidden">
              {(Object.keys(SIZE_CFG) as LabelSize[]).map(s => (
                <button
                  key={s}
                  onClick={() => setSize(s)}
                  className={cn(
                    'px-3 py-1.5 text-xs font-medium transition-colors',
                    size === s
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white text-slate-600 hover:bg-slate-50'
                  )}
                >
                  {SIZE_CFG[s].label}
                </button>
              ))}
            </div>
            <span className="text-xs text-slate-400">{SIZE_CFG[size].hint}</span>
          </div>

          {/* Columns */}
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-xs font-medium text-slate-500">Columns</span>
            <div className="flex rounded-lg border border-slate-200 overflow-hidden">
              {([1, 2, 3] as Columns[]).map(c => (
                <button
                  key={c}
                  onClick={() => setColumns(c)}
                  className={cn(
                    'px-3 py-1.5 text-xs font-medium transition-colors',
                    columns === c
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white text-slate-600 hover:bg-slate-50'
                  )}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Preview */}
        <div className="flex-1 overflow-auto p-6 bg-slate-100">
          <div
            className="flex flex-wrap gap-2"
            style={{ maxWidth: cfg.widthPx * columns + (columns - 1) * 8 + 1 }}
          >
            {assets.map(asset => (
              <Label key={asset.id} asset={asset} size={size} />
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 flex-shrink-0">
          <p className="text-xs text-slate-400">
            Opens a new window — choose <strong>Save as PDF</strong> to get a file instead of printing
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={doPrint} className="gap-2">
              <Printer className="w-4 h-4" />
              Print {assets.length} Label{assets.length !== 1 ? 's' : ''}
            </Button>
          </div>
        </div>

      </div>
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function escHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
