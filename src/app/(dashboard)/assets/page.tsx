'use client'

import { useState, useMemo } from 'react'
import { Topbar } from '@/components/layout/topbar'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CardSkeleton } from '@/components/ui/skeleton'
import { useApi } from '@/lib/use-api'
import { formatCurrency, formatDate } from '@/lib/utils'
import { cn } from '@/lib/utils'
import {
  Search, Plus, ScanBarcode, Building2, MoreVertical, User, MapPin,
  X, AlertCircle, Loader2, Shield, TrendingDown, Wrench, ChevronRight,
  Calendar, Info, CheckCircle2, Users, Pencil, Trash2, Printer, Tag,
  Archive, DollarSign, RefreshCw, LogOut, LogIn, Clock, Lock,
} from 'lucide-react'
import Link from 'next/link'
import { PrintLabelsDialog, type LabelAsset } from '@/components/print-labels'

// ── Status config ─────────────────────────────────────────────────────────────
const statusConfig: Record<string, { label: string; variant: any }> = {
  active:      { label: 'Active',         variant: 'success'     },
  maintenance: { label: 'In Maintenance', variant: 'warning'     },
  inactive:    { label: 'Inactive',       variant: 'secondary'   },
  disposed:    { label: 'Disposed',       variant: 'destructive' },
  retired:     { label: 'Retired',        variant: 'secondary'   },
  sold:        { label: 'Sold',           variant: 'secondary'   },
}

const DEPRECIATION_LABELS: Record<string, string> = {
  straight_line:       'Straight-Line',
  declining_balance:   'Declining Balance (150%)',
  double_declining:    'Double Declining Balance',
  units_of_production: 'Units of Production',
  none:                'None / Not depreciable',
}

// ── Depreciation preview ──────────────────────────────────────────────────────
function DepreciationPreview({
  cost, salvage, lifeYears, method,
}: { cost: number; salvage: number; lifeYears: number; method: string }) {
  if (!cost || !lifeYears || method === 'none' || method === 'units_of_production') return null
  const depBase = Math.max(0, cost - salvage)

  let annualAmt = 0
  if (method === 'straight_line') {
    annualAmt = depBase / lifeYears
  } else if (method === 'declining_balance') {
    annualAmt = cost * (1.5 / lifeYears)
  } else if (method === 'double_declining') {
    annualAmt = cost * (2 / lifeYears)
  }

  if (!annualAmt) return null

  return (
    <div className="bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2.5 text-xs text-indigo-700 space-y-0.5">
      <p className="font-semibold">Depreciation estimate</p>
      <p>Annual: <strong>{formatCurrency(annualAmt)}</strong> · Monthly: <strong>{formatCurrency(annualAmt / 12)}</strong></p>
      {method === 'straight_line' && (
        <p className="text-indigo-500">({formatCurrency(cost)} − {formatCurrency(salvage)}) ÷ {lifeYears} years</p>
      )}
    </div>
  )
}

