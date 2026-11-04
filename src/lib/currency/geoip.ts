/**
 * Offline IP → country lookup for the display currency.
 *
 * Data: @ip-location-db/geo-whois-asn-country (GeoFeed + WHOIS + ASN), which
 * is derived from NRO statistics — CC BY 4.0, attribution to nro.net (shown
 * in the site footer). No API key, no network: the two "-num" CSV files ship
 * inside the package and are traced into the standalone build
 * (next.config.ts → outputFileTracingIncludes).
 *
 * Loaded lazily on the first lookup and kept in compact typed arrays
 * (adjacent ranges of the same country merged). Any failure — missing file,
 * bad row — yields null, which means "unknown" and the SAR default.
 */

import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

const PACKAGE_DIR = path.join('node_modules', '@ip-location-db', 'geo-whois-asn-country')
const V4_FILE = 'geo-whois-asn-country-ipv4-num.csv'
const V6_FILE = 'geo-whois-asn-country-ipv6-num.csv'

type Table4 = { start: Uint32Array; end: Uint32Array; cc: Uint16Array }
type Table6 = {
  startHi: BigUint64Array
  startLo: BigUint64Array
  endHi: BigUint64Array
  endLo: BigUint64Array
  cc: Uint16Array
}

const MASK64 = (1n << 64n) - 1n

function encodeCc(code: string): number {
  return (code.charCodeAt(0) << 8) | code.charCodeAt(1)
}
function decodeCc(value: number): string {
  return String.fromCharCode(value >> 8, value & 0xff)
}

/** pnpm's virtual store, in case the top-level symlink was not traced. */
function pnpmStoreDir(): string | null {
  try {
    const store = path.join(process.cwd(), 'node_modules', '.pnpm')
    const hit = readdirSync(/*turbopackIgnore: true*/ store).find((d) =>
      d.startsWith('@ip-location-db+geo-whois-asn-country@'),
    )
    return hit ? path.join(store, hit, PACKAGE_DIR) : null
  } catch {
    return null
  }
}

function readData(file: string): string | null {
  const roots = [process.env.GEOIP_DATA_DIR, path.join(process.cwd(), PACKAGE_DIR), pnpmStoreDir()]
  for (const root of roots) {
    if (!root) continue
    // Not traced by the bundler on purpose: the data files are listed in
    // next.config.ts → outputFileTracingIncludes instead.
    const full = [root, file].join(path.sep)
    try {
      return readFileSync(/*turbopackIgnore: true*/ full, 'utf8')
    } catch {
      // try the next root
    }
  }
  return null
}

function rows(text: string): Array<[string, string, string]> {
  const out: Array<[string, string, string]> = []
  for (const line of text.split('\n')) {
    const [a, b, c] = line.split(',')
    if (a && b && c && /^[A-Z]{2}$/.test(c.trim())) out.push([a, b, c.trim()])
  }
  return out
}

/** Exported for tests: build from CSV text. */
export function buildTable4(text: string): Table4 {
  const starts: number[] = []
  const ends: number[] = []
  const ccs: number[] = []
  for (const [a, b, c] of rows(text)) {
    const s = Number(a)
    const e = Number(b)
    const cc = encodeCc(c)
    const last = ccs.length - 1
    if (last >= 0 && ccs[last] === cc && ends[last]! + 1 === s) {
      ends[last] = e
      continue
    }
    starts.push(s)
    ends.push(e)
    ccs.push(cc)
  }
  return { start: Uint32Array.from(starts), end: Uint32Array.from(ends), cc: Uint16Array.from(ccs) }
}

export function buildTable6(text: string): Table6 {
  const starts: bigint[] = []
  const ends: bigint[] = []
  const ccs: number[] = []
  for (const [a, b, c] of rows(text)) {
    const s = BigInt(a)
    const e = BigInt(b)
    const cc = encodeCc(c)
    const last = ccs.length - 1
    if (last >= 0 && ccs[last] === cc && ends[last]! + 1n === s) {
      ends[last] = e
      continue
    }
    starts.push(s)
    ends.push(e)
    ccs.push(cc)
  }
  return {
    startHi: BigUint64Array.from(starts, (v) => v >> 64n),
    startLo: BigUint64Array.from(starts, (v) => v & MASK64),
    endHi: BigUint64Array.from(ends, (v) => v >> 64n),
    endLo: BigUint64Array.from(ends, (v) => v & MASK64),
    cc: Uint16Array.from(ccs),
  }
}

