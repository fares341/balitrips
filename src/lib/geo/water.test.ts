import { describe, expect, it } from 'vitest'

import {
  decodeRings,
  insideRings,
  isInWater,
  pointInWaterTile,
  resetWaterCache,
  tileAt,
} from './water'

/* A tiny vector-tile writer, just for these tests. */

function varint(n: number): number[] {
  const out: number[] = []
  let v = n
  while (v >= 0x80) {
    out.push((v % 0x80) | 0x80)
    v = Math.floor(v / 0x80)
  }
  out.push(v)
  return out
}
const key = (field: number, wire: number) => varint(field * 8 + wire)
const bytes = (field: number, data: number[]) => [...key(field, 2), ...varint(data.length), ...data]
const zz = (n: number) => (n < 0 ? -2 * n - 1 : 2 * n)

/** Geometry commands for closed rings (absolute coordinates in, deltas out). */
function polygonGeometry(rings: [number, number][][]): number[] {
  const out: number[] = []
  let cx = 0
  let cy = 0
  for (const ring of rings) {
    const [first, ...rest] = ring
    if (!first) continue
    out.push((1 << 3) | 1, zz(first[0] - cx), zz(first[1] - cy))
    ;[cx, cy] = first
    out.push((rest.length << 3) | 2)
    for (const [x, y] of rest) {
      out.push(zz(x - cx), zz(y - cy))
      cx = x
      cy = y
    }
    out.push((1 << 3) | 7)
  }
  return out
}

function tile(layers: { name: string; polygons: [number, number][][][] }[]) {
  const out: number[] = []
  for (const layer of layers) {
    const body: number[] = [...bytes(1, [...new TextEncoder().encode(layer.name)])]
    for (const rings of layer.polygons) {
      const geometry = polygonGeometry(rings).flatMap(varint)
      // id, tags (packed) and type before the geometry, as real tiles have them
      const feature = [
        ...key(1, 0),
        ...varint(123456789),
        ...bytes(2, [0, 0]),
        ...key(3, 0),
        ...varint(3),
        ...bytes(4, geometry),
      ]
      body.push(...bytes(2, feature))
    }
    // keys and values, skipped by the reader
    body.push(...bytes(3, [...new TextEncoder().encode('class')]))
    body.push(...bytes(4, bytes(1, [...new TextEncoder().encode('ocean')])))
    body.push(...key(5, 0), ...varint(4096))
    out.push(...bytes(3, body))
  }
  return new Uint8Array(out)
}

const square = (x0: number, y0: number, x1: number, y1: number): [number, number][] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
]

describe('vector-tile water check', () => {
  it('finds the tile and the position inside it', () => {
    const at = tileAt(-8.5069, 115.2625)
    expect(at.z).toBe(14)
    expect(at.x).toBe(13437)
    expect(at.y).toBe(8580)
    expect(at.fx).toBeGreaterThanOrEqual(0)
    expect(at.fx).toBeLessThan(1)
  })

  it('decodes ring geometry', () => {
    const rings = decodeRings(polygonGeometry([square(10, 10, 20, 20)]))
    expect(rings).toEqual([square(10, 10, 20, 20)])
  })

  it('tells water from land, holes included', () => {
    // A lake covering the left half of the tile, with an island in it.
    const t = tile([
      { name: 'transportation', polygons: [[square(0, 0, 4096, 4096)]] },
      { name: 'water', polygons: [[square(0, 0, 2048, 4096), square(500, 500, 1000, 1000)]] },
    ])
    expect(pointInWaterTile(t, 0.1, 0.5)).toBe(true)
    expect(pointInWaterTile(t, 0.9, 0.5)).toBe(false)
    // on the island
    expect(pointInWaterTile(t, 750 / 4096, 750 / 4096)).toBe(false)
  })

  it('even-odd rule', () => {
    expect(insideRings([square(0, 0, 10, 10)], 5, 5)).toBe(true)
    expect(insideRings([square(0, 0, 10, 10)], 15, 5)).toBe(false)
  })

  it('reads the tile over the network, and says "unknown" when it cannot', async () => {
    resetWaterCache()
    const seen: string[] = []
    const water = tile([{ name: 'water', polygons: [[square(-64, -64, 4160, 4160)]] }])
    const fetchImpl = (async (url: string) => {
      seen.push(url)
      if (url === 'https://tiles.openfreemap.org/planet') {
        return Response.json({ tiles: ['https://tiles.openfreemap.org/planet/v1/{z}/{x}/{y}.pbf'] })
      }
      return new Response(water)
    }) as unknown as typeof fetch
    expect(await isInWater(-8.9, 115.0, { fetchImpl })).toBe(true)
    expect(seen[1]).toMatch(/^https:\/\/tiles\.openfreemap\.org\/planet\/v1\/14\/\d+\/\d+\.pbf$/)

    resetWaterCache()
    const failing = (async () => {
      throw new Error('offline')
    }) as unknown as typeof fetch
    expect(await isInWater(-8.5, 115.2, { fetchImpl: failing })).toBeNull()

    // A tile template on another host is never followed.
    resetWaterCache()
    const elsewhere = (async () =>
      Response.json({ tiles: ['https://evil.example/{z}/{x}/{y}.pbf'] })) as unknown as typeof fetch
    expect(await isInWater(-8.5, 115.2, { fetchImpl: elsewhere })).toBeNull()
  })
})
