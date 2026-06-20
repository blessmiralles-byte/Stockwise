'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Topbar } from '@/components/layout/topbar'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useApi } from '@/lib/use-api'
import { Settings, Bell, Shield, Key, Send, CheckCircle2, AlertCircle, Loader2,
  ToggleLeft, ToggleRight, Briefcase, CalendarRange, Plus, X, Lock, Unlock,
  UserPlus, Building2, CreditCard, Zap, ExternalLink, Star } from 'lucide-react'
import { PLAN_CONFIG, type PlanKey } from '@/lib/stripe-config'

// ── Types ─────────────────────────────────────────────────────────────────────
type Role = 'owner' | 'procurement' | 'operations' | 'receiver' | 'finance' | 'viewer'
           | 'admin' | 'manager'  // legacy aliases

type UserProfile = {
  id: string; full_name: string; email: string; role: Role
  is_active: boolean; created_at: string
}

// SOD role definitions — shown in the legend and role selector
const ROLE_CFG: Record<string, { label: string; variant: any; description: string; sodNote?: string }> = {
  owner: {
    label: 'Owner',
    variant: 'default',
    description: 'Full access — manage users, assign roles, approve everything',
  },
  procurement: {
    label: 'Procurement',
    variant: 'secondary',
    description: 'Create & send purchase orders, manage suppliers, view forecasting',
    sodNote: '⚠ Cannot receive goods (SOD)',
  },
  operations: {
    label: 'Operations',
    variant: 'secondary',
    description: 'Manage stock counts, approve adjustments, record transactions',
    sodNote: '⚠ Cannot create POs (SOD)',
  },
  receiver: {
    label: 'Receiver',
    variant: 'outline',
    description: 'Scan / input goods receipts (GRN), record deliveries',
    sodNote: '⚠ Cannot create POs or approve adjustments (SOD)',
  },
  finance: {
    label: 'Finance / AP',
    variant: 'outline',
    description: 'View valuation report, inventory ledger, PO matching — read-only',
  },
  viewer: {
    label: 'Viewer',
    variant: 'outline',
    description: 'Read-only access to all pages',
  },
  // Legacy aliases
  admin:   { label: 'Owner',      variant: 'default',   description: 'Full access (legacy: admin)' },
  manager: { label: 'Operations', variant: 'secondary', description: 'Operations access (legacy: manager)' },
}

const SOD_ROLES: Role[] = ['owner', 'procurement', 'operations', 'receiver', 'finance', 'viewer']

