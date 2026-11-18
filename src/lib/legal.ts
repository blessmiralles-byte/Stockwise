/**
 * The legal entity behind Stocked, shown on /terms and /privacy.
 *
 * PENDING OWNER: fill these in once the business registration is done, then
 * update LEGAL_EFFECTIVE_DATE. While a value is null the pages fall back to
 * neutral wording ("Stocked", "the jurisdiction in which Stocked is
 * incorporated"), so the site is safe to run before then.
 */
export const LEGAL_ENTITY: {
  /** Registered name, e.g. "Lotus Digital OPC". */
  name: string | null
  /** Registered business address, one line. */
  address: string | null
  /** Whose laws govern the terms, e.g. "the Republic of the Philippines". */
  governingLaw: string | null
  /** Where disputes are heard, e.g. "the courts of Makati City". */
  venue: string | null
} = {
  name: null,
  address: null,
  governingLaw: null,
  venue: null,
}

/** Shown as "Effective date" on both pages. Change whenever either page changes. */
export const LEGAL_EFFECTIVE_DATE = 'November 18, 2026'

/** "Stocked" until the entity is registered, then "Stocked (operated by X)". */
export function operatorName(): string {
  return LEGAL_ENTITY.name ? `Stocked, operated by ${LEGAL_ENTITY.name}` : 'Stocked'
}
