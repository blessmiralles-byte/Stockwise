'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { UpgradePrompt } from '@/components/billing/upgrade-prompt'
import { API_KEY_SCOPES, SCOPE_INFO, type ApiKeyScope } from '@/lib/api-key-scopes'
import { Key, Copy, Check, Loader2, AlertCircle, ShieldAlert } from 'lucide-react'

interface ApiKeyRow {
  id: string
  name: string
  scope: ApiKeyScope
  key_prefix: string
  created_at: string
  last_used_at: string | null
  revoked_at: string | null
}

function when(iso: string | null): string {
  if (!iso) return 'Never'
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

/**
 * Settings → API keys (owner only). One key per connected system, each tied to
 * this organization and to one kind of integration. The full key is shown once.
 */
export function ApiKeysSection() {
  const [keys,    setKeys]    = useState<ApiKeyRow[]>([])
  const [allowed, setAllowed] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')

  const [name,     setName]     = useState('')
  const [scope,    setScope]    = useState<ApiKeyScope>('pos')
  const [creating, setCreating] = useState(false)
  const [newKey,   setNewKey]   = useState<{ key: string; name: string; scope: ApiKeyScope } | null>(null)
  const [copied,   setCopied]   = useState(false)
  const [revoking, setRevoking] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res  = await fetch('/api/api-keys')
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Could not load API keys'); return }
      setKeys(json.data ?? [])
      setAllowed(json.allowed_scopes ?? {})
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const anyAllowed = API_KEY_SCOPES.some(s => allowed[s])
  // Default the picker to a scope this plan can actually use.
  const scopeOk = allowed[scope]
  const firstAllowed = API_KEY_SCOPES.find(s => allowed[s])

  async function create(e: React.FormEvent) {
    e.preventDefault()
    const useScope = scopeOk ? scope : firstAllowed
    if (!useScope) return
    if (!name.trim()) { setError('Give the key a name, e.g. "Shop till".'); return }
    setCreating(true); setError(''); setNewKey(null); setCopied(false)
    try {
      const res  = await fetch('/api/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), scope: useScope }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Could not create the key'); return }
      setNewKey({ key: json.key, name: json.data.name, scope: json.data.scope })
      setName('')
      await load()
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setCreating(false)
    }
  }

  async function revoke(row: ApiKeyRow) {
    if (!confirm(`Revoke "${row.name}"?\n\nAnything using this key stops working immediately. This can't be undone; you'd create a new key instead.`)) return
    setRevoking(row.id); setError('')
    try {
      const res = await fetch(`/api/api-keys/${row.id}`, { method: 'DELETE' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setError(json.error ?? 'Could not revoke the key'); return }
      if (newKey && row.key_prefix && newKey.key.startsWith(row.key_prefix)) setNewKey(null)
      await load()
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setRevoking(null)
    }
  }

  async function copy() {
    if (!newKey) return
    try { await navigator.clipboard.writeText(newKey.key); setCopied(true) } catch { /* select manually */ }
  }

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
  }

  const active  = keys.filter(k => !k.revoked_at)
  const revoked = keys.filter(k => k.revoked_at)

  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-600">
        Connect a till, your bookkeeping app or JobLedger. Each key works only for this company and
        only for the kind of connection it was made for. Make one key per system, so you can switch
        one off without touching the others.
      </p>

      {!anyAllowed && (
        <div className="space-y-2">
          <UpgradePrompt feature="integrations" compact />
          <UpgradePrompt feature="accounting_sync" compact />
        </div>
      )}

      {newKey && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-2">
          <div className="flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-900">
              <span className="font-semibold">Copy this key now.</span> It won&apos;t be shown again.
              Paste it into {SCOPE_INFO[newKey.scope].label === 'JobLedger' ? 'JobLedger' : 'the other system'} and keep it private, like a password.
            </p>
          </div>
          <div className="flex gap-2">
            <code className="flex-1 min-w-0 break-all rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs font-mono text-slate-800 select-all">
              {newKey.key}
            </code>
            <Button type="button" size="sm" variant="outline" onClick={copy} className="gap-1.5 flex-shrink-0 bg-white">
              {copied ? <><Check className="w-3.5 h-3.5 text-green-600" />Copied</> : <><Copy className="w-3.5 h-3.5" />Copy</>}
            </Button>
          </div>
          <p className="text-xs text-amber-800">
            Send it as <code className="bg-white px-1 rounded border border-amber-200">Authorization: Bearer {newKey.key.slice(0, 18)}…</code> to{' '}
            {SCOPE_INFO[newKey.scope].endpoints.map((ep, i) => (
              <span key={ep}>{i ? ', ' : ''}<code className="bg-white px-1 rounded border border-amber-200">{ep}</code></span>
            ))}.
          </p>
        </div>
      )}

      {anyAllowed && (
        <form onSubmit={create} className="rounded-xl border border-slate-200 p-4 space-y-3">
          <p className="text-sm font-semibold text-slate-800">New key</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Name</label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Shop till, Xero, JobLedger" maxLength={80} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Connects</label>
              <select
                value={scopeOk ? scope : firstAllowed}
                onChange={e => setScope(e.target.value as ApiKeyScope)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
              >
                {API_KEY_SCOPES.map(s => (
                  <option key={s} value={s} disabled={!allowed[s]}>
                    {SCOPE_INFO[s].label}{allowed[s] ? '' : ' (needs a higher plan)'}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p className="text-xs text-slate-500">{SCOPE_INFO[scopeOk ? scope : firstAllowed!].description}</p>
          <Button type="submit" size="sm" disabled={creating} className="gap-2">
            {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Key className="w-3.5 h-3.5" />}
            {creating ? 'Creating…' : 'Create key'}
          </Button>
        </form>
      )}

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}

      <div>
        <p className="text-sm font-semibold text-slate-800 mb-2">Active keys</p>
        {active.length === 0 ? (
          <p className="text-sm text-slate-400">No keys yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {active.map(k => (
              <li key={k.id} className="flex flex-col sm:flex-row sm:items-center gap-2 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">{k.name}</p>
                  <p className="text-xs text-slate-500">
                    {SCOPE_INFO[k.scope]?.label ?? k.scope} · <code className="font-mono">{k.key_prefix}…</code>
                  </p>
                  <p className="text-xs text-slate-400">Created {when(k.created_at)} · Last used {when(k.last_used_at)}</p>
                </div>
                <Button type="button" size="sm" variant="outline" disabled={revoking === k.id}
                  onClick={() => revoke(k)} className="text-red-600 border-red-200 hover:bg-red-50 self-start sm:self-auto">
                  {revoking === k.id ? 'Revoking…' : 'Revoke'}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {revoked.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-slate-500">Revoked keys ({revoked.length})</summary>
          <ul className="mt-2 space-y-1 text-xs text-slate-400">
            {revoked.map(k => (
              <li key={k.id}>
                {k.name} · {SCOPE_INFO[k.scope]?.label ?? k.scope} · <code className="font-mono">{k.key_prefix}…</code> · revoked {when(k.revoked_at)}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
