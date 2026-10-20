/**
 * Possible duplicate customers.
 *
 * The database already refuses two accounts with the same e-mail or the same
 * normalised mobile number, so real duplicates look slightly different:
 * "sara.ali@gmail.com" and "saraali+trip@gmail.com", or the same name with
 * the same number typed once as "+62 812…" and once as "0812…" on an account
 * that never verified it. These rules find those, and only suggest — a person
 * decides, and only an admin merges (see `./merge.ts`).
 */

export interface DuplicateCandidate {
  id: string
  email: string | null
  phone: string | null
  name: string | null
}

export type DuplicateReason = 'email' | 'phone' | 'name_phone'

export interface DuplicateGroup {
  reason: DuplicateReason
  ids: string[]
}

/**
 * An address as a mailbox: lower-case, "+tag" dropped, and for Gmail the dots
 * too (Gmail ignores them). Placeholder addresses of phone-only accounts are
 * not addresses at all.
 */
export function canonicalEmail(email: string | null): string | null {
  if (email === null) return null
  const value = email.trim().toLowerCase()
  const at = value.lastIndexOf('@')
  if (at <= 0) return null
  let local = value.slice(0, at)
  let domain = value.slice(at + 1)
  if (domain.endsWith('.invalid')) return null
  local = local.split('+')[0] ?? local
  if (domain === 'googlemail.com') domain = 'gmail.com'
  if (domain === 'gmail.com') local = local.replace(/\./g, '')
  return local === '' ? null : `${local}@${domain}`
}

/**
 * The last nine digits of a number: enough to identify a mobile, and the same
 * whether it was typed with the country code, a trunk zero or neither.
 */
export function phoneKey(phone: string | null): string | null {
  if (phone === null) return null
  const digits = phone.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/\D/g, '')
  return digits.length < 7 ? null : digits.slice(-9)
}

/** Name for comparison: lower-case, accents and punctuation gone, single spaces. */
export function nameKey(name: string | null): string | null {
  if (name === null) return null
  const value = name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return value.length < 2 ? null : value
}

/** Edit distance, capped: anything above `max` is reported as `max + 1`. */
export function editDistance(a: string, b: string, max = 3): number {
  if (Math.abs(a.length - b.length) > max) return max + 1
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i]
    let best = i
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      const value = Math.min(
        (previous[j] ?? 0) + 1,
        (current[j - 1] ?? 0) + 1,
        (previous[j - 1] ?? 0) + cost,
      )
      current.push(value)
      best = Math.min(best, value)
    }
    if (best > max) return max + 1
    previous = current
  }
  return previous[b.length] ?? max + 1
}

/** Very similar names: equal, or within two edits on names of 6+ characters. */
export function similarNames(a: string, b: string): boolean {
  if (a === b) return true
  if (Math.min(a.length, b.length) < 6) return false
  return editDistance(a, b, 2) <= 2
}

/**
 * Group candidates that are probably the same person. Each group lists ids in
 * input order; a person can appear in more than one group (for different
 * reasons). Groups of one are never returned.
 */
export function findDuplicateGroups(people: readonly DuplicateCandidate[]): DuplicateGroup[] {
  const groups: DuplicateGroup[] = []
  const byKey = (reason: DuplicateReason, keyOf: (p: DuplicateCandidate) => string | null) => {
    const buckets = new Map<string, string[]>()
    for (const person of people) {
      const key = keyOf(person)
      if (key === null) continue
      const bucket = buckets.get(key)
      if (bucket) bucket.push(person.id)
      else buckets.set(key, [person.id])
    }
    for (const ids of buckets.values()) if (ids.length > 1) groups.push({ reason, ids })
  }
  byKey('email', (p) => canonicalEmail(p.email))
  byKey('phone', (p) => phoneKey(p.phone))

  // Similar name AND the same last seven digits: catches a number typed with
  // one digit wrong in the country part, which `phone` alone would miss.
  const byShortPhone = new Map<string, DuplicateCandidate[]>()
  for (const person of people) {
    const key = phoneKey(person.phone)?.slice(-7) ?? null
    if (key === null || nameKey(person.name) === null) continue
    const bucket = byShortPhone.get(key)
    if (bucket) bucket.push(person)
    else byShortPhone.set(key, [person])
  }
  const seen = new Set(groups.filter((g) => g.reason === 'phone').map((g) => g.ids.join('|')))
  for (const bucket of byShortPhone.values()) {
    if (bucket.length < 2) continue
    const ids: string[] = []
    for (let i = 0; i < bucket.length; i += 1) {
      for (let j = i + 1; j < bucket.length; j += 1) {
        const a = bucket[i]
        const b = bucket[j]
        if (!a || !b) continue
        const na = nameKey(a.name)
        const nb = nameKey(b.name)
        if (na !== null && nb !== null && similarNames(na, nb)) {
          if (!ids.includes(a.id)) ids.push(a.id)
          if (!ids.includes(b.id)) ids.push(b.id)
        }
      }
    }
    if (ids.length > 1 && !seen.has(ids.join('|'))) groups.push({ reason: 'name_phone', ids })
  }
  return groups
}
