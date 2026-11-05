/**
 * Map «feel» settings for the public map (pins, clusters, motion), in one
 * place so the unit tests pin them down.
 */

/**
 * Tiqets feel (client, Nov 2026). Measured on the Tiqets frames (384px wide):
 * pins ≈ 20–22px wide at whole-island zoom, the selected one ≈ 30px.
 * Ours: 28 / 38px images, drawn at 0.75× on the island and 1× from zoom 12.
 */
export const PIN_W = 28
export const PIN_W_ON = 38
export const PIN_SIZE_BY_ZOOM: unknown[] = ['interpolate', ['linear'], ['zoom'], 9, 0.75, 12, 1]
/** Only true overlaps merge: 3+ pins within ~12px, none past zoom 11. */
export const CLUSTER_RADIUS = 12
export const CLUSTER_MAX_ZOOM = 11
export const CLUSTER_MIN_POINTS = 3
/** Filter change → ease to the new pins. */
export const FIT_MS = 600
/** Labels/pins fade quickly (MapLibre's default 300ms smears during pinch). */
export const SYMBOL_FADE_MS = 120
