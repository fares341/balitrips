/**
 * Our own URLs for Google place photos, and the precedence between our media
 * and Google photos. Pure and client-safe: no Google data at all, only our
 * slug and a photo index. The photo route (`/api/places/[slug]/gphoto/[i]`)
 * resolves the index to a live Google photo per request.
 */

/** Google photos per place we offer (hero + gallery). */
export const GOOGLE_PHOTO_MAX = 10

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

/** Drop Google photo URLs whose index the place does not have (count known). */
export function trimGooglePhotos(urls: readonly string[], googleCount: number): string[] {
  return urls.filter((url) => {
    const parsed = parseGphotoUrl(url)
    return parsed === null || parsed.index < googleCount
  })
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
  gallery: string[]
  /** How many Google photo slots were offered (0 = our media only). */
  googleSlots: number
}

/**
 * Which photos a place shows.
 *
 * Without a usable Google match (or with the feature off, or on any surface
 * other than place details) it is exactly the old behaviour: our hero and
 * gallery.
 *
 * Place details with a usable match (owner, Nov 2026 — at most one Google
 * photo per place):
 *   1. our own uploads that no other place uses,
 *   2. then free photos (#51) that no other place uses,
 *   3. and ONLY when 1 and 2 are both empty: Google photos #0..googleMax-1
 *      (`GOOGLE_PLACES_MAX_PHOTOS`, default 1).
 * Photos shared with another place (duplicates) count as missing.
 */
export function resolvePlaceImages(input: {
  slug: string
  hero: OwnImage | null
  gallery: readonly OwnImage[]
  /** Media ids (and file keys) used by more than one place. */
  isShared: (image: OwnImage) => boolean
  google: boolean
  /** Google photos offered when the place has nothing of its own. Default 1. */
  googleMax?: number
  galleryMax?: number
}): ResolvedImages {
  const galleryMax = input.galleryMax ?? 12
  if (!input.google) {
    return {
      heroImageUrl: input.hero?.url ?? null,
      heroThumbUrl: input.hero ? (input.hero.thumb ?? input.hero.url) : null,
      gallery: input.gallery.map((image) => image.url).slice(0, galleryMax),
      googleSlots: 0,
    }
  }

  const unique: OwnImage[] = []
  for (const image of [input.hero, ...input.gallery]) {
    if (!image || image.url === '' || input.isShared(image)) continue
    if (unique.some((one) => one.id === image.id || one.url === image.url)) continue
    unique.push(image)
  }
  // Uploads first, then free photos; stable within each group.
  const own = [...unique.filter((image) => !image.free), ...unique.filter((image) => image.free)]
  if (own.length > 0) {
    const first = own[0]!
    return {
      heroImageUrl: first.url,
      heroThumbUrl: first.thumb ?? first.url,
      gallery: own.slice(1, 1 + galleryMax).map((image) => image.url),
      googleSlots: 0,
    }
  }
  const slots = Math.min(Math.max(Math.round(input.googleMax ?? 1), 0), GOOGLE_PHOTO_MAX)
  if (slots === 0) return { heroImageUrl: null, heroThumbUrl: null, gallery: [], googleSlots: 0 }
  const google = Array.from({ length: slots }, (_, i) => gphotoUrl(input.slug, i))
  return {
    heroImageUrl: google[0]!,
    heroThumbUrl: gphotoUrl(input.slug, 0, 400),
    gallery: google.slice(1, 1 + galleryMax),
    googleSlots: slots,
  }
}

const WIDTHS = [320, 400, 640, 960, 1280, 1600] as const

/** `?w=` snapped to a few widths, so redirects are reused across slots. */
export function snapWidth(raw: string | null | undefined): number {
  const asked = Number(raw)
  if (!Number.isFinite(asked) || asked <= 0) return 1280
  return WIDTHS.find((w) => w >= asked) ?? 1600
}
