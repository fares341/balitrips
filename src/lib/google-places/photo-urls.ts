/**
 * Our own URLs for Google place photos, and the precedence between our media
 * and Google photos. Pure and client-safe: no Google data at all, only our
 * slug and a photo index. The photo route (`/api/places/[slug]/gphoto/[i]`)
 * resolves the index to a live Google photo per request.
 */

/** Google photos per place: exactly one, #0 (owner, Nov 2026). */
export const GOOGLE_PHOTO_MAX = 1

/** Statuses whose place ID is used for photos. */
export const USABLE_MATCH = ['auto', 'confirmed'] as const

export function isUsableMatch(
  status: string | null | undefined,
  placeId: string | null | undefined,
): boolean {
  return !!placeId && (USABLE_MATCH as readonly string[]).includes(status ?? '')
}

const GPHOTO = /^\/api\/places\/([^/?#]+)\/gphoto\/(\d+)(?:[?#].*)?$/

export function gphotoUrl(slug: string, index: number, width?: number): string {
  const base = `/api/places/${encodeURIComponent(slug)}/gphoto/${index}`
  return width ? `${base}?w=${width}` : base
}

/** `{ slug, index }` when `src` is one of our Google photo URLs. */
export function parseGphotoUrl(
  src: string | null | undefined,
): { slug: string; index: number } | null {
  if (!src) return null
  const path = src.replace(/^https?:\/\/[^/]+/i, '')
  const match = GPHOTO.exec(path)
  if (!match) return null
  let slug: string
  try {
    slug = decodeURIComponent(match[1]!)
  } catch {
    return null
  }
  return { slug, index: Number(match[2]) }
}

export function isGooglePhotoUrl(src: string | null | undefined): boolean {
  return parseGphotoUrl(src) !== null
}

export interface OwnImage {
  id: string
  url: string
  /** Small rung for cards, when known. */
  thumb?: string | null
  /**
   * A free photo found by «Find free photos» (#51: `media.source` set), as
   * opposed to our own upload. Uploads rank first, then free photos.
   */
  free?: boolean
}

export interface ResolvedImages {
  heroImageUrl: string | null
  heroThumbUrl: string | null
  /**
   * Extra photos for the place PAGE only (owner, 9 Nov 2026): the place's
   * other own photos used by fewer than WIDELY_SHARED places. Empty when the
   * hero is Google's or the glyph. Map cards / the sheet still show one.
   */
  gallery: string[]
  /** Where the one photo came from (null = the category glyph). */
  source: 'own' | 'google' | 'free' | 'shared' | null
}

/** Media used by this many places or more is never shown (#51's rule). */
export const WIDELY_SHARED = 3

/**
 * The ONE photo a place shows — map cards, the list, the map sheet and the
 * /places pages (owner, Nov 2026, final):
 *   1. the owner's own upload that no other place uses;
 *   2. otherwise Google photo #0 (when the place has a usable match and the
 *      feature is on and today's cap is not reached — `google`);
 *   3. otherwise a free photo (#51, `media.source` set) no other place uses;
 *   4. otherwise a photo shared with ONE other place (upload or free);
 *   5. otherwise nothing: the category glyph.
 * A photo used by 3 or more places is never shown.
 */
export function resolvePlaceImages(input: {
  slug: string
  hero: OwnImage | null
  gallery: readonly OwnImage[]
  /** How many places use this image (by media row or by file). */
  placesUsing: (image: OwnImage) => number
  google: boolean
}): ResolvedImages {
  const candidates: OwnImage[] = []
  for (const image of [input.hero, ...input.gallery]) {
    if (!image || image.url === '') continue
    if (candidates.some((one) => one.id === image.id || one.url === image.url)) continue
    candidates.push(image)
  }
  const uses = (image: OwnImage) => Math.max(1, input.placesUsing(image))
  const pick = (image: OwnImage, source: ResolvedImages['source']): ResolvedImages => ({
    heroImageUrl: image.url,
    heroThumbUrl: image.thumb ?? image.url,
    gallery: candidates
      .filter((other) => other !== image && uses(other) < WIDELY_SHARED)
      .map((other) => other.url),
    source,
  })

  const upload = candidates.find((image) => !image.free && uses(image) === 1)
  if (upload) return pick(upload, 'own')
  if (input.google) {
    return {
      heroImageUrl: gphotoUrl(input.slug, 0),
      heroThumbUrl: gphotoUrl(input.slug, 0, 400),
      gallery: [],
      source: 'google',
    }
  }
  const free = candidates.find((image) => image.free && uses(image) === 1)
  if (free) return pick(free, 'free')
  const shared = candidates.find((image) => uses(image) < WIDELY_SHARED)
  if (shared) return pick(shared, 'shared')
  return { heroImageUrl: null, heroThumbUrl: null, gallery: [], source: null }
}

const WIDTHS = [320, 400, 640, 960, 1280, 1600] as const

/** `?w=` snapped to a few widths, so redirects are reused across slots. */
export function snapWidth(raw: string | null | undefined): number {
  const asked = Number(raw)
  if (!Number.isFinite(asked) || asked <= 0) return 1280
  return WIDTHS.find((w) => w >= asked) ?? 1600
}
