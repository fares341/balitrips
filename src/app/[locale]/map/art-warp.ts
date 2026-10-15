/**
 * Artwork ↔ real-world registration — pure, no DOM, no MapLibre.
 *
 * Port of the client's bali-map.js. Each label dot painted in the artwork
 * (public/brand/bali-art.*, 2576×1438) is tied to the verified coordinates of
 * the landmark it names. A best-fit affine transform plus an inverse-distance
 * weighted correction lands every control point exactly on its real place;
 * the areas between them are interpolated. The artwork is NOT drawn to
 * scale, so positions between control points are approximate — good for an
 * overview, never for navigation (the real map takes over when zoomed in).
 */

export const ART_W = 2576
export const ART_H = 1438

/** The artwork: a 1600 px copy for first paint / phones, the original for zooming in. */
export const ART_SMALL_URL = '/brand/bali-art-1600.webp'
export const ART_SMALL_W = 1600
export const ART_FULL_URL = '/brand/bali-art.jpg'

export type Pt = [number, number]

/**
 * [artX, artY, landmark id, lng, lat] — the painted label dots and the
 * coordinates the client registered the painting with (bali-map.js).
 * Deliberately frozen: they describe where the ARTIST put each dot, so they
 * stay as delivered even where `./landmarks.ts` has since corrected a
 * landmark (7 points, up to 3 km). They only position things on the artwork
 * poster/fallback — the real map uses lat/lng directly.
 * Coordinates only: this module ships to the browser, the landmark names do not.
 */
export const CONTROL: readonly (readonly [number, number, string, number, number])[] = [
  [313, 130, 'menjangan', 114.517657, -8.09588],
  [597, 181, 'pemuteran', 114.644722, -8.165556],
  [1013, 218, 'lovina', 115.039722, -8.149167],
  [1232, 141, 'singaraja', 115.083, -8.117],
  [1201, 283, 'buyan', 115.122778, -8.244722],
  [1108, 343, 'tamblingan', 115.097003, -8.257056],
  [1395, 367, 'beratan', 115.173889, -8.272222],
  [1342, 469, 'bedugul', 115.167, -8.283],
  [1763, 330, 'lake-batur', 115.408333, -8.258333],
  [2096, 493, 'agung', 115.503333, -8.340833],
  [2157, 285, 'amed', 115.641667, -8.334167],
  [1371, 641, 'ubud', 115.2651, -8.5079],
  [1010, 737, 'canggu', 115.134167, -8.655833],
  [1095, 821, 'seminyak', 115.167, -8.683],
  [1340, 826, 'denpasar', 115.2339, -8.6717],
  [1200, 911, 'kuta', 115.167, -8.733],
  [1477, 909, 'sanur', 115.267, -8.683],
  [1423, 1093, 'nusa-dua', 115.217, -8.8],
  [1067, 1220, 'uluwatu', 115.085278, -8.828889],
  [2055, 910, 'lembongan', 115.451117, -8.681767],
  [2222, 977, 'ceningan', 115.451389, -8.699722],
  [2053, 1074, 'penida', 115.5378, -8.7346],
]

/** Gaussian elimination with partial pivoting (tiny dense systems only). */
export function solve(A: readonly (readonly number[])[], b: readonly number[]): number[] {
  const n = b.length
  const M = A.map((row, i) => [...row, b[i] ?? 0])
  const at = (r: number, c: number) => M[r]?.[c] ?? 0
  for (let c = 0; c < n; c++) {
    let p = c
    for (let r = c + 1; r < n; r++) if (Math.abs(at(r, c)) > Math.abs(at(p, c))) p = r
    const top = M[c]
    const piv = M[p]
    if (top === undefined || piv === undefined) continue
    M[c] = piv
    M[p] = top
    const pivot = M[c] ?? []
    for (let r = 0; r < n; r++) {
      if (r === c) continue
      const row = M[r]
      if (row === undefined) continue
      const f = (row[c] ?? 0) / (pivot[c] ?? 1)
      for (let k = c; k <= n; k++) row[k] = (row[k] ?? 0) - f * (pivot[k] ?? 0)
    }
  }
  return M.map((row, i) => (row[n] ?? 0) / (row[i] ?? 1))
}

/**
 * f(x, y) → [u, v] mapping `src` points exactly onto `dst` points: a
 * least-squares affine fit plus inverse-distance-weighted residuals. A virtual
 * "zero correction" weight makes the correction fade back to the affine fit
 * at distances well beyond `sigma` from every control point.
 */
