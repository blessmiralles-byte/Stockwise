-- ============================================================================
-- Approval chain — reporting-line approvals for requisitions and POs
-- ============================================================================
-- A submitted document goes to the submitter's direct manager first (their
-- endorsement), then up the reporting line until someone's approval limit
-- covers the amount. Each step is recorded in approval_steps, which is the
-- approval trail shown on the document and the audit evidence.
--
--   job_title            free-text title shown in the trail ("Buyer",
--                        "Purchasing Officer"); permissions stay role-based
--   current_approver_id  who the document is waiting on right now
--   submitted_by         who submitted the PO for approval (the submitter
--                        can never approve their own document)
--
-- Additive / idempotent — safe to re-run.
-- ============================================================================

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS job_title text;

ALTER TABLE public.requisitions
  ADD COLUMN IF NOT EXISTS current_approver_id uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL;

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS current_approver_id uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS submitted_by        uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.approval_steps (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL,
  doc_type     text NOT NULL CHECK (doc_type IN ('requisition', 'purchase_order')),
  doc_id       uuid NOT NULL,
  step_no      int  NOT NULL,
  -- who the step was routed to
  approver_id  uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  status       text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'endorsed', 'approved', 'rejected', 'cancelled')),
  -- who actually acted (differs from approver_id on an owner override)
  acted_by     uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  is_override  boolean NOT NULL DEFAULT false,
  amount       numeric(15, 2),
  note         text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  acted_at     timestamptz
);

CREATE INDEX IF NOT EXISTS idx_approval_steps_doc      ON public.approval_steps(doc_type, doc_id);
CREATE INDEX IF NOT EXISTS idx_approval_steps_approver ON public.approval_steps(approver_id, status);
CREATE INDEX IF NOT EXISTS idx_approval_steps_org      ON public.approval_steps(org_id);

-- Accessed only through the API's service client; no direct client access.
ALTER TABLE public.approval_steps ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