// ── Invite User form ──────────────────────────────────────────────────────────
function InviteUserForm({ onSuccess }: { onSuccess: () => void }) {
  const [open,     setOpen]     = useState(false)
  const [email,    setEmail]    = useState('')
  const [name,     setName]     = useState('')
  const [role,     setRole]     = useState<Role>('viewer')
  const [loading,  setLoading]  = useState(false)
  const [result,   setResult]   = useState<{ ok: boolean; msg: string } | null>(null)

  const send = async () => {
    if (!email.trim()) return
    setLoading(true); setResult(null)
    const res  = await fetch('/api/users/invite', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email: email.trim(), role, full_name: name.trim() || undefined }),
    })
    const json = await res.json()
    setLoading(false)
    if (res.ok) {
      setResult({ ok: true, msg: json.message ?? `Invitation sent to ${email}` })
      setEmail(''); setName(''); setRole('viewer')
      onSuccess()
    } else {
      setResult({ ok: false, msg: json.error ?? 'Failed to send invite' })
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg border border-indigo-200 text-indigo-600 text-sm font-semibold hover:bg-indigo-50 transition-colors">
        <UserPlus className="w-4 h-4" />
        Invite Team Member
      </button>
    )
  }

  return (
    <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between mb-1">
        <p className="text-sm font-semibold text-slate-800 flex items-center gap-2">
          <UserPlus className="w-4 h-4 text-indigo-600" />
          Invite Team Member
        </p>
        <button onClick={() => { setOpen(false); setResult(null) }}
          className="text-slate-400 hover:text-slate-600">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2">
          <label className="text-xs font-medium text-slate-600 block mb-1">Email *</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="colleague@company.com"
            className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1">Full Name (optional)</label>
          <input type="text" value={name} onChange={e => setName(e.target.value)}
            placeholder="Jane Smith"
            className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1">Role</label>
          <select value={role} onChange={e => setRole(e.target.value as Role)}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
            {SOD_ROLES.map(r => (
              <option key={r} value={r}>{ROLE_CFG[r]?.label ?? r}</option>
            ))}
          </select>
        </div>
      </div>

      {result && (
        <div className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg border ${
          result.ok
            ? 'bg-green-50 text-green-700 border-green-100'
            : 'bg-red-50 text-red-700 border-red-100'
        }`}>
          {result.ok
            ? <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
            : <AlertCircle   className="w-3.5 h-3.5 flex-shrink-0" />
          }
          {result.msg}
        </div>
      )}

      <div className="flex justify-end">
        <button onClick={send} disabled={loading || !email.trim()}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors">
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          Send Invite
        </button>
      </div>
    </div>
  )
}

// ── User Management section ────────────────────────────────────────────────────
function UserManagementSection({ currentUserId }: { currentUserId: string }) {
  const { data, loading, error, refetch } = useApi<{ data: UserProfile[] }>('/api/users')
  const users = data?.data ?? []
  const [saving, setSaving] = useState<string | null>(null)

  async function changeRole(userId: string, role: Role) {
    setSaving(userId)
    await fetch(`/api/users/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    })
    setSaving(null); refetch()
  }

  async function toggleActive(u: UserProfile) {
    setSaving(u.id)
    await fetch(`/api/users/${u.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !u.is_active }),
    })
    setSaving(null); refetch()
  }

  return (
    <div className="space-y-4">
      {error && <p className="text-red-500 text-sm">{error}</p>}

      {/* Invite */}
      <InviteUserForm onSuccess={refetch} />

      {/* SOD notice */}
      <div className="bg-amber-50 border border-amber-100 rounded-lg px-4 py-3 text-xs text-amber-800 space-y-1">
        <p className="font-semibold">Segregation of Duties is enforced</p>
        <p>The person who creates a purchase order cannot also receive the goods. The person who counts stock cannot approve the adjustment. These controls are enforced at the API level and cannot be bypassed.</p>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div>{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-16 border-b border-slate-50 animate-pulse bg-slate-50/50" />)}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase">User</th>
                    <th className="text-center px-4 py-3 font-semibold text-slate-600 text-xs uppercase">Role</th>
                    <th className="text-center px-4 py-3 font-semibold text-slate-600 text-xs uppercase">Status</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => {
                    const isSelf = u.id === currentUserId
                    const isBusy = saving === u.id
                    const rb = ROLE_CFG[u.role] ?? ROLE_CFG.viewer
                    return (
                      <tr key={u.id} className={`border-b border-slate-50 ${!u.is_active ? 'opacity-50' : ''}`}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-semibold text-xs flex-shrink-0">
                              {(u.full_name || u.email || '?').slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-medium text-slate-900 text-xs">
                                {u.full_name || <span className="text-slate-400 italic">No name</span>}
                                {isSelf && <span className="ml-1 text-indigo-400">(you)</span>}
                              </p>
                              <p className="text-xs text-slate-400">{u.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {isSelf ? (
                            <Badge variant={rb.variant}>{rb.label}</Badge>
                          ) : (
                            <select
                              value={u.role}
                              onChange={e => changeRole(u.id, e.target.value as Role)}
                              disabled={isBusy}
                              className="border border-slate-200 rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                            >
                              {SOD_ROLES.map(r => (
                                <option key={r} value={r}>{ROLE_CFG[r]?.label ?? r}</option>
                              ))}
                            </select>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => !isSelf && toggleActive(u)}
                            disabled={isSelf || isBusy}
                            className={`inline-flex items-center gap-1 text-xs font-medium transition-colors ${
                              isSelf ? 'opacity-40 cursor-not-allowed' :
                              u.is_active ? 'text-green-600 hover:text-red-500' : 'text-slate-400 hover:text-green-600'
                            }`}
                          >
                            {u.is_active
                              ? <><ToggleRight className="w-4 h-4" /> Active</>
                              : <><ToggleLeft className="w-4 h-4" /> Inactive</>
                            }
                          </button>
                        </td>
                        <td className="px-2 text-center">
                          {isBusy && <div className="w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin inline-block" />}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Role legend */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Role Permissions</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0 space-y-3">
          {SOD_ROLES.map(role => {
            const cfg = ROLE_CFG[role]
            return (
              <div key={role} className="flex items-start gap-3">
                <Badge variant={cfg.variant} className="w-24 justify-center flex-shrink-0 mt-0.5 text-xs">{cfg.label}</Badge>
                <div>
                  <p className="text-xs text-slate-600">{cfg.description}</p>
                  {cfg.sodNote && <p className="text-xs text-amber-600 mt-0.5">{cfg.sodNote}</p>}
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>
    </div>
  )
}

// ── Cost Centers section ───────────────────────────────────────────────────────
function CostCentersSection() {
  const { data, loading, refetch } = useApi<{ data: any[] }>('/api/cost-centers')
  const centers = data?.data ?? []
  const [code, setCode]   = useState('')
  const [name, setName]   = useState('')
  const [saving, setSave] = useState(false)
  const [err, setErr]     = useState('')

  const add = async () => {
    if (!code.trim() || !name.trim()) { setErr('Code and name are required'); return }
    setSave(true); setErr('')
    const res = await fetch('/api/cost-centers', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: code.trim(), name: name.trim() }),
    })
    const json = await res.json()
    if (!res.ok) { setErr(json.error ?? 'Failed'); setSave(false); return }
    setCode(''); setName('')
    setSave(false); refetch()
  }

  const toggle = async (c: any) => {
    await fetch(`/api/cost-centers/${c.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !c.is_active }),
    })
    refetch()
  }

  return (
    <div className="space-y-4">
      {/* Add form */}
      <div className="flex gap-2">
        <input value={code} onChange={e => setCode(e.target.value.toUpperCase())}
          placeholder="CODE" maxLength={10}
          className="w-24 px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono" />
        <input value={name} onChange={e => setName(e.target.value)}
          placeholder="Cost center name"
          className="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        <button onClick={add} disabled={saving}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          Add
        </button>
      </div>
      {err && <p className="text-xs text-red-600">{err}</p>}

      {/* List */}
      {loading ? <div className="h-24 animate-pulse bg-slate-50 rounded-lg" /> : (
        <div className="space-y-1.5">
          {centers.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-6 border border-dashed rounded-lg">No cost centers yet</p>
          )}
          {centers.map((c: any) => (
            <div key={c.id} className="flex items-center gap-3 px-3 py-2.5 bg-slate-50 rounded-lg border border-slate-100">
              <span className="text-xs font-mono font-semibold text-indigo-700 w-16 flex-shrink-0">{c.code}</span>
              <span className="text-sm text-slate-800 flex-1">{c.name}</span>
              <button onClick={() => toggle(c)}
                className={`text-xs px-2 py-0.5 rounded-full font-medium transition-colors ${c.is_active ? 'bg-green-100 text-green-700 hover:bg-red-50 hover:text-red-600' : 'bg-slate-200 text-slate-500 hover:bg-green-50 hover:text-green-700'}`}>
                {c.is_active ? 'Active' : 'Inactive'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Accounting Periods section ─────────────────────────────────────────────────
function AccountingPeriodsSection() {
  const { data, loading, refetch } = useApi<{ data: any[] }>('/api/periods')
  const periods = data?.data ?? []
  const [pName, setPName]         = useState('')
  const [pStart, setPStart]       = useState('')
  const [pEnd, setPEnd]           = useState('')
  const [saving, setSave]         = useState(false)
  const [err, setErr]             = useState('')
  const [closing, setClosing]     = useState<string | null>(null)

  const add = async () => {
    if (!pName.trim() || !pStart || !pEnd) { setErr('Name, start, and end are required'); return }
    setSave(true); setErr('')
    const res = await fetch('/api/periods', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: pName.trim(), period_start: pStart, period_end: pEnd }),
    })
    const json = await res.json()
    if (!res.ok) { setErr(json.error ?? 'Failed'); setSave(false); return }
    setPName(''); setPStart(''); setPEnd('')
    setSave(false); refetch()
  }

  const close = async (id: string) => {
    setClosing(id)
    await fetch(`/api/periods/${id}/close`, { method: 'POST', headers: { 'Content-Type': 'application/json' } })
    setClosing(null); refetch()
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2.5">
        <span className="font-semibold text-amber-800">Closing a period is irreversible.</span>{' '}
        No inventory transactions will be accepted for dates within a closed period.
      </p>

      {/* Add form */}
      <div className="space-y-2">
        <input value={pName} onChange={e => setPName(e.target.value)}
          placeholder="Period name (e.g. May 2026)"
          className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="text-xs text-slate-500 mb-1 block">Start</label>
            <input type="date" value={pStart} onChange={e => setPStart(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div className="flex-1">
            <label className="text-xs text-slate-500 mb-1 block">End</label>
            <input type="date" value={pEnd} onChange={e => setPEnd(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div className="flex items-end">
            <button onClick={add} disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Create
            </button>
          </div>
        </div>
      </div>
      {err && <p className="text-xs text-red-600">{err}</p>}

      {/* List */}
      {loading ? <div className="h-24 animate-pulse bg-slate-50 rounded-lg" /> : (
        <div className="space-y-1.5">
          {periods.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-6 border border-dashed rounded-lg">No accounting periods defined</p>
          )}
          {periods.map((p: any) => (
            <div key={p.id} className="flex items-center gap-3 px-3 py-2.5 bg-slate-50 rounded-lg border border-slate-100">
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-800">{p.name}</p>
                <p className="text-xs text-slate-400 font-mono">{p.period_start} → {p.period_end}</p>
              </div>
              {p.status === 'closed' ? (
                <span className="flex items-center gap-1 text-xs text-slate-500 bg-slate-200 px-2 py-0.5 rounded-full">
                  <Lock className="w-3 h-3" /> Closed
                </span>
              ) : (
                <button onClick={() => close(p.id)} disabled={closing === p.id}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-amber-200 text-amber-700 bg-amber-50 hover:bg-amber-100 font-semibold transition-colors">
                  {closing === p.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Lock className="w-3 h-3" />}
                  Close Period
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Billing section ────────────────────────────────────────────────────────────
function BillingSection() {
  const { data: orgData, loading } = useApi<{ data: any }>('/api/org')
  const org = orgData?.data
  const [upgrading, setUpgrading] = useState<string | null>(null)
  const [portalLoading, setPortalLoading] = useState(false)
  const [billingError, setBillingError] = useState('')
  const [highlightPlan, setHighlightPlan] = useState<string | null>(null)
  const highlightRef = useRef<HTMLDivElement | null>(null)

  // Pre-highlight the plan the visitor chose on the marketing site. The landing
  // pricing CTAs pass ?plan=, register stashes it, and we surface it here so the
  // intent isn't lost across the trial signup.
  useEffect(() => {
    const intended = localStorage.getItem('stockwise.intended_plan')
    if (intended === 'starter' || intended === 'pro') {
      setHighlightPlan(intended)
      localStorage.removeItem('stockwise.intended_plan')
    }
  }, [])

  // Scroll the highlighted card into view once the billing cards have rendered.
  useEffect(() => {
    if (highlightPlan && highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [highlightPlan, loading])

  const checkout = async (plan: string) => {
    setUpgrading(plan); setBillingError('')
    const res  = await fetch('/api/billing/checkout', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ plan }),
    })
    const json = await res.json()
    setUpgrading(null)
    if (!res.ok) { setBillingError(json.error ?? 'Failed to start checkout'); return }
    window.location.href = json.url
  }

  const openPortal = async () => {
    setPortalLoading(true); setBillingError('')
    const res  = await fetch('/api/billing/portal', { method: 'POST' })
    const json = await res.json()
    setPortalLoading(false)
    if (!res.ok) { setBillingError(json.error ?? 'Failed to open billing portal'); return }
    window.location.href = json.url
  }

  const currentPlan = (org?.plan ?? 'trial') as PlanKey
  const planStatus  = org?.plan_status ?? 'active'

  const statusBadge = planStatus === 'active'   ? 'bg-green-100 text-green-700'
                    : planStatus === 'past_due'  ? 'bg-amber-100 text-amber-700'
                    : 'bg-slate-100 text-slate-500'

  return (
    <Section icon={CreditCard} title="Billing & Plan" description="Manage your subscription and payment method">
      <div className="space-y-6">
        {loading ? (
          <div className="h-16 animate-pulse bg-slate-100 rounded-lg" />
        ) : (
          <>
            {/* Current plan card */}
            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
              <div>
                <p className="text-sm font-semibold text-slate-800">
                  {PLAN_CONFIG[currentPlan]?.label ?? currentPlan}
                  <span className={`ml-2 text-xs px-2 py-0.5 rounded-full font-medium ${statusBadge}`}>
                    {planStatus === 'active' ? 'Active' : planStatus === 'past_due' ? 'Past Due' : 'Cancelled'}
                  </span>
                </p>
                {currentPlan === 'trial' && org?.trial_ends_at && (
                  <p className="text-xs text-amber-600 mt-0.5">
                    Trial ends {new Date(org.trial_ends_at).toLocaleDateString()}
                  </p>
                )}
                <p className="text-xs text-slate-500 mt-0.5">
                  {org?.max_users} user seats
                </p>
              </div>
              {org?.stripe_customer_id && (
                <button onClick={openPortal} disabled={portalLoading}
                  className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 font-medium transition-colors">
                  {portalLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ExternalLink className="w-3.5 h-3.5" />}
                  Manage Billing
                </button>
              )}
            </div>

            {billingError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" /> {billingError}
              </p>
            )}

            {/* Upgrade cards — show for trial or starter */}
            {(currentPlan === 'trial' || currentPlan === 'starter') && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {(['starter', 'pro'] as const).map(plan => {
                  const cfg       = PLAN_CONFIG[plan]
                  const isCurrent = currentPlan === plan
                  const isPro     = plan === 'pro'
                  return (
                    <div
                      key={plan}
                      ref={plan === highlightPlan ? highlightRef : undefined}
                      className={`rounded-xl border p-4 space-y-3 relative transition-shadow ${
                        plan === highlightPlan ? 'ring-2 ring-indigo-400 ring-offset-2' : ''
                      } ${isPro ? 'border-indigo-200 bg-indigo-50' : 'border-slate-200 bg-white'}`}
                    >
                      {isPro && (
                        <span className="absolute -top-2 left-4 bg-indigo-600 text-white text-xs font-semibold px-2 py-0.5 rounded-full flex items-center gap-1">
                          <Star className="w-2.5 h-2.5" /> Most Popular
                        </span>
                      )}
                      <div>
                        <p className="font-semibold text-slate-900">{cfg.label}</p>
                        <p className="text-2xl font-bold text-slate-900 mt-1">
                          ${cfg.price}<span className="text-sm font-normal text-slate-500">/mo</span>
                        </p>
                      </div>
                      <ul className="space-y-1.5">
                        {cfg.features.map(f => (
                          <li key={f} className="flex items-center gap-2 text-xs text-slate-600">
                            <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                            {f}
                          </li>
                        ))}
                      </ul>
                      <button
                        onClick={() => !isCurrent && checkout(plan)}
                        disabled={isCurrent || !!upgrading}
                        className={`w-full py-2 rounded-lg text-sm font-semibold transition-colors ${
                          isCurrent
                            ? 'bg-slate-100 text-slate-400 cursor-default'
                            : isPro
                            ? 'bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50'
                            : 'bg-slate-800 text-white hover:bg-slate-900 disabled:opacity-50'
                        }`}
                      >
                        {upgrading === plan
                          ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Redirecting…</span>
                          : isCurrent ? 'Current Plan'
                          : <span className="flex items-center justify-center gap-2"><Zap className="w-3.5 h-3.5" />Upgrade to {cfg.label}</span>
                        }
                      </button>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Enterprise CTA */}
            {currentPlan !== 'enterprise' && (
              <p className="text-xs text-center text-slate-400">
                Need more than 20 users?{' '}
                <a href="mailto:hello@stockwise.app" className="text-indigo-600 hover:underline font-medium">
                  Contact us for Enterprise pricing
                </a>
              </p>
            )}
          </>
        )}
      </div>
    </Section>
  )
}

// ── Organization Settings section ─────────────────────────────────────────────
function OrgSettingsSection({ isAdmin }: { isAdmin: boolean }) {
  const { data, loading } = useApi<{ data: any }>('/api/org')
  const [orgName,  setOrgName]  = useState('')
  const [saving,   setSaving]   = useState(false)
  const [saved,    setSaved]    = useState(false)
  const [orgError, setOrgError] = useState('')

  // Populate once data loads
  const serverName = data?.data?.name ?? ''
  const displayName = orgName !== '' ? orgName : serverName

  const saveOrg = async () => {
    const name = displayName.trim()
    if (!name || name.length < 2) { setOrgError('Name must be at least 2 characters'); return }
    setSaving(true); setOrgError(''); setSaved(false)
    const res  = await fetch('/api/org', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name }),
    })
    const json = await res.json()
    setSaving(false)
    if (!res.ok) { setOrgError(json.error ?? 'Failed to save'); return }
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  return (
    <Section icon={Building2} title="Organization" description="Your workspace name shown in reports and team invites">
      <div className="space-y-4">
        {loading ? (
          <div className="h-10 animate-pulse bg-slate-100 rounded-lg" />
        ) : (
          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1">Organization Name</label>
            <Input
              value={displayName}
              onChange={e => setOrgName(e.target.value)}
              disabled={!isAdmin}
              maxLength={100}
              placeholder="Your company name"
            />
            {orgError && <p className="text-xs text-red-600 mt-1">{orgError}</p>}
          </div>
        )}

        {data?.data && (
          <div className="text-xs text-slate-400 space-y-0.5">
            <p>Plan: <span className="font-medium text-slate-600 capitalize">{data.data.plan}</span>
              {data.data.plan === 'trial' && data.data.trial_ends_at && (
                <span className="ml-2 text-amber-600">
                  · Trial ends {new Date(data.data.trial_ends_at).toLocaleDateString()}
                </span>
              )}
            </p>
            <p>Max users: <span className="font-medium text-slate-600">{data.data.max_users}</span></p>
          </div>
        )}

        {isAdmin && (
          <Button size="sm" onClick={saveOrg} disabled={saving || loading} className="gap-2">
            {saving
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Saving…</>
              : saved
              ? <><CheckCircle2 className="w-3.5 h-3.5 text-green-500" />Saved!</>
              : 'Save Changes'
            }
          </Button>
        )}
      </div>
    </Section>
  )
}

function Section({ icon: Icon, title, description, children }: any) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
            <Icon className="w-4 h-4 text-indigo-600" />
          </div>
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            {description && <CardDescription className="text-xs mt-0">{description}</CardDescription>}
          </div>
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

// Thin alias map for the "Your Account" badge
const roleConfig: Record<string, { variant: any; label: string }> = Object.fromEntries(
  Object.entries(ROLE_CFG).map(([k, v]) => [k, { variant: v.variant, label: v.label }])
)

function SettingsInner() {
  const searchParams = useSearchParams()
  const tabParam = searchParams.get('tab')
  const [activeTab, setActiveTab] = useState(
    ['users', 'billing', 'costcenters', 'periods'].includes(tabParam ?? '') ? tabParam! : 'general'
  )

  const { data: profile } = useApi<any>('/api/user/profile')
  const isAdmin = profile?.role === 'owner' || profile?.role === 'admin'

  // Notification send state
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState<{ ok: boolean; message: string } | null>(null)

  const sendTestNotification = async () => {
    setSending(true)
    setSendResult(null)
    try {
      const res = await fetch('/api/notifications/maintenance', { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        setSendResult({
          ok: true,
          message: data.sent
            ? `Sent! ${data.alerts} alert${data.alerts !== 1 ? 's' : ''} emailed to ${data.to}`
            : `Nothing to send — ${data.reason}`,
        })
      } else {
        setSendResult({ ok: false, message: data.error ?? 'Failed to send' })
      }
    } catch (e: any) {
      setSendResult({ ok: false, message: e.message })
    } finally {
      setSending(false)
    }
  }

  const isFinance = isAdmin || profile?.role === 'finance' || profile?.role === 'procurement'

  const tabs = [
    { id: 'general',      label: 'General',          icon: Settings      },
    ...(isAdmin   ? [{ id: 'users',       label: 'Team',             icon: Shield        }] : []),
    ...(isAdmin   ? [{ id: 'billing',     label: 'Billing',          icon: CreditCard    }] : []),
    ...(isFinance ? [{ id: 'costcenters', label: 'Cost Centers',     icon: Briefcase     }] : []),
    ...(isFinance ? [{ id: 'periods',     label: 'Acct. Periods',    icon: CalendarRange }] : []),
  ]

  const checkoutStatus = searchParams.get('checkout')

  return (
    <div>
      <Topbar title="Settings" />
      <div className="p-6 max-w-2xl">

        {/* Checkout result banners */}
        {checkoutStatus === 'success' && (
          <div className="flex items-center gap-3 mb-5 px-4 py-3 bg-green-50 border border-green-100 rounded-xl text-sm text-green-700">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
            <div>
              <p className="font-semibold">Subscription activated!</p>
              <p className="text-xs text-green-600 mt-0.5">Your plan has been upgraded. Changes take effect immediately.</p>
            </div>
          </div>
        )}
        {checkoutStatus === 'cancelled' && (
          <div className="flex items-center gap-3 mb-5 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-600">
            <AlertCircle className="w-5 h-5 flex-shrink-0 text-slate-400" />
            Checkout cancelled — your plan was not changed.
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mb-6 border-b border-slate-100">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                activeTab === t.id
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <t.icon className="w-4 h-4" />
              {t.label}
            </button>
          ))}
        </div>

        {/* User Management tab — owner only */}
        {activeTab === 'users' && isAdmin && (
          <UserManagementSection currentUserId={profile?.id ?? ''} />
        )}

        {/* Billing tab — owner only */}
        {activeTab === 'billing' && isAdmin && (
          <BillingSection />
        )}

        {/* Cost Centers tab */}
        {activeTab === 'costcenters' && isFinance && (
          <Section icon={Briefcase} title="Cost Centers" description="Define cost centers for expense tracking and reporting">
            <CostCentersSection />
          </Section>
        )}

        {/* Accounting Periods tab */}
        {activeTab === 'periods' && isFinance && (
          <Section icon={CalendarRange} title="Accounting Periods" description="Create and close accounting periods to enforce cut-off controls">
            <AccountingPeriodsSection />
          </Section>
        )}

        {/* General tab */}
        {activeTab === 'general' && <div className="space-y-5">

        {/* General */}
        <OrgSettingsSection isAdmin={isAdmin} />

        {/* Notifications */}
        <Section
          icon={Bell}
          title="Maintenance Notifications"
          description="Sends email alerts for overdue and upcoming maintenance"
        >
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1">Notification Email</label>
              <Input
                type="email"
                placeholder="admin@company.com"
                defaultValue={process.env.NEXT_PUBLIC_NOTIFICATION_EMAIL ?? ''}
                disabled={!isAdmin}
              />
              <p className="text-xs text-slate-400 mt-1">
                Set <code className="bg-slate-100 px-1 rounded">NOTIFICATION_EMAIL</code> in your <code className="bg-slate-100 px-1 rounded">.env.local</code>
              </p>
            </div>

            <div className="flex items-center gap-3">
              <Button
                size="sm"
                variant="outline"
                className="gap-2"
                onClick={sendTestNotification}
                disabled={sending || !isAdmin}
              >
                {sending
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Sending…</>
                  : <><Send className="w-3.5 h-3.5" />Send Now</>
                }
              </Button>
              <p className="text-xs text-slate-400">Checks all overdue + due-soon schedules and emails</p>
            </div>

            {sendResult && (
              <div className={`flex items-start gap-2 text-sm px-3 py-2.5 rounded-lg border ${
                sendResult.ok
                  ? 'bg-green-50 text-green-700 border-green-100'
                  : 'bg-red-50 text-red-700 border-red-100'
              }`}>
                {sendResult.ok
                  ? <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  : <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                }
                {sendResult.message}
              </div>
            )}

            <div className="bg-slate-50 rounded-lg p-3 text-xs text-slate-500 space-y-1">
              <p className="font-medium text-slate-700">To automate daily emails:</p>
              <p>Call <code className="bg-white px-1 rounded border">POST /api/notifications/maintenance</code> from a cron job with:</p>
              <code className="block bg-white p-2 rounded border font-mono">
                Authorization: Bearer {'{POS_API_KEY}'}
              </code>
            </div>
          </div>
        </Section>

        {/* POS Integration */}
        <Section
          icon={Key}
          title="POS Integration"
          description="API key for connecting an external point-of-sale system"
        >
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1">API Key</label>
              <Input defaultValue="••••••••••••••••" type="password" disabled />
            </div>
            <div className="bg-slate-50 rounded-lg p-3 text-xs text-slate-500 space-y-1.5">
              <p><span className="font-medium">Endpoint:</span> <code className="bg-white px-1 rounded border">POST /api/pos/sale</code></p>
              <p><span className="font-medium">Auth:</span> <code className="bg-white px-1 rounded border">Authorization: Bearer {'{POS_API_KEY}'}</code></p>
              <p><span className="font-medium">Set in:</span> <code className="bg-white px-1 rounded border">.env.local → POS_API_KEY</code></p>
            </div>
            {isAdmin && <Button variant="outline" size="sm">Regenerate Key</Button>}
          </div>
        </Section>

        {/* User info */}
        <Section icon={Shield} title="Your Account">
          <div className="flex items-center gap-4 p-3 bg-slate-50 rounded-lg">
            <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold">
              {profile?.full_name?.[0]?.toUpperCase() ?? '?'}
            </div>
            <div>
              <p className="font-medium text-slate-900">{profile?.full_name}</p>
              <p className="text-sm text-slate-500">{profile?.email}</p>
            </div>
            <Badge variant={roleConfig[profile?.role ?? 'viewer']?.variant}>
              {roleConfig[profile?.role ?? 'viewer']?.label}
            </Badge>
          </div>
          {isAdmin && (
            <p className="text-xs text-indigo-600 mt-3 cursor-pointer hover:underline" onClick={() => setActiveTab('users')}>
              → Manage all users
            </p>
          )}
        </Section>

        </div>}  {/* end general tab */}

      </div>
    </div>
  )
}

export default function SettingsPage() {
  return (
    <Suspense>
      <SettingsInner />
    </Suspense>
  )
}
