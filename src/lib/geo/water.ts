/**
 * "Is this spot in the sea or a lake?" on the SERVER, from the same data the
 * place editor's check reads: the `water` layer of the OpenFreeMap vector
 * tiles (OpenMapTiles schema) that the real map draws. The editor asks the
 * rendered map; the Studio assistant has no map, so it reads the one z14
 * tile under the point and tests the water polygons itself.
 *
 *  - A minimal Mapbox Vector Tile reader: protobuf wire format, one layer,
 *    polygon geometry only (spec 2.1, https://github.com/mapbox/vector-tile-spec).
 *  - Even-odd point-in-polygon over every ring of a feature, so holes
 *    (islands in a lake, land in the ocean polygon) are handled.
 *  - Network injected; any failure is `null` ("could not check"), never a
 *    guess.
 */

import { gunzipSync } from 'node:zlib'

/* --------------------------------------------------------------------------
   Tile maths (Web Mercator)
   -------------------------------------------------------------------------- */

export const WATER_ZOOM = 14

/** The tile holding a point, and the point's position inside it (0…1). */
export function tileAt(lat: number, lon: number, z: number = WATER_ZOOM) {
  const n = 2 ** z
  const x = ((lon + 180) / 360) * n
  const r = (lat * Math.PI) / 180
  const y = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n
  const tx = Math.min(n - 1, Math.max(0, Math.floor(x)))
  const ty = Math.min(n - 1, Math.max(0, Math.floor(y)))
  return { z, x: tx, y: ty, fx: x - tx, fy: y - ty }
}

/* --------------------------------------------------------------------------
   Protobuf reader (just enough for vector tiles)
   -------------------------------------------------------------------------- */

class Reader {
  pos: number
  constructor(
    readonly buf: Uint8Array,
    start = 0,
    readonly end = buf.length,
  ) {
    this.pos = start
  }

  done(): boolean {
    return this.pos >= this.end
  }

  varint(): number {
    let result = 0
    let mul = 1
    for (let i = 0; i < 10; i += 1) {
      if (this.pos >= this.end) throw new Error('truncated varint')
      const byte = this.buf[this.pos] as number
      this.pos += 1
      result += (byte & 0x7f) * mul
      if (byte < 0x80) return result
      mul *= 128
    }
    throw new Error('bad varint')
  }

  /** A length-delimited field: a reader over its bytes; this one moves past it. */
  sub(): Reader {
    const length = this.varint()
    const start = this.pos
    if (start + length > this.end) throw new Error('truncated field')
    this.pos = start + length
    return new Reader(this.buf, start, start + length)
  }

  skip(wire: number): void {
    if (wire === 0) this.varint()
    else if (wire === 1) this.pos += 8
    else if (wire === 2) {
      // Read the length first: `this.pos += this.varint()` would lose the length's own bytes.
      const length = this.varint()
      this.pos += length
    } else if (wire === 5) this.pos += 4
    else throw new Error(`unsupported wire type ${wire}`)
    if (this.pos > this.end) throw new Error('truncated field')
  }

  packed(): number[] {
    const sub = this.sub()
    const out: number[] = []
    while (!sub.done()) out.push(sub.varint())
    return out
  }

  string(): string {
    const sub = this.sub()
    return new TextDecoder().decode(this.buf.subarray(sub.pos, sub.end))
  }
}

const zigzag = (n: number) => (n % 2 === 1 ? -(n + 1) / 2 : n / 2)

export type Ring = [number, number][]

export interface TilePolygon {
  /** Rings in tile units (0…extent). */
  rings: Ring[]
  extent: number
}

/** Polygon rings from a feature's geometry commands. */
export function decodeRings(geometry: readonly number[]): Ring[] {
  const rings: Ring[] = []
  let x = 0
  let y = 0
  let ring: Ring | null = null
  let i = 0
  while (i < geometry.length) {
    const command = geometry[i] as number
    i += 1
    const id = command & 0x7
    const count = command >> 3
    if (id === 1 || id === 2) {
      for (let k = 0; k < count; k += 1) {
        x += zigzag(geometry[i] as number)
        y += zigzag(geometry[i + 1] as number)
        i += 2
        if (id === 1) {
          if (ring !== null && ring.length > 2) rings.push(ring)
          ring = [[x, y]]
        } else {
          ring?.push([x, y])
        }
      }
    } else if (id === 7) {
      if (ring !== null && ring.length > 2) rings.push(ring)
      ring = null
    } else {
      break
    }
  }
  if (ring !== null && ring.length > 2) rings.push(ring)
  return rings
}

