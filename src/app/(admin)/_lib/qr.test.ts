import { describe, expect, it } from 'vitest'

import { encodeQr, formatBits, qrToSvg, reedSolomon, type QrMatrix } from './qr'

/**
 * The encoder is verified by decoding its own output with an independently
 * written reader, and — more importantly — by checking the Reed–Solomon
 * syndromes. A syndrome check evaluates the codeword polynomial at the roots
 * of the generator directly, so it validates the encoder's arithmetic without
 * reusing any of the encoder's code. If the generator polynomial, the
 * remainder loop or the interleaving were wrong, the syndromes would not be
 * zero.
 *
 * The module geometry is checked against the specification's published
 * codeword counts: free modules must equal 8 x total codewords, plus the
 * remainder bits the format defines. That is an independent statement about
 * where the function patterns sit.
 */

const TOTAL_CODEWORDS = [26, 44, 70, 100, 134, 172]
const EC_PER_BLOCK = [7, 10, 15, 20, 26, 18]
const EC_BLOCKS = [1, 1, 1, 1, 1, 2]
/** Version 1 has no remainder bits; versions 2–6 have seven. */
const REMAINDER_BITS = [0, 7, 7, 7, 7, 7]

/* --------------------------------------------------------------------------
   An independent reader
   -------------------------------------------------------------------------- */

function versionOf(matrix: QrMatrix): number {
  return (matrix.size - 17) / 4
}

/** Function-module map, rebuilt from the specification's description. */
function functionMap(size: number): boolean[][] {
  const map = Array.from({ length: size }, () => new Array<boolean>(size).fill(false))
  const mark = (x: number, y: number) => {
    if (x >= 0 && y >= 0 && x < size && y < size) {
      const row = map[y]
      if (row) row[x] = true
    }
  }

  // Finders and their separators: a 9x9 block at three corners.
  for (const [cx, cy] of [
    [3, 3],
    [size - 4, 3],
    [3, size - 4],
  ] as const) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) mark(cx + dx, cy + dy)
    }
  }

  // Timing patterns.
  for (let i = 0; i < size; i++) {
    mark(6, i)
    mark(i, 6)
  }

  // Versions 2–6 carry a single alignment pattern opposite the finders.
  if (size > 21) {
    const centre = size - 7
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) mark(centre + dx, centre + dy)
    }
  }

  // Format information, in both copies.
  for (let i = 0; i < 9; i++) {
    mark(8, i)
    mark(i, 8)
  }
  for (let i = 0; i < 8; i++) {
    mark(size - 1 - i, 8)
    mark(8, size - 1 - i)
  }

  return map
}

function readFormat(matrix: QrMatrix): { level: number; mask: number } {
  const at = (x: number, y: number) => ((matrix.modules[y]?.[x] ?? false) ? 1 : 0)

  let raw = 0
  for (let i = 0; i <= 5; i++) raw |= at(8, i) << i
  raw |= at(8, 7) << 6
  raw |= at(8, 8) << 7
  raw |= at(7, 8) << 8
  for (let i = 9; i < 15; i++) raw |= at(14 - i, 8) << i

  const bits = raw ^ 0x5412

  // BCH(15,5): the unmasked word must be divisible by the generator.
  let remainder = bits
  for (let i = 14; i >= 10; i--) {
    if ((remainder >> i) & 1) remainder ^= 0x537 << (i - 10)
  }
  expect(remainder).toBe(0)

  const data = bits >> 10
  return { level: data >> 3, mask: data & 0b111 }
}

