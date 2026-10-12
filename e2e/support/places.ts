/**
 * The seeded map catalogue, as literals.
 *
 * Deliberately hard-coded rather than read from Postgres. A paywall test that
 * asks the database what to look for can be defeated by the same bug twice: a
 * query that silently returns nothing produces a test that asserts nothing and
 * passes. These values come from `src/db/seed/content.json` and are checked in
 * next to the assertion that uses them, so a seed change that renames a place
 * fails loudly here instead of quietly disarming the test.
 *
 * `MAP_PLACES` in the seed marks four places `free: true` and five `free:
 * false`; the gated five are the ones the prototype leaked in full to every
 * anonymous browser and covered with `•••••` and `filter: blur(4px)`.
 */

export interface SeededPlace {
  slug: string
  /** Every localisation. `map_places.name` is jsonb carrying all three. */
  names: readonly string[]
  lat: number
  lon: number
  /**
   * `media.object_key` of the attached hero, from `scripts/seed-media.mjs`.
   * The public URL is this key under the site origin.
   */
  objectKey: string
}

/** Places behind the `map_access` entitlement. */
export const GATED_PLACES: readonly SeededPlace[] = [
  {
    slug: 'uluwatu-temple',
    names: ['Uluwatu Temple', 'معبد أولواتو', 'Pura Uluwatu'],
    lat: -8.829,
    lon: 115.085,
    objectKey: 'seed-media/map_places-uluwatu-temple.svg',
  },
  {
    slug: 'lempuyang-temple',
    names: ['Lempuyang Temple', 'معبد ليمبويانغ', 'Pura Lempuyang'],
    lat: -8.392,
    lon: 115.631,
    objectKey: 'seed-media/map_places-lempuyang-temple.svg',
  },
  {
    slug: 'nusa-penida',
    names: ['Nusa Penida'],
    lat: -8.727,
    lon: 115.544,
    objectKey: 'seed-media/map_places-nusa-penida.svg',
  },
  {
    slug: 'diamond-beach',
    names: ['Diamond Beach', 'شاطئ دايموند', 'Pantai Diamond'],
    lat: -8.795,
    lon: 115.595,
    objectKey: 'seed-media/map_places-diamond-beach.svg',
  },
  {
    slug: 'sekumpul-waterfall',
    names: ['Sekumpul Waterfall', 'شلال سيكومبول', 'Air Terjun Sekumpul'],
    lat: -8.16,
    lon: 115.16,
    objectKey: 'seed-media/map_places-sekumpul-waterfall.svg',
  },
]

/** Places anyone may see. Their absence is as much a bug as a gated leak. */
export const FREE_PLACES: readonly SeededPlace[] = [
  {
    slug: 'mount-batur',
    names: ['Mount Batur'],
    lat: -8.242,
    lon: 115.375,
    objectKey: 'seed-media/map_places-mount-batur.svg',
  },
  {
    slug: 'tegallalang-rice-terraces',
    names: ['Tegallalang Rice Terraces'],
    lat: -8.431,
    lon: 115.279,
    objectKey: 'seed-media/map_places-tegallalang-rice-terraces.svg',
  },
  {
    slug: 'ubud',
    names: ['Ubud'],
    lat: -8.507,
    lon: 115.263,
    objectKey: 'seed-media/map_places-ubud.svg',
  },
  {
    slug: 'canggu',
    names: ['Canggu'],
    lat: -8.648,
    lon: 115.138,
    objectKey: 'seed-media/map_places-canggu.svg',
  },
]

/**
 * Every string that must not reach an unentitled browser, labelled so a
 * failure names the field rather than just printing a needle.
 *
 * Coordinates are matched as their JSON number form (`115.085`) *and* as their
 * `data-` / attribute form, which is the same text — one entry covers both.
 * They are matched with a boundary on the trailing side so `115.16` does not
 * spuriously hit `115.163`; there is no such coordinate in the catalogue
 * today, but a future seed row should not silently weaken this test.
 */
export interface Needle {
  /** e.g. `Uluwatu Temple → name`. */
  label: string
  value: string
  /** Regex used for the actual search. */
  pattern: RegExp
  /**
   * Where this string must not appear.
   *
   * `'anywhere'` — the string identifies the gated *record* and nothing else,
   * so it must not turn up in any byte the browser receives, on any route.
   * Coordinates, the `map_places-*` hero key and the `?place=` deep link are
   * all of this kind.
   *
   * `'map-route'` — the string must not appear in the map route's own payload,
   * but is legitimate elsewhere. Only the names are like this, and the reason
   * is that the catalogue publishes them: `landmarks` names "Uluwatu Temple"
   * on /en/explore, and `activities` sells "Nusa Penida Day Tour" and
   * "Sekumpul Waterfall Trek" to anonymous visitors from the home page. Those
   * are public products. What the subscription sells is the map record —
   * where the place is, how it is rated, when it opens — and that is what must
   * never leak.
   *
   * The distinction matters because Next speculatively prefetches the links in
   * the header, so a browser sitting on /en/map pulls the RSC payload for /en
   * without being asked. Scanning those bytes for the names would assert that
   * the words appear nowhere on the site, which contradicts the product.
   */
  scope: 'anywhere' | 'map-route'
}

function literal(value: string): RegExp {
  return new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
}

/** A number must not be followed by another digit: `115.16` ≠ `115.163`. */
function numeric(value: number): RegExp {
  return new RegExp(`${String(value).replace(/[.\-]/g, '\\$&')}(?![0-9])`)
}

export function gatedNeedles(): Needle[] {
  const needles: Needle[] = []

  for (const place of GATED_PLACES) {
    for (const name of place.names) {
      needles.push({
        label: `${place.slug} → name`,
        value: name,
        pattern: literal(name),
        scope: 'map-route',
      })
    }
    needles.push({
      label: `${place.slug} → latitude`,
      value: String(place.lat),
      pattern: numeric(place.lat),
      scope: 'anywhere',
    })
    needles.push({
      label: `${place.slug} → longitude`,
      value: String(place.lon),
      pattern: numeric(place.lon),
      scope: 'anywhere',
    })
    needles.push({
      label: `${place.slug} → image URL`,
      value: place.objectKey,
      pattern: literal(place.objectKey),
      scope: 'anywhere',
    })
    /*
     * The map's own deep link, which is the one place the slug identifies the
     * *gated record* rather than something public.
     *
     * The bare slug deliberately is NOT a needle. `landmarks` and `activities`
     * are public tables that share slug stems with `map_places` — /en/explore
     * names "Uluwatu Temple" as a landmark and /en/activities sells the Kecak
     * dance at the same site — and the map page's own banner is a landmark
     * hero (`/seed-media/landmarks-uluwatu-temple.svg`). Matching the bare
     * slug flags all of that as a paywall breach, which it is not. The gated
     * record's own asset is `map_places-<slug>.svg` and is covered above.
     */
    needles.push({
      label: `${place.slug} → map deep link`,
      value: `place=${place.slug}`,
      pattern: literal(`place=${place.slug}`),
      scope: 'anywhere',
    })
  }

  return needles
}
