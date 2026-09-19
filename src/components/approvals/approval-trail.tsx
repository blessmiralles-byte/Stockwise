import { CheckCircle2, Clock, CornerRightUp, ShieldCheck, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface TrailStep {
  step_no: number
  status: string
  is_override: boolean
  note: string | null
  created_at: string
  acted_at: string | null
  approver: { id: string; name: string; job_title: string | null } | null
  acted_by: { id: string; name: string; job_title: string | null } | null
}

function who(p: TrailStep['approver']) {
  if (!p) return 'Unknown'
  return p.job_title ? `${p.name} (${p.job_title})` : p.name
}

function when(d: string | null) {
  if (!d) return ''
  return new Date(d).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

/** Who endorsed, approved or rejected, in order — plus who it's waiting on. */
export function ApprovalTrail({ steps, className }: { steps: TrailStep[]; className?: string }) {
  if (!steps?.length) return null
  return (
    <ol className={cn('space-y-1.5', className)}>
      {steps.map(s => {
        const actor = s.acted_by ?? s.approver
        let icon = <Clock className="w-3.5 h-3.5 text-amber-500" />
        let text: React.ReactNode = <>Waiting on <span className="font-medium text-slate-700">{who(s.approver)}</span></>
        if (s.status === 'endorsed') {
          icon = <CornerRightUp className="w-3.5 h-3.5 text-indigo-500" />
          text = <>Endorsed by <span className="font-medium text-slate-700">{who(actor)}</span></>
        } else if (s.status === 'approved') {
          icon = s.is_override
            ? <ShieldCheck className="w-3.5 h-3.5 text-violet-600" />
            : <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
          text = <>
            Approved by <span className="font-medium text-slate-700">{who(actor)}</span>
            {s.is_override && <span className="text-violet-600"> · owner override</span>}
          </>
        } else if (s.status === 'rejected') {
          icon = <XCircle className="w-3.5 h-3.5 text-red-500" />
          text = <>
            Rejected by <span className="font-medium text-slate-700">{who(actor)}</span>
            {s.is_override && <span className="text-violet-600"> · owner override</span>}
          </>
        }
        return (
          <li key={s.step_no} className="flex items-start gap-2 text-xs text-slate-500">
            <span className="mt-0.5 flex-shrink-0">{icon}</span>
            <span className="flex-1">
              {text}
              {s.acted_at && <span className="text-slate-400"> · {when(s.acted_at)}</span>}
              {s.note && <span className="block text-slate-500 italic">“{s.note}”</span>}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

/** Button label for the viewer's action on a pending document. */
export function approveLabel(myAction: string | null | undefined): string {
  if (myAction === 'endorse')  return 'Endorse'
  if (myAction === 'override') return 'Approve (owner)'
  return 'Approve'
}
