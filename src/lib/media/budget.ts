/**
 * A byte budget for stored WebP rungs (site audit, Nov 2026).
 *
 * Rungs are sized by width, so a portrait photo's 1280px rung is 1700–1900px
 * tall and came out at 450–790 kB at the fixed quality. A rung over the
 * budget is encoded again at the next lower quality; the first that fits is
 * kept, else the smallest. Dimensions never change, so the `srcset` widths
 * stay true.
 */

/** A phone on a slow connection should not wait on more than this for one photo. */
export const MAX_RUNG_BYTES = 350_000

/** First is the normal quality; the rest are tried only for an over-budget rung. */
export const WEBP_QUALITIES = [78, 68, 58, 50] as const

export async function encodeWithinBudget<T extends { byteLength: number }>(
  encode: (quality: number) => Promise<T>,
  maxBytes: number = MAX_RUNG_BYTES,
  qualities: readonly number[] = WEBP_QUALITIES,
): Promise<T> {
  let best: T | null = null
  for (const quality of qualities) {
    const out = await encode(quality)
    if (best === null || out.byteLength < best.byteLength) best = out
    if (out.byteLength <= maxBytes) return out
  }
  if (best === null) throw new Error('encodeWithinBudget: no quality given')
  return best
}
