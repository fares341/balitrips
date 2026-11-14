/**
 * The order of the cards under the map (owner, Nov 2026 — iPhone video: the
 * cards ran Canggu → Nusa Penida → Gilimanuk → the north coast, so every
 * swipe was a flight across the island).
 *
 * The old order was one nearest-neighbour chain from the API's first place,
 * built once per result set: the visitor looking at Ubud got cards from
 * Canggu, and a few swipes in the chain's tail jumped between the stragglers
 * it had left behind all over the island.
 *
 * The cards now start at an anchor — the pin the visitor tapped, the pin in
 * the middle of what they panned to, or their own position — and walk to the
 * nearest unvisited place from there. The explorer re-anchors on every tap,
 * pan and filter, so a visitor is always near the start of a walk, where the
 * steps are short (measured on the live places from 21 anchors, first 30
 * swipes: 1.6 km on average). Tried and rejected: pulling the walk towards
 * the anchor (longer first steps) and 2-opt (a shorter tour overall, but
 * longer steps near the start, where visitors actually swipe).
 *
 * Pure and deterministic (ties keep the input order), O(n²) — a few ms for
 * the few hundred places of one result set.
 */

import type { LatLon } from './distance'

interface Located {
  id: string
  lat: number
  lon: number
}

/** Squared equirectangular distance (good enough for ordering, ~100 km). */
function d2(a: LatLon, b: LatLon): number {
  const cos = Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180)
  const dx = (a.lon - b.lon) * cos
  const dy = a.lat - b.lat
  return dx * dx + dy * dy
}

/**
 * The cards in swipe order from `anchor`: the place nearest to it first (or
 * the place `firstId`, when it is one of them), then outwards one neighbour
 * at a time.
 */
export function sweepOrder<T extends Located>(
  places: readonly T[],
  anchor: LatLon,
  firstId: string | null = null,
): T[] {
  if (places.length < 2) return [...places]
  const left = [...places]
  let start = firstId === null ? -1 : left.findIndex((one) => one.id === firstId)
  if (start < 0) {
    let best = Infinity
    for (let i = 0; i < left.length; i += 1) {
      const d = d2(anchor, left[i]!)
      if (d < best) {
        best = d
        start = i
      }
    }
  }
  const out: T[] = [left.splice(start, 1)[0]!]
  let here: LatLon = out[0]!
  while (left.length > 0) {
    let best = 0
    let bestCost = Infinity
    for (let i = 0; i < left.length; i += 1) {
      const p = left[i]!
      const cost = d2(here, p)
      if (cost < bestCost) {
        bestCost = cost
        best = i
      }
    }
    here = left.splice(best, 1)[0]!
    out.push(here as T)
  }
  return out
}

/** Step lengths (km) between consecutive cards: for tests and reports. */
export function stepsKm(places: readonly LatLon[]): number[] {
  const out: number[] = []
  for (let i = 1; i < places.length; i += 1) {
    out.push(Math.sqrt(d2(places[i - 1]!, places[i]!)) * 111.32)
  }
  return out
}
