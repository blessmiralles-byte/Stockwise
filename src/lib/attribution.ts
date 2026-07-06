/**
 * First-touch marketing attribution (client-side).
 *
 * captureAttribution() runs on the landing and register pages: on a visitor's
 * FIRST visit it records UTM params, referrer, and landing path in
 * localStorage. Later visits never overwrite it (first-touch model), so the
 * channel that originally earned the visit gets the credit even if the user
 * returns directly a week later to sign up.
 *
 * At signup the stored record rides along in auth user metadata, and the
 * onboarding flow stamps it onto the organization (organizations.attribution)
 * for reporting: which channel produced each trial and each paying customer.
 */

const STORAGE_KEY = 'stocked_attribution'

export interface Attribution {
  utm_source?:   string
  utm_medium?:   string
  utm_campaign?: string
  utm_term?:     string
  utm_content?:  string
  ref?:          string      // short referral code, e.g. ?ref=bookkeeper-jane
  referrer?:     string      // document.referrer host, e.g. "google.com"
  landing_page?: string      // first path seen, e.g. "/sortly-alternative"
  captured_at?:  string      // ISO timestamp of first touch
}

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'ref'] as const

export function captureAttribution(): void {
  try {
    if (typeof window === 'undefined') return
    if (localStorage.getItem(STORAGE_KEY)) return   // first touch already recorded

    const params = new URLSearchParams(window.location.search)
    const attr: Attribution = {}

    for (const key of UTM_KEYS) {
      const val = params.get(key)?.trim().slice(0, 200)
      if (val) attr[key] = val
    }

    if (document.referrer) {
      try {
        const refHost = new URL(document.referrer).hostname
        // Ignore self-referrals (in-app navigation)
        if (refHost && refHost !== window.location.hostname) attr.referrer = refHost
      } catch { /* malformed referrer — skip */ }
    }

    attr.landing_page = window.location.pathname.slice(0, 200)
    attr.captured_at  = new Date().toISOString()

    localStorage.setItem(STORAGE_KEY, JSON.stringify(attr))
  } catch { /* storage unavailable (private mode etc.) — attribution is best-effort */ }
}

export function getAttribution(): Attribution | null {
  try {
    if (typeof window === 'undefined') return null
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Attribution) : null
  } catch {
    return null
  }
}
