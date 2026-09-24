-- ============================================================================
-- One free trial per person — survives account deletion
-- ============================================================================
-- Deleting an account removes the organization and the login, so the same
-- email could sign up again for another 14 days, forever. This records that an
-- email has started a trial, in a table that is never deleted with the account.
--
-- Only a SHA-256 hash of the normalized email is stored — the table holds no
-- readable addresses. Normalization folds the common aliases (plus-tags, and
-- Gmail dots) so name+2@gmail.com and n.ame@gmail.com count as one person.
--
-- On a repeat signup the new organization is created with its trial already
-- expired: they land on the paywall and must subscribe. Nothing from the
-- deleted organization comes back.
--
--   trial_checked_at  when this org was checked (so it runs once per org)
--   trial_reused      true = this org never got a trial; show "already used"
--
-- Additive / idempotent — safe to re-run.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.trial_claims (
  email_hash       text PRIMARY KEY,
  -- the organization that holds the trial; a different org later = a repeat
  org_id           uuid,
  first_claimed_at timestamptz NOT NULL DEFAULT now(),
  last_claimed_at  timestamptz NOT NULL DEFAULT now(),
  claim_count      int         NOT NULL DEFAULT 1
);

ALTER TABLE public.trial_claims ADD COLUMN IF NOT EXISTS org_id uuid;

-- Written only by the API's service client; never read from the browser.
ALTER TABLE public.trial_claims ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS trial_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS trial_reused     boolean NOT NULL DEFAULT false;

-- Existing organizations keep their trial. The first time each one is checked
-- it claims its owner's email against its own id, so today's customers are
-- unaffected but can't delete and re-trial later either.

NOTIFY pgrst, 'reload schema';
