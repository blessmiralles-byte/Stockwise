'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, Search, LogOut, Settings, ChevronDown, Shield, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import Link from 'next/link'

const roleBadge: Record<string, { label: string; variant: any }> = {
  owner:       { label: 'Owner',       variant: 'default'   },
  admin:       { label: 'Owner',       variant: 'default'   },
  procurement: { label: 'Procurement', variant: 'secondary' },
  operations:  { label: 'Operations',  variant: 'secondary' },
  receiver:    { label: 'Receiver',    variant: 'outline'   },
  finance:     { label: 'Finance',     variant: 'outline'   },
  manager:     { label: 'Operations',  variant: 'secondary' },
  viewer:      { label: 'Viewer',      variant: 'outline'   },
}

interface Notification {
  id:          string
  type:        string
  title:       string
  body?:       string
  action_url?: string
  read_at?:    string
  created_at:  string
}

interface TopbarProps { title: string }

const TYPE_ICON: Record<string, string> = {
  'requisition.approve': '✅',
  'requisition.reject':  '❌',
  'stock.low':           '⚠️',
  'maintenance.overdue': '🔧',
  'po.received':         '📦',
}

function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 60_000)    return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

// ── Notification Panel ────────────────────────────────────────────────────────
function NotificationPanel({ onClose, onRead }: { onClose: () => void; onRead: () => void }) {
  const [notifs, setNotifs]   = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch('/api/notifications?limit=20')
      const json = await res.json()
      setNotifs(json.data ?? [])
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const markOne = async (id: string) => {
    await fetch(`/api/notifications/${id}/read`, { method: 'POST' })
    setNotifs(prev => prev.map(n => n.id === id ? { ...n, read_at: new Date().toISOString() } : n))
    onRead()
  }

  const markAll = async () => {
    await fetch('/api/notifications', { method: 'PATCH' })
    const now = new Date().toISOString()
    setNotifs(prev => prev.map(n => ({ ...n, read_at: n.read_at ?? now })))
    onRead()
  }

  const handleClick = async (n: Notification) => {
    if (!n.read_at) await markOne(n.id)
    if (n.action_url) { router.push(n.action_url); onClose() }
  }

  const unread = notifs.filter(n => !n.read_at).length

  return (
    <div className="absolute right-0 top-full mt-1 w-80 bg-white rounded-xl border border-slate-200 shadow-xl z-50 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-900">Notifications</span>
          {unread > 0 && (
            <span className="text-[11px] bg-red-500 text-white px-1.5 py-0.5 rounded-full font-bold leading-none">{unread}</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {unread > 0 && (
            <button onClick={markAll}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-medium px-2 py-1 rounded hover:bg-indigo-50 transition-colors">
              Mark all read
            </button>
          )}
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 transition-colors">
            <X className="w-3.5 h-3.5 text-slate-400" />
          </button>
        </div>
      </div>

      <div className="max-h-80 overflow-y-auto">
        {loading ? (
          [1,2,3].map(i => (
            <div key={i} className="px-4 py-3 border-b border-slate-50 animate-pulse">
              <div className="h-3 bg-slate-100 rounded w-3/4 mb-2" />
              <div className="h-2.5 bg-slate-100 rounded w-1/2" />
            </div>
          ))
        ) : notifs.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <Bell className="w-6 h-6 mx-auto mb-2 text-slate-300" />
            <p className="text-sm text-slate-400">No notifications yet</p>
          </div>
        ) : notifs.map(n => (
          <button key={n.id} onClick={() => handleClick(n)}
            className={cn(
              'w-full text-left px-4 py-3 border-b border-slate-50 hover:bg-slate-50/80 transition-colors',
              !n.read_at && 'bg-indigo-50/40'
            )}>
            <div className="flex items-start gap-2.5">
              <span className="text-base flex-shrink-0 mt-0.5">{TYPE_ICON[n.type] ?? '🔔'}</span>
              <div className="flex-1 min-w-0">
                <p className={cn('text-xs leading-snug',
                  !n.read_at ? 'font-semibold text-slate-900' : 'font-medium text-slate-600')}>
                  {n.title}
                </p>
                {n.body && <p className="text-xs text-slate-500 mt-0.5 truncate">{n.body}</p>}
                <p className="text-[11px] text-slate-400 mt-1">{relTime(n.created_at)}</p>
              </div>
              {!n.read_at && <span className="w-2 h-2 rounded-full bg-indigo-500 flex-shrink-0 mt-1.5" />}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Topbar ────────────────────────────────────────────────────────────────────
export function Topbar({ title }: TopbarProps) {
  const router = useRouter()
  const [profile, setProfile]           = useState<{ full_name: string; email: string; role: string } | null>(null)
  const [menuOpen, setMenuOpen]         = useState(false)
  const [bellOpen, setBellOpen]         = useState(false)
  const [unreadCount, setUnreadCount]   = useState(0)
  const menuRef = useRef<HTMLDivElement>(null)
  const bellRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/user/profile').then(r => r.ok ? r.json() : null).then(d => { if (d) setProfile(d) })
  }, [])

  const fetchUnread = useCallback(() => {
    fetch('/api/notifications?unread=true&limit=1')
      .then(r => r.json())
      .then(j => setUnreadCount(j.unread_count ?? 0))
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetchUnread()
    const t = setInterval(fetchUnread, 60_000)
    return () => clearInterval(t)
  }, [fetchUnread])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) setBellOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const initials = profile?.full_name
    ? profile.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : '?'
  const rb = roleBadge[profile?.role ?? 'viewer'] ?? { label: 'Viewer', variant: 'outline' }

  return (
    <header className="h-14 border-b border-slate-100 bg-white flex items-center justify-between px-6 sticky top-0 z-10">
      <h1 className="text-[17px] font-semibold text-slate-900 tracking-tight">{title}</h1>

      <div className="flex items-center gap-2">
        <div className="relative hidden md:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input placeholder="Search…" className="pl-9 w-52 h-8 text-[13px]" />
        </div>

        {/* Bell */}
        <div className="relative" ref={bellRef}>
          <Button variant="ghost" size="icon" className="relative w-8 h-8"
            onClick={() => { setBellOpen(o => !o); setMenuOpen(false) }}>
            <Bell className="w-4 h-4 text-slate-500" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 min-w-[14px] h-[14px] bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-0.5">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </Button>
          {bellOpen && (
            <NotificationPanel
              onClose={() => setBellOpen(false)}
              onRead={fetchUnread}
            />
          )}
        </div>

        {/* User menu */}
        <div className="relative" ref={menuRef}>
          <button onClick={() => { setMenuOpen(o => !o); setBellOpen(false) }}
            className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-lg hover:bg-slate-50 transition-colors">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-400 to-violet-500 flex items-center justify-center text-white font-semibold text-xs shadow-sm">
              {initials}
            </div>
            <div className="hidden md:block text-left">
              <p className="text-[13px] font-medium text-slate-800 leading-tight">{profile?.full_name ?? '…'}</p>
              <div className="flex items-center gap-1 mt-0.5">
                <Badge variant={rb.variant} className="text-[10px] px-1.5 py-0 h-4">{rb.label}</Badge>
              </div>
            </div>
            <ChevronDown className={cn('w-3.5 h-3.5 text-slate-400 transition-transform', menuOpen && 'rotate-180')} />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 w-56 bg-white rounded-xl border border-slate-100 shadow-lg py-1 z-50">
              <div className="px-4 py-3 border-b border-slate-50">
                <p className="text-[13px] font-medium text-slate-900 truncate">{profile?.full_name}</p>
                <p className="text-[12px] text-slate-400 truncate mt-0.5">{profile?.email}</p>
              </div>
              <Link href="/settings" onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-slate-700 hover:bg-slate-50 transition-colors">
                <Settings className="w-3.5 h-3.5 text-slate-400" />Settings
              </Link>
              {(profile?.role === 'owner' || profile?.role === 'admin') && (
                <Link href="/settings?tab=users" onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-slate-700 hover:bg-slate-50 transition-colors">
                  <Shield className="w-3.5 h-3.5 text-slate-400" />User management
                </Link>
              )}
              <div className="border-t border-slate-50 mt-1">
                <button onClick={handleLogout}
                  className="flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-red-600 hover:bg-red-50 w-full text-left transition-colors">
                  <LogOut className="w-3.5 h-3.5" />Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
