/**
 * The responsive image ladder, as pure functions.
 *
 * These live apart from `(admin)/_lib/image/pipeline.ts` because that module
 * imports `node:fs` and the storage client: importing it from a component to
 * reach `rungsFor` would drag a filesystem writer into the browser bundle.
 * The pipeline re-exports from here, so the widths that are WRITTEN and the
 * widths that are REQUESTED can never drift apart -- which would 404 every
 * image the moment they did.
 *
 * Safe to import from client components. No node builtins, no I/O.
 */

/** Never store or request beyond this. Above it, bytes stop buying detail. */
export const MAX_STORED_WIDTH = 2048

/**
 * Deliberately coarse. Every extra rung is another encode on upload and
 * another candidate the browser has to reason about, for a saving smaller
 * than the variance between two JPEG encoders.
 */
export const WIDTH_LADDER = [320, 480, 640, 960, 1280, 1600, 2048] as const

/** AVIF first: typically 30-50% smaller than WebP at matched quality. */
export const DERIVATIVE_FORMATS = ['avif', 'webp'] as const

export type DerivativeFormat = (typeof DERIVATIVE_FORMATS)[number]

/**
 * Rungs a source of this width can fill WITHOUT upscaling.
 *
 * Upscaling is the one thing this must never do: it spends bytes to add no
 * detail, and it is why the ladder is capped by the source rather than run to
 * completion for every image.
 */
export function rungsFor(width: number): number[] {
  const ceiling = Math.min(width, MAX_STORED_WIDTH)
  // Widened to number[]: WIDTH_LADDER is `as const`, so filter() returns the
  // literal union and the computed ceiling below would not be assignable.
  const rungs: number[] = WIDTH_LADDER.filter((rung) => rung < ceiling)
  // The ceiling itself is always a rung, even when it is not a ladder step:
  // a 1885px source stores a 1885 derivative. Requesting a width that was
  // never written is a 404, so this MUST stay identical to what the pipeline
  // writes -- which is exactly why both now read it from here.
  rungs.push(ceiling)
  return [...new Set(rungs)].sort((a, b) => a - b)
}

/**
 * Marks an object stored WITHOUT a derivative ladder -- an upload that arrived
 * while the sharp encoder was missing. Such an object has no rungs at all, so
 * the read path must serve the original and emit no srcset: requesting a rung
 * that was never written is a 404, not a graceful downgrade.
 */
export const UNOPTIMISED_SEGMENT = 'unoptimised'

export function isUnoptimised(objectKey: string): boolean {
  return objectKey.includes(`/${UNOPTIMISED_SEGMENT}/`)
}

/** Object key of one derivative. Must match what the pipeline writes. */
export function derivativeKey(mediaId: string, width: number, format: DerivativeFormat): string {
  return `media/${mediaId}/${width}.${format}`
}

/**
 * The rung to use as the plain `<img src>` fallback.
 *
 * Not the largest: this is what a browser downloads when it ignores
 * `srcset` entirely, and what every crawler and mail client takes. 1280 is
 * wide enough for a full-bleed hero on a laptop and about a tenth the bytes
 * of a 3840px original.
 */
export function fallbackRung(width: number): number {
  const rungs = rungsFor(width)
  const preferred = rungs.filter((w) => w <= 1280)
  return preferred.length > 0 ? preferred[preferred.length - 1]! : rungs[0]!
}

/**
 * Build a `srcset` for one format.
 *
 * `toUrl` is injected rather than imported so this stays free of any CDN or
 * storage knowledge and can be unit-tested without either.
 */
export function buildSrcSet(
  mediaId: string,
  width: number,
  format: DerivativeFormat,
  toUrl: (key: string) => string,
): string {
  return rungsFor(width)
    .map((rung) => `${toUrl(derivativeKey(mediaId, rung, format))} ${rung}w`)
    .join(', ')
}
