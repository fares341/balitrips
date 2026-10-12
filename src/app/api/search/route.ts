/**
 * Site search.
 *
 * The prototype's overlay filtered five in-memory arrays with
 * `name[lang].toLowerCase().includes(q)`. That works when the catalogue is a
 * JavaScript literal shipped to every browser; it does not survive the
 * catalogue moving to Postgres, and it never matched anything a translator had
 * not filled in.
 *
 * The matching itself belongs to `search()` in `@/lib/content/queries`, which
 * matches the requested locale *and* English so "Batur" finds the mountain
 * from the Arabic site. This handler is a thin, cacheable wrapper: it
 * validates the query, resolves localized values to strings so the client does
 * not have to ship `pick()` and three locales of every field, and returns at
 * most twelve hits.
 *
 * No cookies, no session, no personalization — only published content — so the
 * response is safe to cache at the edge. That matters: the overlay fires one
 * of these per keystroke pause.
 */

import { NextResponse } from 'next/server'

import { defaultLocale, isLocale, type Locale } from '@/i18n/config'
import { pick, pickOptional } from '@/lib/content/localize'
import { search } from '@/lib/content/queries'
import type { SearchHitType } from '@/lib/content/types'

/** It reads the query string, so there is nothing to prerender. */
export const dynamic = 'force-dynamic'

/**
 * Below this the result set is the whole catalogue and the query is noise.
 * The overlay enforces the same floor so it does not even ask.
 */
const MIN_QUERY_LENGTH = 2

/**
 * Longer than any real search term. Truncated rather than rejected — a paste
 * should still find something — but a 10 kB `q` must not reach the database.
 */
const MAX_QUERY_LENGTH = 64

/** Matches the design: the overlay shows twelve rows and no pagination. */
const RESULT_LIMIT = 12

export interface SearchResponseHit {
  type: SearchHitType
  id: string
  /** Locale-agnostic path; the client renders it through the next-intl Link. */
  href: string
  title: string
  /** Area, category or excerpt. Null when the record carries none. */
  subtitle: string | null
  /** Set for itineraries and packages, so the UI can render "N days". */
  days: number | null
  imageUrl: string | null
  /** Alt text. Empty string when the image is decorative or absent. */
  imageAlt: string
}

export interface SearchResponse {
  /** Echoed back so a late response can be discarded by the caller. */
  q: string
  hits: SearchResponseHit[]
}

function localeOf(value: string | null): Locale {
  return value !== null && isLocale(value) ? value : defaultLocale
}

function empty(q: string): NextResponse {
  return NextResponse.json({ q, hits: [] } satisfies SearchResponse, {
    headers: { 'Cache-Control': 'no-store' },
  })
}

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url)
  const raw = (url.searchParams.get('q') ?? '').trim().slice(0, MAX_QUERY_LENGTH)
  const locale = localeOf(url.searchParams.get('locale'))

  if (raw.length < MIN_QUERY_LENGTH) return empty(raw)

  let hits
  try {
    hits = await search(raw, locale, RESULT_LIMIT)
  } catch (error) {
    // A search box is not worth a 500 page. Logged, and the overlay renders
    // its "no results" state rather than a broken dialog.
    console.error('[search] query failed', error)
    return NextResponse.json({ q: raw, hits: [] } satisfies SearchResponse, {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
    })
  }

  const body: SearchResponse = {
    q: raw,
    hits: hits.map((hit) => ({
      type: hit.type,
      id: hit.id,
      href: hit.href,
      // The slug is the last-resort fallback, so a record whose name has not
      // been translated yet is still identifiable rather than blank.
      title: pick(hit.title, locale, hit.slug),
      subtitle: hit.subtitle === null ? null : pickOptional(hit.subtitle, locale),
      days: hit.days,
      imageUrl: hit.hero?.url ?? null,
      imageAlt: hit.hero?.alt == null ? '' : pick(hit.hero.alt, locale),
    })),
  }

  return NextResponse.json(body, {
    headers: {
      // Published content only. Short enough that a newly published activity
      // shows up within the minute, long enough to absorb a burst of typing.
      'Cache-Control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=300',
    },
  })
}