let v4: Table4 | null | undefined
let v6: Table6 | null | undefined

function table4(): Table4 | null {
  if (v4 === undefined) {
    const text = readData(V4_FILE)
    v4 = text === null ? null : buildTable4(text)
  }
  return v4
}
function table6(): Table6 | null {
  if (v6 === undefined) {
    const text = readData(V6_FILE)
    v6 = text === null ? null : buildTable6(text)
  }
  return v6
}

function ipv4ToNumber(ip: string): number | null {
  const parts = ip.split('.')
  if (parts.length !== 4) return null
  let n = 0
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null
    const v = Number(part)
    if (v > 255) return null
    n = n * 256 + v
  }
  return n
}

function ipv6ToBigInt(ip: string): bigint | null {
  let value = ip.toLowerCase()
  // Embedded IPv4 tail (::ffff:1.2.3.4 is handled before we get here).
  const v4tail = /(\d{1,3}(?:\.\d{1,3}){3})$/.exec(value)
  if (v4tail?.[1]) {
    const n = ipv4ToNumber(v4tail[1])
    if (n === null) return null
    value =
      value.slice(0, -v4tail[1].length) +
      ((n >>> 16) & 0xffff).toString(16) +
      ':' +
      (n & 0xffff).toString(16)
  }
  const halves = value.split('::')
  if (halves.length > 2) return null
  const head = halves[0] ? halves[0].split(':') : []
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : []
  const missing = 8 - head.length - tail.length
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null
  const groups = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill('0'), ...tail]
  let n = 0n
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null
    n = (n << 16n) | BigInt(parseInt(g, 16))
  }
  return n
}

/** Private, loopback, link-local, CGNAT, ULA… never resolve to a country. */
function isPrivate4(n: number): boolean {
  const a = n >>> 24
  const b = (n >>> 16) & 0xff
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  )
}

function lookup4(n: number, t: Table4): string | null {
  let lo = 0
  let hi = t.start.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1
    if (t.start[mid]! > n) hi = mid - 1
    else if (t.end[mid]! < n) lo = mid + 1
    else return decodeCc(t.cc[mid]!)
  }
  return null
}

function lookup6(n: bigint, t: Table6): string | null {
  const nh = n >> 64n
  const nl = n & MASK64
  const lt = (ah: bigint, al: bigint, bh: bigint, bl: bigint) => ah < bh || (ah === bh && al < bl)
  let lo = 0
  let hi = t.startHi.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1
    if (lt(nh, nl, t.startHi[mid]!, t.startLo[mid]!)) hi = mid - 1
    else if (lt(t.endHi[mid]!, t.endLo[mid]!, nh, nl)) lo = mid + 1
    else return decodeCc(t.cc[mid]!)
  }
  return null
}

/** ISO 3166-1 alpha-2 for a normalized IP, or null when unknown/private. */
export function countryForIp(ip: string | null | undefined): string | null {
  if (!ip) return null
  try {
    if (ip.includes('.') && !ip.includes(':')) {
      const n = ipv4ToNumber(ip)
      if (n === null || isPrivate4(n)) return null
      const t = table4()
      return t ? lookup4(n, t) : null
    }
    const n = ipv6ToBigInt(ip)
    if (n === null) return null
    // ::ffff:a.b.c.d mapped addresses
    if (n >> 32n === 0xffffn)
      return countryForIp([24n, 16n, 8n, 0n].map((s) => Number((n >> s) & 0xffn)).join('.'))
    const top = Number(n >> 112n)
    // Only global unicast (2000::/3) is meaningful.
    if ((top & 0xe000) !== 0x2000) return null
    const t = table6()
    return t ? lookup6(n, t) : null
  } catch {
    return null
  }
}
