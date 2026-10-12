/**
 * Editorial imagery for the marketing sections.
 *
 * The handoff dressed every non-catalogue section with
 * `flickr("uluwatu,temple", 700, 400, seed)` — a loremflickr URL built from a
 * search phrase. Those are other people's photographs, served from a third
 * party, with no licence record and no guarantee the picture is even of Bali.
 * Shipping them to production is not an option.
 *
 * Real images live in the `media` table, attached to the records they belong
 * to. So the hero, the service tiles, the map teaser and the about-page wall
 * borrow the hero image of a published record instead. Everything on screen is
 * then a photograph the business owns, of a place it actually sells.
 *
 * When a pool comes back empty — a fresh database, or content without images —
 * `<Photo>` renders its neutral surface. An empty panel is a better failure
 * than a stranger's holiday snap.
 */

import type { MediaDto } from '@/lib/content/types'

/** Anything the content layer returns with an optional hero image. */
type HasHero = { hero: MediaDto | null }

/**
 * Flatten several record lists into one de-duplicated image pool.
 *
 * Order is the caller's: pass the most on-topic list first so the images that
 * matter most (the hero, the first service tile) get the best photographs.
 */
export function imagePool(...groups: readonly (readonly HasHero[])[]): MediaDto[] {
  const out: MediaDto[] = []
  const seen = new Set<string>()

  for (const group of groups) {
    for (const item of group) {
      const hero = item.hero
      if (hero === null || seen.has(hero.id)) continue
      seen.add(hero.id)
      out.push(hero)
    }
  }

  return out
}

/**
 * Nth image from the pool, wrapping around.
 *
 * Wrapping rather than running out: six service tiles against four photographs
 * should repeat, not leave two grey rectangles in the middle of the grid.
 */
export function imageAt(pool: readonly MediaDto[], index: number): MediaDto | null {
  if (pool.length === 0) return null
  const safe = ((index % pool.length) + pool.length) % pool.length
  return pool[safe] ?? null
}