export function makeWarp(
  src: readonly Pt[],
  dst: readonly Pt[],
  sigma: number,
): (x: number, y: number) => Pt {
  const n = src.length
  const ata = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ]
  const atu = [0, 0, 0]
  const atv = [0, 0, 0]
  for (let i = 0; i < n; i++) {
    const s = src[i]
    const d = dst[i]
    if (s === undefined || d === undefined) continue
    const row = [s[0], s[1], 1]
    for (let j = 0; j < 3; j++) {
      const rj = row[j] ?? 0
      const target = ata[j]
      if (target === undefined) continue
      for (let k = 0; k < 3; k++) target[k] = (target[k] ?? 0) + rj * (row[k] ?? 0)
      atu[j] = (atu[j] ?? 0) + rj * d[0]
      atv[j] = (atv[j] ?? 0) + rj * d[1]
    }
  }
  const pu = solve(ata, atu)
  const pv = solve(ata, atv)
  const [u0 = 0, u1 = 0, u2 = 0] = pu
  const [v0 = 0, v1 = 0, v2 = 0] = pv
  const aff = (x: number, y: number): Pt => [u0 * x + u1 * y + u2, v0 * x + v1 * y + v2]
  const res: Pt[] = src.map((p, m) => {
    const a = aff(p[0], p[1])
    const d = dst[m] ?? a
    return [d[0] - a[0], d[1] - a[1]]
  })
  const w0 = 1 / (sigma * sigma)
  return (x, y) => {
    const o = aff(x, y)
    let su = 0
    let sv = 0
    let sw = w0
    for (let m = 0; m < n; m++) {
      const s = src[m]
      const r = res[m]
      if (s === undefined || r === undefined) continue
      const ex = x - s[0]
      const ey = y - s[1]
      const d2 = ex * ex + ey * ey
      if (d2 < 1e-12) {
        const d = dst[m]
        if (d !== undefined) return [d[0], d[1]]
      }
      const w = 1 / d2
      su += w * r[0]
      sv += w * r[1]
      sw += w
    }
    return [o[0] + su / sw, o[1] + sv / sw]
  }
}

/** Degrees → km near Bali, for an even-scaled inverse fit. */
const KM = 110.6

const ART_PTS: Pt[] = CONTROL.map((c) => [c[0], c[1]])
const GEO_PTS: Pt[] = CONTROL.map((c) => [c[3], c[4]])
const GEO_KM: Pt[] = GEO_PTS.map((g) => [(g[0] - 115) * KM, (g[1] + 8.5) * KM])
const warpArtToGeo = makeWarp(ART_PTS, GEO_PTS, 220)
const warpKmToArt = makeWarp(GEO_KM, ART_PTS, 9)

/** Artwork pixel → [lng, lat]. */
export function artToGeo(x: number, y: number): Pt {
  return warpArtToGeo(x, y)
}

/**
 * [lng, lat] → artwork pixel. Starts from a separately fitted estimate, then
 * refines with Newton steps on the forward mapping so art→geo→art
 * round-trips consistently.
 */
export function geoToArt(lng: number, lat: number): Pt {
  let p = warpKmToArt((lng - 115) * KM, (lat + 8.5) * KM)
  for (let it = 0; it < 8; it++) {
    const f = artToGeo(p[0], p[1])
    const fx = artToGeo(p[0] + 1, p[1])
    const fy = artToGeo(p[0], p[1] + 1)
    const a = fx[0] - f[0]
    const b = fy[0] - f[0]
    const c = fx[1] - f[1]
    const d = fy[1] - f[1]
    const det = a * d - b * c
    if (Math.abs(det) < 1e-14) break
    const ex = lng - f[0]
    const ey = lat - f[1]
    const dx = (d * ex - b * ey) / det
    const dy = (-c * ex + a * ey) / det
    const step = Math.min(1, 200 / Math.max(1e-9, Math.hypot(dx, dy)))
    p = [p[0] + dx * step, p[1] + dy * step]
    if (Math.hypot(dx, dy) < 0.05) break
  }
  return p
}

/** Degrees of ground per artwork pixel around (x, y). */
export function degPerArtPx(x: number, y: number): number {
  const a = artToGeo(x, y)
  const b = artToGeo(x + 10, y)
  const c = artToGeo(x, y + 10)
  const det = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 100
  return Math.max(Math.sqrt(det), 1e-6)
}

/** MapLibre zoom whose scale matches `screenPxPerArtPx` at artwork point (x, y). */
export function zoomFor(x: number, y: number, screenPxPerArtPx: number): number {
  const pxPerDeg = screenPxPerArtPx / degPerArtPx(x, y)
  return Math.log((pxPerDeg * 360) / 512) / Math.LN2
}

/** Inverse of `zoomFor`: screen px per artwork px that matches a map zoom at (x, y). */
export function artScaleForZoom(x: number, y: number, zoom: number): number {
  const pxPerDeg = (512 * Math.pow(2, zoom)) / 360
  return pxPerDeg * degPerArtPx(x, y)
}

export function clampToArt(p: Pt): Pt {
  return [Math.max(0, Math.min(ART_W, p[0])), Math.max(0, Math.min(ART_H, p[1]))]
}
