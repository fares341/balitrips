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
 * Without a usable Google match (or with the feature off) it is exactly the
 * old behaviour: our hero and gallery.
 *
 * With one: our own photos that no other place uses come first (hero first),
 * then up to `GOOGLE_PHOTO_MAX` Google photos. Our photos that are missing,
 * or shared with another place (the duplicates the audit flags), are
 * replaced by Google's.
 */
export function resolvePlaceImages(input: {
  slug: string
  hero: OwnImage | null
  gallery: readonly OwnImage[]
  /** Media ids (and file keys) used by more than one place. */
  isShared: (image: OwnImage) => boolean
  google: boolean
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

  const own: OwnImage[] = []
  for (const image of [input.hero, ...input.gallery]) {
    if (!image || image.url === '' || input.isShared(image)) continue
    if (own.some((one) => one.id === image.id || one.url === image.url)) continue
    own.push(image)
  }
  const google = Array.from({ length: GOOGLE_PHOTO_MAX }, (_, i) => gphotoUrl(input.slug, i))
  const all = [...own.map((image) => image.url), ...google]
  const first = own[0]
  return {
    heroImageUrl: all[0] ?? null,
    heroThumbUrl: first ? (first.thumb ?? first.url) : gphotoUrl(input.slug, 0, 400),
    gallery: all.slice(1, 1 + galleryMax),
    googleSlots: GOOGLE_PHOTO_MAX,
  }
}

const WIDTHS = [320, 400, 640, 960, 1280, 1600] as const

/** `?w=` snapped to a few widths, so redirects are reused across slots. */
export function snapWidth(raw: string | null | undefined): number {
  const asked = Number(raw)
  if (!Number.isFinite(asked) || asked <= 0) return 1280
  return WIDTHS.find((w) => w >= asked) ?? 1600
}
