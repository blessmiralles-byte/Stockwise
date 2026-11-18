/**
 * Location codes are required and unique per organization, but a Stocked Tools
 * account never sees them: it names a place ("Van 2", "Site office") and gets a
 * code made from the name plus three digits.
 */

/** A code like VAN2-418 for the name "Van 2". */
export function autoLocationCode(name: string, rand: () => number = Math.random): string {
  const base = name.toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 6) || 'LOC'
  return `${base}-${Math.floor(100 + rand() * 900)}`
}

/**
 * Create a location named `name`, picking a free code automatically.
 * Retries on a code clash (409). Returns the created row or an error message.
 */
export async function createNamedLocation(
  name: string,
  extra: { address?: string; type?: string } = {},
): Promise<{ data: any } | { error: string }> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch('/api/locations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, code: autoLocationCode(name), type: extra.type ?? 'other', address: extra.address || undefined }),
    })
    const json = await res.json().catch(() => ({}))
    if (res.status === 409) continue
    if (!res.ok) return { error: json.error ?? 'Could not add the location' }
    return { data: json.data }
  }
  return { error: 'Could not add the location. Please try again.' }
}
