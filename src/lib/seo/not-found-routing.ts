/**
 * Server-rendered 404s (site audit, Nov 2026).
 *
 * When `notFound()` is thrown while a dynamic page renders, Next answers with
 * a bare shell (`<html id="__next_error__">`, no lang/dir, no heading) and
 * the localized not-found page only appears after JavaScript runs. A crawler
 * or a visitor without scripts gets an empty page.
 *
 * So the decision is made before rendering, where the status can still be
 * set: the proxy asks `/api/exists` whether a public detail URL
 * (`/ar/activities/<slug>`, `/ar/places/<slug>`, …) names a real record, and
 * if not it rewrites to `/[locale]/not-found-page` with status 404 — the same
 * UI, rendered on the server inside the site layout. Paths that match no
 * route at all get the same page from `[locale]/[...rest]/route.ts`.
 *
 * Pure helpers only (no Next imports): shared by the proxy, the API route and
 * their tests.
 */

/** URL segment → record kind, for the detail pages that call `notFound()`. */
export const DETAIL_KINDS = {
  activities: 'activity',
  itineraries: 'itinerary',
  packages: 'package',
  blog: 'article',
  places: 'place',
  explore: 'region',
} as const

export type DetailKind = (typeof DETAIL_KINDS)[keyof typeof DETAIL_KINDS]

export const NOT_FOUND_PAGE = 'not-found-page'

/** Slugs and region keys: what the routes accept, nothing that needs escaping. */
const KEY = /^[A-Za-z0-9][A-Za-z0-9._~%-]{0,159}$/

/**
 * `/ar/places/ubud` → `{ kind: 'place', key: 'ubud' }`; null for anything that
 * is not exactly a public detail URL (lists, nested pages such as
 * `/activities/<slug>/preview`, other sections).
 */
export function detailTarget(pathname: string): { kind: DetailKind; key: string } | null {
  const parts = pathname.split('/')
  // ['', locale, section, key]
  if (parts.length !== 4) return null
  const section = parts[2] ?? ''
  const raw = parts[3] ?? ''
  if (!Object.hasOwn(DETAIL_KINDS, section) || !KEY.test(raw)) return null
  let key: string
  try {
    key = decodeURIComponent(raw)
  } catch {
    return null
  }
  return { kind: DETAIL_KINDS[section as keyof typeof DETAIL_KINDS], key }
}

export function isDetailKind(value: unknown): value is DetailKind {
  return typeof value === 'string' && (Object.values(DETAIL_KINDS) as string[]).includes(value)
}

/**
 * A small memory of answers, so a page that exists costs one lookup every few
 * minutes, not one per view. «Missing» is remembered only briefly: a record
 * published a moment ago must open at once.
 */
export class ExistsCache {
  private readonly entries = new Map<string, { exists: boolean; until: number }>()

  constructor(
    private readonly foundMs = 5 * 60_000,
    private readonly missingMs = 15_000,
    private readonly max = 5000,
  ) {}

  get(id: string, now: number): boolean | null {
    const hit = this.entries.get(id)
    if (hit === undefined) return null
    if (hit.until <= now) {
      this.entries.delete(id)
      return null
    }
    return hit.exists
  }

  set(id: string, exists: boolean, now: number): void {
    if (this.entries.size >= this.max) this.entries.clear()
    this.entries.set(id, { exists, until: now + (exists ? this.foundMs : this.missingMs) })
  }
}