/** The polygons of one layer of a vector tile (other geometry types are ignored). */
export function layerPolygons(tile: Uint8Array, layerName: string): TilePolygon[] {
  const out: TilePolygon[] = []
  const top = new Reader(tile)
  while (!top.done()) {
    const key = top.varint()
    if (key >> 3 !== 3 || (key & 7) !== 2) {
      top.skip(key & 7)
      continue
    }
    const layer = top.sub()
    let name = ''
    let extent = 4096
    const features: { type: number; geometry: number[] }[] = []
    while (!layer.done()) {
      const lk = layer.varint()
      const field = lk >> 3
      if (field === 1 && (lk & 7) === 2) name = layer.string()
      else if (field === 5 && (lk & 7) === 0) extent = layer.varint()
      else if (field === 2 && (lk & 7) === 2) {
        const feature = layer.sub()
        let type = 0
        let geometry: number[] = []
        while (!feature.done()) {
          const fk = feature.varint()
          if (fk >> 3 === 3 && (fk & 7) === 0) type = feature.varint()
          else if (fk >> 3 === 4 && (fk & 7) === 2) geometry = feature.packed()
          else feature.skip(fk & 7)
        }
        features.push({ type, geometry })
      } else layer.skip(lk & 7)
    }
    if (name !== layerName) continue
    for (const feature of features) {
      if (feature.type !== 3) continue
      const rings = decodeRings(feature.geometry)
      if (rings.length > 0) out.push({ rings, extent })
    }
  }
  return out
}

/** Even-odd rule over all rings: holes count as outside. */
export function insideRings(rings: readonly Ring[], px: number, py: number): boolean {
  let inside = false
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
      const [xi, yi] = ring[i] as [number, number]
      const [xj, yj] = ring[j] as [number, number]
      if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside
    }
  }
  return inside
}

/** True when the point (0…1 inside the tile) falls in any water polygon of the tile. */
export function pointInWaterTile(tile: Uint8Array, fx: number, fy: number): boolean {
  return layerPolygons(tile, 'water').some((polygon) =>
    insideRings(polygon.rings, fx * polygon.extent, fy * polygon.extent),
  )
}

/* --------------------------------------------------------------------------
   Network
   -------------------------------------------------------------------------- */

const TILEJSON = 'https://tiles.openfreemap.org/planet'
const TILE_HOST = 'tiles.openfreemap.org'

let template: { url: string; at: number } | null = null

export interface WaterOptions {
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

async function getBytes(url: string, fetchImpl: typeof fetch, signal: AbortSignal) {
  const response = await fetchImpl(url, {
    signal,
    redirect: 'error',
    headers: { 'User-Agent': 'BaliTripsStudio/1.0 (place check)' },
  })
  if (!response.ok) throw new Error(`status ${response.status}`)
  return new Uint8Array(await response.arrayBuffer())
}

/**
 * True: in the sea or a lake; false: on land; null: could not check (network,
 * timeout, unexpected data). Only ever requests tiles.openfreemap.org.
 */
export async function isInWater(
  lat: number,
  lon: number,
  { fetchImpl = fetch, timeoutMs = 5000 }: WaterOptions = {},
): Promise<boolean | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    if (template === null || Date.now() - template.at > 6 * 3600_000) {
      const bytes = await getBytes(TILEJSON, fetchImpl, controller.signal)
      const json = JSON.parse(new TextDecoder().decode(bytes)) as { tiles?: unknown }
      const first = Array.isArray(json.tiles) ? json.tiles[0] : null
      if (typeof first !== 'string') throw new Error('no tile URL in the TileJSON')
      const parsed = new URL(first.replace(/\{[xyz]\}/g, '0'))
      if (parsed.protocol !== 'https:' || parsed.hostname !== TILE_HOST) {
        throw new Error(`unexpected tile host ${parsed.hostname}`)
      }
      template = { url: first, at: Date.now() }
    }
    const { z, x, y, fx, fy } = tileAt(lat, lon)
    const url = template.url
      .replace('{z}', String(z))
      .replace('{x}', String(x))
      .replace('{y}', String(y))
    let tile = await getBytes(url, fetchImpl, controller.signal)
    // Normally decoded by fetch (Content-Encoding); a raw gzip body is unpacked here.
    if (tile[0] === 0x1f && tile[1] === 0x8b) tile = new Uint8Array(gunzipSync(tile))
    return pointInWaterTile(tile, fx, fy)
  } catch (error) {
    console.warn(
      '[water] check failed:',
      error instanceof Error ? error.message.slice(0, 200) : 'unknown',
    )
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** Tests only: forget the cached tile URL template. */
export function resetWaterCache(): void {
  template = null
}
