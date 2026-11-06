// Shared by scripts/brand-variants.mjs (generation) and brand-img.tsx (srcset).
// Plain TS with no types beyond literals: Node 22 strips them when the script imports it.

/** Widths generated for every source below, in pixels. */
export const BRAND_WIDTHS = [256, 480, 960]

/** Public paths of the photos that get variants (home page). */
export const BRAND_SOURCES: readonly string[] = [
  '/map/bali-satellite.webp',
  '/brand/jeep.webp',
  '/brand/rice-walk.webp',
  '/brand/green-dress.webp',
  '/brand/polaroids.webp',
  '/brand/flatlay-wide.webp',
  '/brand/custom-trip-team.webp',
  '/brand/temple-gate.webp',
  '/brand/swing.webp',
  '/brand/ulun-danu.webp',
  '/brand/penida-cove.webp',
  '/brand/kelingking.webp',
  '/brand/jungle-pool.webp',
  '/brand/lempuyang.webp',
  '/brand/beach-palms.webp',
  '/brand/flatlay.webp',
  '/brand/consultant.webp',
  '/brand/driver-car.webp',
]
