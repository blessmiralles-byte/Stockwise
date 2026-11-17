/**
 * The site's own public address, without a trailing slash. Production sets
 * NEXT_PUBLIC_SITE_URL to https://www.stocked.tech (the apex redirects there).
 */
export function siteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.stocked.tech'
  return raw.replace(/\/+$/, '')
}