function maskAt(mask: number, x: number, y: number): boolean {
  const table: Record<number, boolean> = {
    0: (x + y) % 2 === 0,
    1: y % 2 === 0,
    2: x % 3 === 0,
    3: (x + y) % 3 === 0,
    4: (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
    5: ((x * y) % 2) + ((x * y) % 3) === 0,
    6: (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
    7: (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
  }
  return table[mask] ?? false
}

function readCodewords(matrix: QrMatrix, mask: number, count: number): Uint8Array {
  const size = matrix.size
  const map = functionMap(size)
  const bits: number[] = []

  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5
    for (let vertical = 0; vertical < size; vertical++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j
        const upward = ((right + 1) & 2) === 0
        const y = upward ? size - 1 - vertical : vertical
        if (map[y]?.[x]) continue

        const value = matrix.modules[y]?.[x] ?? false
        bits.push((value !== maskAt(mask, x, y) ? 1 : 0) as number)
      }
    }
  }

  const out = new Uint8Array(count)
  for (let i = 0; i < count; i++) {
    let byte = 0
    for (let j = 0; j < 8; j++) byte = (byte << 1) | (bits[i * 8 + j] ?? 0)
    out[i] = byte
  }
  return out
}

/** GF(256) arithmetic, written here so the test does not import the encoder's. */
function gf(): { mul: (a: number, b: number) => number; exp: (i: number) => number } {
  const exp = new Uint8Array(512)
  const log = new Uint8Array(256)
  let x = 1
  for (let i = 0; i < 255; i++) {
    exp[i] = x
    log[x] = i
    x = (x << 1) ^ (x & 0x80 ? 0x11d : 0)
    x &= 0xff
  }
  for (let i = 255; i < 512; i++) exp[i] = exp[i - 255] ?? 0

  return {
    mul: (a, b) => (a === 0 || b === 0 ? 0 : (exp[(log[a] ?? 0) + (log[b] ?? 0)] ?? 0)),
    exp: (i) => exp[i % 255] ?? 0,
  }
}

/** Zero syndromes mean the block is a valid Reed–Solomon codeword. */
function syndromesAreZero(block: Uint8Array, ecLength: number): boolean {
  const { mul, exp } = gf()
  for (let i = 0; i < ecLength; i++) {
    let value = 0
    for (const byte of block) value = mul(value, exp(i)) ^ byte
    if (value !== 0) return false
  }
  return true
}

function decode(matrix: QrMatrix): string {
  const version = versionOf(matrix)
  const total = TOTAL_CODEWORDS[version - 1] ?? 0
  const ecLength = EC_PER_BLOCK[version - 1] ?? 0
  const blockCount = EC_BLOCKS[version - 1] ?? 1

  const { level, mask } = readFormat(matrix)
  // Level L is 0b01 in the format field.
  expect(level).toBe(0b01)

  const interleaved = readCodewords(matrix, mask, total)

  const dataPerBlock = (total - ecLength * blockCount) / blockCount
  const blocks: number[][] = Array.from({ length: blockCount }, () => [])

  let index = 0
  for (let i = 0; i < dataPerBlock; i++) {
    for (let b = 0; b < blockCount; b++) blocks[b]?.push(interleaved[index++] ?? 0)
  }
  const ecBlocks: number[][] = Array.from({ length: blockCount }, () => [])
  for (let i = 0; i < ecLength; i++) {
    for (let b = 0; b < blockCount; b++) ecBlocks[b]?.push(interleaved[index++] ?? 0)
  }

  for (let b = 0; b < blockCount; b++) {
    const full = Uint8Array.from([...(blocks[b] ?? []), ...(ecBlocks[b] ?? [])])
    expect(syndromesAreZero(full, ecLength)).toBe(true)
  }

  const stream = blocks.flat()
  const bitAt = (position: number) => ((stream[position >> 3] ?? 0) >> (7 - (position & 7))) & 1
  const read = (start: number, width: number) => {
    let value = 0
    for (let i = 0; i < width; i++) value = (value << 1) | bitAt(start + i)
    return value
  }

  expect(read(0, 4)).toBe(0b0100)
  const length = read(4, 8)
  const bytes = Array.from({ length }, (_, i) => read(12 + i * 8, 8))
  return Buffer.from(bytes).toString('utf8')
}

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe('encodeQr', () => {
  it('places the function patterns so the free modules match the published codeword counts', () => {
    for (let version = 1; version <= 6; version++) {
      const size = 17 + 4 * version
      const map = functionMap(size)
      const free = map.flat().filter((reserved) => !reserved).length

      expect(free).toBe(
        (TOTAL_CODEWORDS[version - 1] ?? 0) * 8 + (REMAINDER_BITS[version - 1] ?? 0),
      )
    }
  })

  it('round-trips a TOTP enrolment URI', () => {
    const uri =
      'otpauth://totp/Bali%20Trips:ops@balitrips.example?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=Bali%20Trips'
    const matrix = encodeQr(uri)

    expect(matrix.size).toBe(17 + 4 * versionOf(matrix))
    expect(decode(matrix)).toBe(uri)
  })

  it('round-trips payloads across every version boundary it supports', () => {
    for (const length of [1, 17, 19, 32, 53, 78, 106, 133]) {
      const text = 'x'.repeat(length)
      expect(decode(encodeQr(text))).toBe(text)
    }
  })

  it('keeps the timing patterns intact where the format strip crosses them', () => {
    // (8,6) and (6,8) belong to the timing patterns, not to the format
    // strip. Blanking them is the classic off-by-one in this layout, and it
    // silently produces a code that will not scan.
    const matrix = encodeQr('timing')
    expect(matrix.modules[6]?.[8]).toBe(true)
    expect(matrix.modules[8]?.[6]).toBe(true)
  })

  it('sets the always-dark module', () => {
    const matrix = encodeQr('dark module')
    expect(matrix.modules[matrix.size - 8]?.[8]).toBe(true)
  })

  it('refuses a payload larger than version 6 can hold', () => {
    expect(() => encodeQr('x'.repeat(200))).toThrow(/stops at version 6/)
  })
})

describe('reedSolomon', () => {
  it('produces a codeword whose syndromes vanish', () => {
    const data = Uint8Array.from({ length: 19 }, (_, i) => (i * 37) % 256)
    const ec = reedSolomon(data, 7)
    expect(ec).toHaveLength(7)
    expect(syndromesAreZero(Uint8Array.from([...data, ...ec]), 7)).toBe(true)
  })
})

describe('formatBits', () => {
  it('is a valid BCH(15,5) word for every mask', () => {
    for (let mask = 0; mask < 8; mask++) {
      let remainder = formatBits(mask) ^ 0x5412
      for (let i = 14; i >= 10; i--) {
        if ((remainder >> i) & 1) remainder ^= 0x537 << (i - 10)
      }
      expect(remainder).toBe(0)
    }
  })
})

describe('qrToSvg', () => {
  it('renders a self-contained SVG with a quiet zone and an accessible name', () => {
    const svg = qrToSvg(encodeQr('hello'), { title: 'Two-factor enrolment' })

    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).toContain('role="img"')
    expect(svg).toContain('aria-label="Two-factor enrolment"')
    // 21 modules plus a four-module quiet zone on each side.
    expect(svg).toContain('viewBox="0 0 29 29"')
    expect(svg).not.toContain('http://www.w3.org/1999/xlink')
  })

  it('escapes the accessible name', () => {
    const svg = qrToSvg(encodeQr('x'), { title: '<script>&"' })
    expect(svg).toContain('aria-label="&lt;script&gt;&amp;&quot;"')
    expect(svg).not.toContain('<script>')
  })
})