// ── Manage Accountable Persons Panel ─────────────────────────────────────────
// Visible only to owner / operations manager
function ManagePersonsPanel({ onClose }: { onClose: () => void }) {
  const { data, loading, refetch } = useApi<{ data: any[] }>('/api/accountable-persons')
  const persons = data?.data ?? []

  const [name,       setName]       = useState('')
  const [department, setDepartment] = useState('')
  const [email,      setEmail]      = useState('')
  const [phone,      setPhone]      = useState('')
  const [saving,     setSaving]     = useState(false)
  const [formError,  setFormError]  = useState('')

  const [editId,     setEditId]     = useState<string | null>(null)
  const [deleting,   setDeleting]   = useState<string | null>(null)
  const [deleteError,setDeleteError]= useState<Record<string, string>>({})

  const resetForm = () => { setName(''); setDepartment(''); setEmail(''); setPhone(''); setEditId(null); setFormError('') }

  const startEdit = (p: any) => {
    setEditId(p.id); setName(p.name); setDepartment(p.department ?? ''); setEmail(p.email ?? ''); setPhone(p.phone ?? ''); setFormError('')
  }

  const save = async () => {
    if (!name.trim()) { setFormError('Name is required'); return }
    setSaving(true); setFormError('')
    const url    = editId ? `/api/accountable-persons/${editId}` : '/api/accountable-persons'
    const method = editId ? 'PATCH' : 'POST'
    const res    = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), department: department.trim() || undefined, email: email.trim() || undefined, phone: phone.trim() || undefined }),
    })
    const json = await res.json()
    setSaving(false)
    if (!res.ok) { setFormError(json.error ?? 'Failed to save'); return }
    resetForm(); refetch()
  }

  const del = async (id: string) => {
    setDeleting(id); setDeleteError(prev => ({ ...prev, [id]: '' }))
    const res  = await fetch(`/api/accountable-persons/${id}`, { method: 'DELETE' })
    const json = await res.json()
    setDeleting(null)
    if (!res.ok) { setDeleteError(prev => ({ ...prev, [id]: json.error ?? 'Failed to delete' })); return }
    refetch()
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg flex flex-col max-h-[88vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-600" />
            <h2 className="text-base font-semibold text-slate-900">Accountable Persons</h2>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="w-4 h-4" /></Button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* Add / Edit form */}
          <div className="bg-slate-50 rounded-xl border border-slate-100 p-4 space-y-3">
            <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
              {editId ? 'Edit Person' : 'Add New Person'}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-600 mb-1">Full Name <span className="text-red-500">*</span></label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Juan dela Cruz" autoFocus />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Department</label>
                <Input value={department} onChange={e => setDepartment(e.target.value)} placeholder="e.g. Operations" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Email</label>
                <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="juan@company.com" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-600 mb-1">Phone</label>
                <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+63 9XX XXX XXXX" />
              </div>
            </div>
            {formError && (
              <p className="text-xs text-red-600 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5" /> {formError}
              </p>
            )}
            <div className="flex gap-2 justify-end pt-1">
              {editId && (
                <Button variant="outline" size="sm" onClick={resetForm}>Cancel</Button>
              )}
              <Button size="sm" onClick={save} disabled={saving} className="gap-1.5">
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                {editId ? 'Save Changes' : 'Add Person'}
              </Button>
            </div>
          </div>

          {/* Persons list */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              {persons.length} person{persons.length !== 1 ? 's' : ''}
            </p>
            {loading ? (
              <div className="space-y-2">
                {[1,2,3].map(i => <div key={i} className="h-14 rounded-lg bg-slate-100 animate-pulse" />)}
              </div>
            ) : persons.length === 0 ? (
              <div className="text-center py-8 text-slate-400 border border-dashed rounded-xl">
                <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No persons added yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {persons.map((p: any) => (
                  <div key={p.id} className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors',
                    editId === p.id ? 'border-indigo-200 bg-indigo-50' : 'border-slate-100 bg-white hover:bg-slate-50'
                  )}>
                    <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-semibold text-xs flex-shrink-0">
                      {p.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">{p.name}</p>
                      <p className="text-xs text-slate-400 truncate">
                        {[p.department, p.email, p.phone].filter(Boolean).join(' · ') || 'No details'}
                      </p>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <button onClick={() => startEdit(p)} className="p-1.5 rounded-md text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => del(p.id)}
                        disabled={deleting === p.id}
                        className="p-1.5 rounded-md text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
                      >
                        {deleting === p.id
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <Trash2 className="w-3.5 h-3.5" />
                        }
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {/* Delete errors */}
            {Object.entries(deleteError).map(([id, msg]) => msg ? (
              <p key={id} className="text-xs text-red-600 mt-1 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> {msg}
              </p>
            ) : null)}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex justify-end">
          <Button variant="outline" onClick={onClose}>Done</Button>
        </div>
      </div>
    </div>
  )
}

// ── Retire / Sell Dialog ─────────────────────────────────────────────────────
function RetireSellDialog({
  asset,
  mode,
  onClose,
  onSaved,
}: {
  asset:   any
  mode:    'retire' | 'sell'
  onClose: () => void
  onSaved: () => void
}) {
  const [date,   setDate]   = useState(new Date().toISOString().split('T')[0])
  const [reason, setReason] = useState('')
  const [buyer,  setBuyer]  = useState('')
  const [price,  setPrice]  = useState('')
  const [notes,  setNotes]  = useState('')
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  const isRetire = mode === 'retire'

  const handleSubmit = async () => {
    if (isRetire && !reason.trim()) { setError('Please provide a retirement reason'); return }
    if (!isRetire && !price)        { setError('Sale price is required'); return }
    if (!isRetire && Number(price) <= 0) { setError('Sale price must be greater than zero'); return }

    setSaving(true); setError('')
    const body: Record<string, any> = { status: isRetire ? 'retired' : 'sold' }
    if (isRetire) {
      body.retirement_reason = reason.trim()
    } else {
      body.sale_price = Number(price)
      body.sale_buyer = buyer.trim() || undefined
      body.sale_notes = notes.trim() || undefined
    }

    const res  = await fetch(`/api/assets/${asset.id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    })
    const json = await res.json()
    setSaving(false)
    if (!res.ok) { setError(json.error ?? 'Failed to save'); return }
    onSaved()
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">

        {/* Header */}
        <div className={cn(
          'flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-100 rounded-t-xl',
          isRetire ? 'bg-slate-50' : 'bg-amber-50'
        )}>
          <div className="flex items-center gap-3">
            <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center',
              isRetire ? 'bg-slate-200' : 'bg-amber-100'
            )}>
              {isRetire
                ? <Archive    className="w-4 h-4 text-slate-600" />
                : <DollarSign className="w-4 h-4 text-amber-600" />
              }
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                {isRetire ? 'Retire Asset' : 'Sell Asset'}
              </h2>
              <p className="text-xs text-slate-500 truncate max-w-[260px]">{asset.name} · {asset.asset_tag}</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="w-4 h-4" /></Button>
        </div>

        <div className="px-6 py-5 space-y-4">

          {isRetire ? (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Retirement Date
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Reason for Retirement <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  placeholder="e.g. End of useful life, beyond economical repair, replaced by newer model…"
                  rows={3}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                  autoFocus
                />
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {['End of useful life', 'Beyond economical repair', 'Replaced by newer model', 'Damaged / written off'].map(r => (
                    <button key={r} type="button" onClick={() => setReason(r)}
                      className="text-xs px-2 py-1 rounded-full border border-slate-200 text-slate-500 hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors">
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Sale Date</label>
                  <input
                    type="date"
                    value={date}
                    onChange={e => setDate(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Sale Price <span className="text-red-500">*</span>
                  </label>
                  <Input
                    type="number" min="0" step="0.01"
                    placeholder="0.00"
                    value={price}
                    onChange={e => setPrice(e.target.value)}
                    autoFocus
                  />
                </div>
              </div>

              {asset.purchase_cost > 0 && price && Number(price) > 0 && (
                <div className={cn('text-xs px-3 py-2 rounded-lg border',
                  Number(price) >= asset.purchase_cost
                    ? 'bg-green-50 border-green-100 text-green-700'
                    : 'bg-amber-50 border-amber-100 text-amber-700'
                )}>
                  {Number(price) >= asset.purchase_cost
                    ? `Gain on sale: ${formatCurrency(Number(price) - asset.purchase_cost)}`
                    : `Loss on sale: ${formatCurrency(asset.purchase_cost - Number(price))}`
                  }
                  {' '}(purchase cost was {formatCurrency(asset.purchase_cost)})
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Buyer Name</label>
                <Input
                  value={buyer}
                  onChange={e => setBuyer(e.target.value)}
                  placeholder="Individual or company name"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Invoice reference, payment method, any additional details…"
                  rows={2}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
              </div>
            </>
          )}

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> {error}
            </p>
          )}

          <div className="flex gap-2 justify-end pt-1">
            <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={saving}
              className={cn('gap-1.5', isRetire ? '' : 'bg-amber-600 hover:bg-amber-700')}
            >
              {saving
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : isRetire ? <Archive className="w-3.5 h-3.5" /> : <DollarSign className="w-3.5 h-3.5" />
              }
              {saving ? 'Saving…' : isRetire ? 'Retire Asset' : 'Record Sale'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Asset card dropdown ───────────────────────────────────────────────────────
function AssetCardMenu({
  asset,
  canDispose,
  onRetire,
  onSell,
  onReactivate,
}: {
  asset:        any
  canDispose:   boolean
  onRetire:     () => void
  onSell:       () => void
  onReactivate: () => void
}) {
  const [open, setOpen] = useState(false)

  const isEndOfLife = ['retired', 'sold', 'disposed'].includes(asset.status)

  if (!canDispose) return null

  return (
    <div className="relative">
      <Button
        variant="ghost" size="icon"
        className="w-7 h-7"
        onClick={e => { e.stopPropagation(); setOpen(o => !o) }}
      >
        <MoreVertical className="w-4 h-4" />
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 w-44 bg-white border border-slate-200 rounded-xl shadow-lg z-20 py-1 overflow-hidden">
            {isEndOfLife ? (
              <button
                onClick={() => { setOpen(false); onReactivate() }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <RefreshCw className="w-3.5 h-3.5 text-green-500" /> Reactivate
              </button>
            ) : (
              <>
                <button
                  onClick={() => { setOpen(false); onRetire() }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  <Archive className="w-3.5 h-3.5 text-slate-500" /> Retire Asset
                </button>
                <button
                  onClick={() => { setOpen(false); onSell() }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  <DollarSign className="w-3.5 h-3.5 text-amber-500" /> Sell Asset
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ── Add Asset Dialog ──────────────────────────────────────────────────────────
type Tab = 'info' | 'financials' | 'warranty' | 'maintenance'
const TABS: { id: Tab; label: string; icon: any }[] = [
  { id: 'info',        label: 'Asset Info',   icon: Building2    },
  { id: 'financials',  label: 'Depreciation', icon: TrendingDown },
  { id: 'warranty',    label: 'Warranty',     icon: Shield       },
  { id: 'maintenance', label: 'Maintenance',  icon: Wrench       },
]

function AddAssetDialog({ onClose, onSaved, canManagePersons }: {
  onClose: () => void
  onSaved: () => void
  canManagePersons: boolean
}) {
  const { data: catData }    = useApi<{ data: any[] }>('/api/categories?type=fixed_asset')
  const { data: locData }    = useApi<{ data: any[] }>('/api/locations?all=true')
  // Always fetch persons — GET is open to all authenticated users now
  const { data: personData } = useApi<{ data: any[] }>('/api/accountable-persons')
  const { data: orgData }    = useApi<{ data: any }>('/api/org')

  const categories = catData?.data ?? []
  const locations  = locData?.data ?? []
  const persons    = personData?.data ?? []

  const [tab, setTab] = useState<Tab>('info')

  // ── Asset Info ──────────────────────────────────────────────
  const [name,        setName]        = useState('')
  const [assetTag,    setAssetTag]    = useState('')
  const [serialNo,    setSerialNo]    = useState('')
  const [categoryId,  setCategoryId]  = useState('')
  const [locationId,  setLocationId]  = useState('')
  const [personId,    setPersonId]    = useState('')
  const [description, setDescription] = useState('')
  const [status,      setStatus]      = useState('active')
  // Tool tracking: require approval to check out (default from org setting)
  const [reqApproval,     setReqApproval]     = useState<boolean | null>(null)
  const requiresApproval = reqApproval ?? !!orgData?.data?.require_checkout_approval

  // ── Financials / Depreciation ───────────────────────────────
  const [purchaseDate,     setPurchaseDate]     = useState(new Date().toISOString().split('T')[0])
  const [purchaseCost,     setPurchaseCost]     = useState('')
  const [deprMethod,       setDeprMethod]       = useState('straight_line')
  const [usefulLifeYears,  setUsefulLifeYears]  = useState('')
  const [salvageValue,     setSalvageValue]     = useState('0')

  // ── Warranty ────────────────────────────────────────────────
  const [hasWarranty,      setHasWarranty]      = useState(false)
  const [wProvider,        setWProvider]        = useState('')
  const [wNumber,          setWNumber]          = useState('')
  const [wExpires,         setWExpires]         = useState('')
  const [wContact,         setWContact]         = useState('')
  const [wNotes,           setWNotes]           = useState('')

  // ── Initial Maintenance ─────────────────────────────────────
  const [schedMaint,       setSchedMaint]       = useState(false)
  const [maintTitle,       setMaintTitle]       = useState('Initial Service / Commissioning')
  const [maintDate,        setMaintDate]        = useState('')
  const [maintNotes,       setMaintNotes]       = useState('')
  const [maintNotify,      setMaintNotify]      = useState('3')

  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  // Tab completion indicators
  const infoValid  = !!name.trim()
  const finValid   = !!purchaseCost && Number(purchaseCost) > 0
  const warnValid  = !hasWarranty || !!wProvider.trim()
  const maintValid = !schedMaint  || (!!maintTitle.trim() && !!maintDate)

  const tabDone: Record<Tab, boolean> = {
    info:        infoValid,
    financials:  finValid,
    warranty:    warnValid,
    maintenance: maintValid,
  }

  async function handleSubmit() {
    if (!name.trim()) { setError('Asset name is required'); setTab('info'); return }
    if (schedMaint && !maintDate) { setError('Select a date for the maintenance task'); setTab('maintenance'); return }

    setSaving(true); setError('')
    try {
      // 1. Create the asset
      const assetBody: Record<string, any> = {
        name, asset_tag: assetTag || undefined, serial_number: serialNo || undefined,
        description: description || undefined, status,
        category_id:           categoryId  || undefined,
        location_id:           locationId  || undefined,
        accountable_person_id: personId    || undefined,
        purchase_date:         purchaseDate || undefined,
        purchase_cost:         purchaseCost ? Number(purchaseCost)    : undefined,
        depreciation_method:   deprMethod,
        useful_life_years:     usefulLifeYears ? Number(usefulLifeYears) : undefined,
        salvage_value:         salvageValue    ? Number(salvageValue)    : 0,
        requires_checkout_approval: requiresApproval,
      }
      if (hasWarranty) {
        Object.assign(assetBody, {
          warranty_provider: wProvider  || undefined,
          warranty_number:   wNumber    || undefined,
          warranty_expires:  wExpires   || undefined,
          warranty_contact:  wContact   || undefined,
          warranty_notes:    wNotes     || undefined,
        })
      }

      const assetRes = await fetch('/api/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(assetBody),
      })
      const assetJson = await assetRes.json()
      if (!assetRes.ok) { setError(assetJson.error ?? 'Failed to create asset'); return }

      // 2. Optionally schedule initial maintenance
      if (schedMaint && maintTitle.trim() && maintDate) {
        await fetch('/api/maintenance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            asset_id:           assetJson.data.id,
            title:              maintTitle.trim(),
            description:        maintNotes.trim() || undefined,
            scheduled_date:     maintDate,
            notify_days_before: Number(maintNotify) || 3,
            status:             'scheduled',
          }),
        })
      }

      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl flex flex-col max-h-[92vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-slate-100 flex-shrink-0">
          <h2 className="text-base font-semibold text-slate-900">Add Fixed Asset</h2>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="w-4 h-4" /></Button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-100 flex-shrink-0 px-2">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px',
                tab === t.id
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              )}
            >
              {tabDone[t.id] && tab !== t.id
                ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                : <t.icon className="w-3.5 h-3.5" />
              }
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content (scrollable) */}
        <div className="flex-1 overflow-y-auto px-6 py-5">

          {/* ── TAB: Asset Info ── */}
          {tab === 'info' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Asset Name <span className="text-red-500">*</span>
                  </label>
                  <Input
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="e.g. Caterpillar Excavator 320, Generator Set #2"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Asset Tag
                    <span className="ml-1 text-slate-400 font-normal">(auto-generated if blank)</span>
                  </label>
                  <Input
                    value={assetTag}
                    onChange={e => setAssetTag(e.target.value)}
                    placeholder="e.g. EXC-001"
                    className="font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Serial Number</label>
                  <Input
                    value={serialNo}
                    onChange={e => setSerialNo(e.target.value)}
                    placeholder="Manufacturer serial"
                    className="font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Category</label>
                  <select
                    value={categoryId}
                    onChange={e => setCategoryId(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                  >
                    <option value="">— Select category —</option>
                    {categories.map((c: any) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Status</label>
                  <select
                    value={status}
                    onChange={e => setStatus(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive / Not yet deployed</option>
                    <option value="maintenance">In Maintenance</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Location</label>
                  <select
                    value={locationId}
                    onChange={e => setLocationId(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                  >
                    <option value="">— Select location —</option>
                    {locations.map((l: any) => (
                      <option key={l.id} value={l.id}>
                        {'  '.repeat(l.level ?? 0)}{l.name} {l.code ? `(${l.code})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Accountable Person</label>
                  <select
                    value={personId}
                    onChange={e => setPersonId(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                  >
                    <option value="">— Unassigned —</option>
                    {persons.map((p: any) => (
                      <option key={p.id} value={p.id}>{p.name}{p.department ? ` — ${p.department}` : ''}</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-600 mb-1">Description</label>
                  <textarea
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="Model, specs, notes…"
                    rows={2}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                  />
                </div>
                <label className="col-span-2 flex items-center gap-3 p-3 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors">
                  <input
                    type="checkbox"
                    checked={requiresApproval}
                    onChange={e => setReqApproval(e.target.checked)}
                    className="w-4 h-4 rounded text-indigo-600"
                  />
                  <div>
                    <p className="text-sm font-medium text-slate-900">Require approval to check out</p>
                    <p className="text-xs text-slate-400">Someone must approve before this tool can leave. Defaults to your org setting.</p>
                  </div>
                </label>
              </div>
            </div>
          )}

          {/* ── TAB: Financials / Depreciation ── */}
          {tab === 'financials' && (
            <div className="space-y-5">
              {/* Purchase */}
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Purchase Details</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Purchase Date
                    </label>
                    <Input type="date" value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Purchase Cost <span className="text-red-500">*</span>
                    </label>
                    <Input
                      type="number" min="0" step="0.01"
                      placeholder="0.00"
                      value={purchaseCost}
                      onChange={e => setPurchaseCost(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* Depreciation */}
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Depreciation</p>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Method</label>
                    <select
                      value={deprMethod}
                      onChange={e => setDeprMethod(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                    >
                      {Object.entries(DEPRECIATION_LABELS).map(([v, l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </select>
                  </div>

                  {deprMethod !== 'none' && deprMethod !== 'units_of_production' && (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Useful Life (years)</label>
                        <Input
                          type="number" min="1" max="99" step="1"
                          placeholder="e.g. 5"
                          value={usefulLifeYears}
                          onChange={e => setUsefulLifeYears(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Salvage / Residual Value</label>
                        <Input
                          type="number" min="0" step="0.01"
                          placeholder="0.00"
                          value={salvageValue}
                          onChange={e => setSalvageValue(e.target.value)}
                        />
                      </div>
                    </div>
                  )}

                  {deprMethod === 'units_of_production' && (
                    <div className="bg-amber-50 border border-amber-100 rounded-lg px-3 py-2.5 text-xs text-amber-700 flex gap-2">
                      <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                      Units of production depreciation is calculated from usage logs. Track usage hours or units separately.
                    </div>
                  )}

                  <DepreciationPreview
                    cost={Number(purchaseCost) || 0}
                    salvage={Number(salvageValue) || 0}
                    lifeYears={Number(usefulLifeYears) || 0}
                    method={deprMethod}
                  />
                </div>
              </div>
            </div>
          )}

          {/* ── TAB: Warranty ── */}
          {tab === 'warranty' && (
            <div className="space-y-4">
              {/* Toggle */}
              <label className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors">
                <input
                  type="checkbox"
                  checked={hasWarranty}
                  onChange={e => setHasWarranty(e.target.checked)}
                  className="w-4 h-4 rounded text-indigo-600"
                />
                <div>
                  <p className="text-sm font-medium text-slate-900">This asset has a warranty</p>
                  <p className="text-xs text-slate-400">Enable to record warranty terms and expiry</p>
                </div>
              </label>

              {hasWarranty && (
                <div className="space-y-3 pt-1">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Warranty Provider <span className="text-red-500">*</span>
                      </label>
                      <Input
                        value={wProvider}
                        onChange={e => setWProvider(e.target.value)}
                        placeholder="Manufacturer or vendor name"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Warranty Number / Ref</label>
                      <Input
                        value={wNumber}
                        onChange={e => setWNumber(e.target.value)}
                        placeholder="e.g. WRN-2026-00123"
                        className="font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1 flex items-center gap-1">
                        <Calendar className="w-3 h-3" /> Expiry Date
                      </label>
                      <Input
                        type="date"
                        value={wExpires}
                        onChange={e => setWExpires(e.target.value)}
                      />
                      {wExpires && (() => {
                        const daysLeft = Math.ceil((new Date(wExpires).getTime() - Date.now()) / 86400000)
                        if (daysLeft < 0)   return <p className="text-xs text-red-600 mt-1">Warranty has expired</p>
                        if (daysLeft < 30)  return <p className="text-xs text-amber-600 mt-1">Expires in {daysLeft} days</p>
                        const months = Math.round(daysLeft / 30)
                        return <p className="text-xs text-green-600 mt-1">Valid for ~{months} month{months !== 1 ? 's' : ''}</p>
                      })()}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Warranty Contact</label>
                      <Input
                        value={wContact}
                        onChange={e => setWContact(e.target.value)}
                        placeholder="Phone, email, or portal URL"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Coverage Notes</label>
                    <textarea
                      value={wNotes}
                      onChange={e => setWNotes(e.target.value)}
                      placeholder="What's covered, exclusions, claim process, service centre details…"
                      rows={3}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                    />
                  </div>
                </div>
              )}

              {!hasWarranty && (
                <div className="text-center py-8 text-slate-300">
                  <Shield className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Enable the checkbox above to record warranty details</p>
                </div>
              )}
            </div>
          )}

          {/* ── TAB: Initial Maintenance ── */}
          {tab === 'maintenance' && (
            <div className="space-y-4">
              <label className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors">
                <input
                  type="checkbox"
                  checked={schedMaint}
                  onChange={e => setSchedMaint(e.target.checked)}
                  className="w-4 h-4 rounded text-indigo-600"
                />
                <div>
                  <p className="text-sm font-medium text-slate-900">Schedule a maintenance task for this asset</p>
                  <p className="text-xs text-slate-400">Create the first service record right now</p>
                </div>
              </label>

              {schedMaint && (
                <div className="space-y-3 pt-1">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Task Title <span className="text-red-500">*</span></label>
                    <Input
                      value={maintTitle}
                      onChange={e => setMaintTitle(e.target.value)}
                      placeholder="e.g. Initial service, Commissioning check, 1st 500hr service"
                    />
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {['Initial Service / Commissioning', 'First 500hr Service', 'Pre-deployment Inspection', 'Annual Service'].map(p => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setMaintTitle(p)}
                          className="text-xs px-2 py-1 rounded-full border border-slate-200 text-slate-500 hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Scheduled Date <span className="text-red-500">*</span>
                    </label>
                    <Input
                      type="date"
                      value={maintDate}
                      onChange={e => setMaintDate(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Notify Before</label>
                    <div className="flex gap-2">
                      {['1', '3', '5', '7', '14'].map(d => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => setMaintNotify(d)}
                          className={cn(
                            'flex-1 py-2 rounded-lg border text-sm font-medium transition-colors',
                            maintNotify === d
                              ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                              : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                          )}
                        >
                          {d}d
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Instructions</label>
                    <textarea
                      value={maintNotes}
                      onChange={e => setMaintNotes(e.target.value)}
                      placeholder="Checklist, parts to bring, procedures…"
                      rows={2}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                    />
                  </div>
                </div>
              )}

              {!schedMaint && (
                <div className="text-center py-8 text-slate-300">
                  <Wrench className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Enable the checkbox to schedule an initial task</p>
                  <p className="text-xs mt-1">You can always schedule maintenance later from the Maintenance tab</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 flex-shrink-0 bg-slate-50 rounded-b-xl">
          <div className="flex gap-1.5">
            {TABS.map((t, i) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  'w-2 h-2 rounded-full transition-colors',
                  tab === t.id ? 'bg-indigo-600' : tabDone[t.id] ? 'bg-green-400' : 'bg-slate-200'
                )}
                title={t.label}
              />
            ))}
          </div>

          {error && (
            <div className="flex items-center gap-1.5 text-xs text-red-600">
              <AlertCircle className="w-3.5 h-3.5" /> {error}
            </div>
          )}

          <div className="flex gap-2">
            {tab !== 'maintenance' ? (
              <>
                <Button variant="outline" onClick={onClose}>Cancel</Button>
                <Button
                  onClick={() => {
                    const order: Tab[] = ['info', 'financials', 'warranty', 'maintenance']
                    const next = order[order.indexOf(tab) + 1]
                    if (next) setTab(next)
                  }}
                  className="gap-1"
                >
                  Next <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={onClose}>Cancel</Button>
                <Button onClick={handleSubmit} disabled={saving} className="gap-2">
                  {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {saving ? 'Saving…' : schedMaint ? 'Add Asset & Schedule' : 'Add Asset'}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Tool custody helpers ──────────────────────────────────────────────────────
type Custody = { label: string; tone: 'available' | 'out' | 'overdue' | 'pending' }
function custodyOf(asset: any): Custody {
  if (!asset.current_checkout_id) return { label: 'Available', tone: 'available' }
  if (!asset.checked_out_to)      return { label: 'Pending approval', tone: 'pending' }
  const overdue = asset.checkout_due_at && new Date(asset.checkout_due_at).getTime() < Date.now()
  return {
    label: `Out — ${asset.checked_out_to}${asset.checkout_due_at ? ` · due ${formatDate(asset.checkout_due_at)}` : ''}`,
    tone: overdue ? 'overdue' : 'out',
  }
}
const CUSTODY_TONE: Record<Custody['tone'], string> = {
  available: 'text-green-600',
  out:       'text-indigo-600',
  overdue:   'text-red-600',
  pending:   'text-amber-600',
}

// ── Check-out Dialog ──────────────────────────────────────────────────────────
function CheckoutDialog({ asset, onClose, onDone }: { asset: any; onClose: () => void; onDone: (msg: string) => void }) {
  const { data: personData } = useApi<{ data: any[] }>('/api/accountable-persons')
  const persons = personData?.data ?? []
  const [holder, setHolder]   = useState('')
  const [personId, setPersonId] = useState('')
  const [job, setJob]         = useState('')
  const [due, setDue]         = useState('')
  const [notes, setNotes]     = useState('')
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')

  const submit = async () => {
    if (!holder.trim()) { setError('Enter who is taking the tool'); return }
    setSaving(true); setError('')
    try {
      const res = await fetch(`/api/assets/${asset.id}/checkout`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          holder_name: holder.trim(),
          holder_person_id: personId || null,
          job_code: job.trim() || null,
          due_at: due ? new Date(due).toISOString() : null,
          notes: notes.trim() || null,
        }),
      })
      const j = await res.json()
      if (!res.ok) { setError(j.error ?? 'Failed to check out'); return }
      onDone(j.pending
        ? `Checkout request sent for approval — ${asset.name}.`
        : `${asset.name} checked out to ${holder.trim()}.`)
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
            <LogOut className="w-4 h-4 text-indigo-600" /> Check out — {asset.name}
          </h2>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="w-4 h-4" /></Button>
        </div>
        {asset.requires_checkout_approval && (
          <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
            <Lock className="w-3.5 h-3.5" /> This tool needs approval — a manager will confirm before it's released.
          </div>
        )}
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Who's taking it? <span className="text-red-500">*</span></label>
            <Input value={holder} onChange={e => setHolder(e.target.value)} placeholder="Name of the person / crew" autoFocus />
            {persons.length > 0 && (
              <select
                value={personId}
                onChange={e => { setPersonId(e.target.value); const p = persons.find((x: any) => x.id === e.target.value); if (p) setHolder(p.name) }}
                className="w-full mt-2 border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="">— or pick from people —</option>
                {persons.map((p: any) => <option key={p.id} value={p.id}>{p.name}{p.department ? ` — ${p.department}` : ''}</option>)}
              </select>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Job / site</label>
              <Input value={job} onChange={e => setJob(e.target.value)} placeholder="e.g. JOB-2047" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Due back</label>
              <Input type="date" value={due} onChange={e => setDue(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional" />
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className="gap-2">
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {asset.requires_checkout_approval ? 'Request checkout' : 'Check out'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Check-in Dialog ───────────────────────────────────────────────────────────
function CheckinDialog({ asset, onClose, onDone }: { asset: any; onClose: () => void; onDone: (msg: string) => void }) {
  const { data: locData } = useApi<{ data: any[] }>('/api/locations?all=true')
  const locations = locData?.data ?? []
  const [locId, setLocId] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/assets/${asset.id}/checkin`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ returned_to_location_id: locId || null }),
      })
      if (res.ok) onDone(`${asset.name} checked in.`)
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
            <LogIn className="w-4 h-4 text-green-600" /> Check in — {asset.name}
          </h2>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="w-4 h-4" /></Button>
        </div>
        <p className="text-sm text-slate-500">Currently with <strong className="text-slate-700">{asset.checked_out_to ?? 'requester'}</strong>. Where's it coming back to?</p>
        <select value={locId} onChange={e => setLocId(e.target.value)}
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
          <option value="">— Leave location unchanged —</option>
          {locations.map((l: any) => <option key={l.id} value={l.id}>{'  '.repeat(l.level ?? 0)}{l.name}{l.code ? ` (${l.code})` : ''}</option>)}
        </select>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className="gap-2 bg-green-600 hover:bg-green-700">
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Check in
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Checkouts panel (pending approvals + out / overdue) ───────────────────────
function ToolCheckoutsPanel({ canApprove, onChange }: { canApprove: boolean; onChange: () => void }) {
  const { data: pendingData, refetch: refetchPending } = useApi<{ data: any[] }>('/api/assets/checkouts?status=pending')
  const { data: outData,     refetch: refetchOut }     = useApi<{ data: any[] }>('/api/assets/checkouts?status=out')
  const pending = pendingData?.data ?? []
  const out     = outData?.data ?? []
  const overdue = out.filter((c: any) => c.due_at && new Date(c.due_at).getTime() < Date.now())

  const act = async (coId: string, action: 'approve' | 'reject') => {
    let reason: string | undefined
    if (action === 'reject') { const r = window.prompt('Reason (optional):'); if (r === null) return; reason = r || undefined }
    await fetch(`/api/assets/checkouts/${coId}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, reason }),
    })
    refetchPending(); refetchOut(); onChange()
  }

  if (pending.length === 0 && overdue.length === 0) return null

  return (
    <div className="space-y-3">
      {canApprove && pending.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-800 mb-2 flex items-center gap-2">
            <Lock className="w-4 h-4" /> {pending.length} checkout{pending.length !== 1 ? 's' : ''} awaiting approval
          </p>
          <div className="space-y-2">
            {pending.map((c: any) => (
              <div key={c.id} className="flex items-center gap-3 bg-white rounded-lg border border-amber-100 px-3 py-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-800 truncate">{c.asset?.name} <span className="text-slate-400 font-mono text-xs">{c.asset?.asset_tag}</span></p>
                  <p className="text-xs text-slate-500">{c.holder_name}{c.job_code ? ` · ${c.job_code}` : ''} · requested by {c.requester?.full_name ?? '—'}</p>
                </div>
                <Button size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => act(c.id, 'reject')}>Reject</Button>
                <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => act(c.id, 'approve')}>Approve</Button>
              </div>
            ))}
          </div>
        </div>
      )}
      {overdue.length > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm">
          <Clock className="w-4 h-4 text-red-600 flex-shrink-0" />
          <p className="text-red-800">
            <strong>{overdue.length} tool{overdue.length !== 1 ? 's' : ''} overdue:</strong>{' '}
            {overdue.map((c: any) => `${c.asset?.name} (${c.holder_name})`).join(', ')}
          </p>
        </div>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function AssetsPage() {
  const [search,         setSearch]         = useState('')
  const [statusFilter,   setStatusFilter]   = useState('all')
  const [showAdd,        setShowAdd]        = useState(false)
  const [showPersons,    setShowPersons]    = useState(false)
  const [printAssets,    setPrintAssets]    = useState<LabelAsset[] | null>(null)
  const [disposeTarget,  setDisposeTarget]  = useState<{ asset: any; mode: 'retire' | 'sell' } | null>(null)
  const [checkoutTarget, setCheckoutTarget] = useState<any>(null)
  const [checkinTarget,  setCheckinTarget]  = useState<any>(null)
  const [toast,          setToast]          = useState('')

  const { data: profileData } = useApi<any>('/api/user/profile')
  const role = profileData?.role ?? 'viewer'
  const canManagePersons = role === 'owner' || role === 'admin' || role === 'operations' || role === 'manager'
  const canApprove = canManagePersons || role === 'procurement'

  const { data, loading, error, refetch } = useApi<{ data: any[] }>('/api/assets')
  const assets = data?.data ?? []

  const filtered = assets.filter((a: any) => {
    const matchSearch =
      (a.name ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (a.asset_tag ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (a.serial_number ?? '').toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'all' || a.status === statusFilter
    return matchSearch && matchStatus
  })

  // Warranty expiry warnings
  const expiringWarranties = useMemo(() => assets.filter((a: any) => {
    if (!a.warranty_expires) return false
    const days = Math.ceil((new Date(a.warranty_expires).getTime() - Date.now()) / 86400000)
    return days >= 0 && days <= 30
  }), [assets])

  return (
    <div>
      <Topbar title="Fixed Assets" />
      <div className="p-6 space-y-4">

        {toast && (
          <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-4 py-2.5 text-sm text-green-800">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> {toast}
          </div>
        )}

        {/* Tool checkouts: pending approvals + overdue */}
        <ToolCheckoutsPanel canApprove={canApprove} onChange={refetch} />

        {/* Warranty expiry banner */}
        {expiringWarranties.length > 0 && (
          <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm">
            <Shield className="w-4 h-4 text-amber-600 flex-shrink-0" />
            <p className="text-amber-800">
              <strong>{expiringWarranties.length} asset{expiringWarranties.length > 1 ? 's have' : ' has'} warranties expiring within 30 days:</strong>{' '}
              {expiringWarranties.map((a: any) => a.name).join(', ')}
            </p>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap flex-1">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Search by name, tag, or serial..."
                className="pl-9"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-1">
              {['all', 'active', 'maintenance', 'inactive', 'retired', 'sold'].map(s => (
                <Button
                  key={s}
                  size="sm"
                  variant={statusFilter === s ? 'default' : 'outline'}
                  onClick={() => setStatusFilter(s)}
                  className="capitalize text-xs"
                >
                  {s === 'all' ? 'All' : statusConfig[s]?.label ?? s}
                </Button>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <Link href="/transactions/new">
              <Button variant="outline" className="gap-2"><ScanBarcode className="w-4 h-4" />Scan</Button>
            </Link>
            {canManagePersons && (
              <Button variant="outline" className="gap-2" onClick={() => setShowPersons(true)}>
                <Users className="w-4 h-4" /> Persons
              </Button>
            )}
            {filtered.length > 0 && (
              <Button variant="outline" className="gap-2" onClick={() => setPrintAssets(filtered)}>
                <Printer className="w-4 h-4" />
                Print Labels
                {filtered.length < assets.length && (
                  <span className="ml-0.5 text-indigo-500 font-semibold">({filtered.length})</span>
                )}
              </Button>
            )}
            <Button className="gap-2" onClick={() => setShowAdd(true)}>
              <Plus className="w-4 h-4" /> Add Asset
            </Button>
          </div>
        </div>

        {error && <p className="text-red-500 text-sm">{error}</p>}

        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {loading
            ? Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)
            : filtered.map((asset: any) => {
              const cfg = statusConfig[asset.status] ?? { label: asset.status, variant: 'secondary' }

              // Warranty status
              let warrantyChip = null
              if (asset.warranty_expires) {
                const days = Math.ceil((new Date(asset.warranty_expires).getTime() - Date.now()) / 86400000)
                if (days < 0) {
                  warrantyChip = <span className="text-xs text-red-500 flex items-center gap-0.5"><Shield className="w-3 h-3" /> Warranty expired</span>
                } else if (days <= 30) {
                  warrantyChip = <span className="text-xs text-amber-600 flex items-center gap-0.5"><Shield className="w-3 h-3" /> Warranty expires in {days}d</span>
                } else {
                  warrantyChip = <span className="text-xs text-green-600 flex items-center gap-0.5"><Shield className="w-3 h-3" /> Under warranty</span>
                }
              }

              return (
                <Card key={asset.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center flex-shrink-0">
                          <Building2 className="w-5 h-5 text-purple-600" />
                        </div>
                        <div>
                          <p className="font-semibold text-slate-900 text-sm leading-tight">{asset.name}</p>
                          <p className="text-xs text-slate-400">{asset.asset_tag} · {asset.category?.name ?? '—'}</p>
                        </div>
                      </div>
                      <div className="flex gap-0.5 flex-shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="w-7 h-7 text-slate-400 hover:text-indigo-600"
                          title="Print label"
                          onClick={() => setPrintAssets([asset])}
                        >
                          <Tag className="w-3.5 h-3.5" />
                        </Button>
                        <AssetCardMenu
                          asset={asset}
                          canDispose={canManagePersons}
                          onRetire={() => setDisposeTarget({ asset, mode: 'retire' })}
                          onSell={() => setDisposeTarget({ asset, mode: 'sell' })}
                          onReactivate={async () => {
                            await fetch(`/api/assets/${asset.id}`, {
                              method: 'PATCH',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ status: 'active' }),
                            })
                            refetch()
                          }}
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5 mb-3">
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                        <span>{asset.location?.name ?? '—'}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <User className="w-3.5 h-3.5 flex-shrink-0" />
                        <span>{asset.accountable_person?.name ?? '—'}</span>
                      </div>
                      {asset.depreciation_method && asset.depreciation_method !== 'none' && (
                        <div className="flex items-center gap-2 text-xs text-slate-400">
                          <TrendingDown className="w-3.5 h-3.5 flex-shrink-0" />
                          <span>{DEPRECIATION_LABELS[asset.depreciation_method] ?? asset.depreciation_method}
                            {asset.useful_life_years ? ` · ${asset.useful_life_years}yr` : ''}
                          </span>
                        </div>
                      )}
                      {warrantyChip && (
                        <div className="flex items-center gap-2">{warrantyChip}</div>
                      )}
                    </div>

                    {/* Custody status + check-out/in */}
                    {!['disposed', 'retired', 'sold'].includes(asset.status) && (() => {
                      const c = custodyOf(asset)
                      const isOut = asset.current_checkout_id
                      return (
                        <div className="flex items-center justify-between gap-2 border-t border-slate-50 pt-3 mb-1">
                          <span className={cn('text-xs font-medium flex items-center gap-1.5 min-w-0', CUSTODY_TONE[c.tone])}>
                            {c.tone === 'available' ? <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" /> : <LogOut className="w-3.5 h-3.5 flex-shrink-0" />}
                            <span className="truncate">{c.label}</span>
                          </span>
                          {isOut ? (
                            <Button size="sm" variant="outline" className="gap-1 flex-shrink-0" onClick={() => setCheckinTarget(asset)}>
                              <LogIn className="w-3.5 h-3.5" /> Check in
                            </Button>
                          ) : (
                            <Button size="sm" variant="outline" className="gap-1 flex-shrink-0" onClick={() => setCheckoutTarget(asset)}>
                              <LogOut className="w-3.5 h-3.5" /> Check out
                            </Button>
                          )}
                        </div>
                      )
                    })()}

                    <div className="flex items-center justify-between border-t border-slate-50 pt-3">
                      <div>
                        <p className="text-xs text-slate-400">Purchase Cost</p>
                        <p className="font-bold text-slate-900">{formatCurrency(asset.purchase_cost ?? 0)}</p>
                      </div>
                      <Badge variant={cfg.variant}>{cfg.label}</Badge>
                    </div>
                    <p className="text-xs text-slate-400 mt-2">Acquired {asset.purchase_date ? formatDate(asset.purchase_date) : '—'}</p>
                  </CardContent>
                </Card>
              )
            })
          }
        </div>

        {!loading && filtered.length === 0 && (
          <div className="text-center py-16 text-slate-400">
            <Building2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>No assets found</p>
          </div>
        )}
      </div>

      {showAdd && (
        <AddAssetDialog
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); refetch?.() }}
          canManagePersons={canManagePersons}
        />
      )}

      {showPersons && canManagePersons && (
        <ManagePersonsPanel onClose={() => setShowPersons(false)} />
      )}

      {printAssets && (
        <PrintLabelsDialog
          assets={printAssets}
          onClose={() => setPrintAssets(null)}
        />
      )}

      {disposeTarget && (
        <RetireSellDialog
          asset={disposeTarget.asset}
          mode={disposeTarget.mode}
          onClose={() => setDisposeTarget(null)}
          onSaved={() => { setDisposeTarget(null); refetch() }}
        />
      )}

      {checkoutTarget && (
        <CheckoutDialog
          asset={checkoutTarget}
          onClose={() => setCheckoutTarget(null)}
          onDone={(msg) => { setCheckoutTarget(null); setToast(msg); refetch(); setTimeout(() => setToast(''), 4000) }}
        />
      )}

      {checkinTarget && (
        <CheckinDialog
          asset={checkinTarget}
          onClose={() => setCheckinTarget(null)}
          onDone={(msg) => { setCheckinTarget(null); setToast(msg); refetch(); setTimeout(() => setToast(''), 4000) }}
        />
      )}
    </div>
  )
}
