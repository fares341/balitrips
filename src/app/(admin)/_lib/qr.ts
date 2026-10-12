/**
 * QR encoder — byte mode, error-correction level L, versions 1 to 6.
 *
 * Why hand-rolled rather than a package: the payload is a TOTP enrolment URI,
 * which contains the shared secret. Rendering it through a hosted QR service
 * would post that secret to a third party, and it is the one string in this
 * system that must never leave it. That rules out every remote generator, and
 * the local ones are a dependency for ~250 lines of well-specified arithmetic.
 *
 * Scope is deliberately narrow. Versions 1–6 at level L hold 136 data
 * codewords, comfortably more than the ~110-character `otpauth://` URI, and
 * stopping at 6 keeps two awkward parts of the specification out of the code
 * entirely: the version-information block (only present from version 7) and
 * the multi-row alignment-pattern grid.
 *
 * The module geometry is verified against the specification's codeword counts
 * in the test file — the number of free modules divided by eight must equal
 * the published total for that version, which is an independent check that the
 * function patterns are in the right places.
 *
 * Reference: ISO/IEC 18004. Structure follows the same shape as Nayuki's
 * reference implementation, which is the clearest published description of the
 * placement and masking rules.
 */

/** Total codewords per version (data + error correction). */
const TOTAL_CODEWORDS = [26, 44, 70, 100, 134, 172] as const

/** Level-L error-correction codewords per block, and block count, per version. */
const EC_PER_BLOCK = [7, 10, 15, 20, 26, 18] as const
const EC_BLOCKS = [1, 1, 1, 1, 1, 2] as const

const MAX_VERSION = 6

export interface QrMatrix {
  size: number
  /** Row-major. `true` is a dark module. */
  modules: boolean[][]
}

/* --------------------------------------------------------------------------
   GF(256)
   -------------------------------------------------------------------------- */

const EXP = new Uint8Array(512)
const LOG = new Uint8Array(256)

{
  let x = 1
  for (let i = 0; i < 255; i++) {
    EXP[i] = x
    LOG[x] = i
    // Multiply by the primitive element, reducing modulo x^8+x^4+x^3+x^2+1.
    x <<= 1
    if (x & 0x100) x ^= 0x11d
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255] ?? 0
}

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0
  return EXP[(LOG[a] ?? 0) + (LOG[b] ?? 0)] ?? 0
}

/**
 * Generator polynomial for `degree` error-correction codewords.
 *
 * Coefficients descending, so index 0 is the x^degree term and is always 1.
 * The remainder loop below relies on that ordering.
 */
function generatorPoly(degree: number): Uint8Array {
  let poly = Uint8Array.from([1])
  for (let i = 0; i < degree; i++) {
    const next = new Uint8Array(poly.length + 1)
    for (let j = 0; j < poly.length; j++) {
      const coefficient = poly[j] ?? 0
      // Multiply by (x + alpha^i): the x term shifts up a degree, the
      // constant term scales.
      next[j] = (next[j] ?? 0) ^ coefficient
      next[j + 1] = (next[j + 1] ?? 0) ^ gfMul(coefficient, EXP[i] ?? 0)
    }
    poly = next
  }
  return poly
}

/** Reed–Solomon remainder for one block. */
export function reedSolomon(data: Uint8Array, ecLength: number): Uint8Array {
  const generator = generatorPoly(ecLength)
  const remainder = new Uint8Array(ecLength)

  for (const byte of data) {
    const factor = byte ^ (remainder[0] ?? 0)
    remainder.copyWithin(0, 1)
    remainder[ecLength - 1] = 0
    if (factor !== 0) {
      for (let i = 0; i < ecLength; i++) {
        remainder[i] = (remainder[i] ?? 0) ^ gfMul(generator[i + 1] ?? 0, factor)
      }
    }
  }

  return remainder
}

/* --------------------------------------------------------------------------
   Bit stream
   -------------------------------------------------------------------------- */

function chooseVersion(byteLength: number): number {
  for (let version = 1; version <= MAX_VERSION; version++) {
    if (byteLength + 2 <= dataCodewords(version)) return version
  }
  throw new Error(
    `That payload is ${byteLength} bytes; this encoder stops at version ${MAX_VERSION} (${dataCodewords(MAX_VERSION) - 2} bytes).`,
  )
}

function dataCodewords(version: number): number {
  const index = version - 1
  return (TOTAL_CODEWORDS[index] ?? 0) - (EC_PER_BLOCK[index] ?? 0) * (EC_BLOCKS[index] ?? 0)
}

/**
 * Mode indicator, character count, payload, terminator and padding.
 *
 * The character count is eight bits wide for versions 1–9 in byte mode.
 */
function buildDataCodewords(payload: Uint8Array, version: number): Uint8Array {
  const capacity = dataCodewords(version)
  const bits: number[] = []

  const push = (value: number, width: number) => {
    for (let i = width - 1; i >= 0; i--) bits.push((value >> i) & 1)
  }

  push(0b0100, 4)
  push(payload.length, 8)
  for (const byte of payload) push(byte, 8)

  // Terminator: up to four zero bits, then pad to a byte boundary.
  const remaining = capacity * 8 - bits.length
  push(0, Math.min(4, remaining))
  while (bits.length % 8 !== 0) bits.push(0)

  const codewords = new Uint8Array(capacity)
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0
    for (let j = 0; j < 8; j++) byte = (byte << 1) | (bits[i + j] ?? 0)
    codewords[i / 8] = byte
  }

  // The specification's alternating pad bytes.
  for (let i = bits.length / 8, alternate = true; i < capacity; i++, alternate = !alternate) {
    codewords[i] = alternate ? 0xec : 0x11
  }

  return codewords
}

/** Split into blocks, add error correction, interleave. */
function interleave(dataWords: Uint8Array, version: number): Uint8Array {
  const index = version - 1
  const blockCount = EC_BLOCKS[index] ?? 1
  const ecLength = EC_PER_BLOCK[index] ?? 0
  const perBlock = dataWords.length / blockCount

  const dataBlocks: Uint8Array[] = []
  const ecBlocks: Uint8Array[] = []

  for (let i = 0; i < blockCount; i++) {
    const block = dataWords.subarray(i * perBlock, (i + 1) * perBlock)
    dataBlocks.push(block)
    ecBlocks.push(reedSolomon(block, ecLength))
  }

  const out: number[] = []
  for (let i = 0; i < perBlock; i++) {
    for (const block of dataBlocks) out.push(block[i] ?? 0)
  }
  for (let i = 0; i < ecLength; i++) {
    for (const block of ecBlocks) out.push(block[i] ?? 0)
  }

  return Uint8Array.from(out)
}

/* --------------------------------------------------------------------------
   Matrix
   -------------------------------------------------------------------------- */

interface Canvas {
  size: number
  modules: boolean[][]
  /** Function modules are never masked and never carry data. */
  reserved: boolean[][]
}

function blankCanvas(size: number): Canvas {
  return {
    size,
    modules: Array.from({ length: size }, () => new Array<boolean>(size).fill(false)),
    reserved: Array.from({ length: size }, () => new Array<boolean>(size).fill(false)),
  }
}

function setFunction(canvas: Canvas, x: number, y: number, dark: boolean): void {
  if (x < 0 || y < 0 || x >= canvas.size || y >= canvas.size) return
  const row = canvas.modules[y]
  const reservedRow = canvas.reserved[y]
  if (!row || !reservedRow) return
  row[x] = dark
  reservedRow[x] = true
}

function isReserved(canvas: Canvas, x: number, y: number): boolean {
  return canvas.reserved[y]?.[x] ?? true
}

function drawFinder(canvas: Canvas, cx: number, cy: number): void {
  for (let dy = -4; dy <= 4; dy++) {
    for (let dx = -4; dx <= 4; dx++) {
      // Chebyshev distance: rings at 0-1 and 3 are dark, 2 and 4 are light.
      const distance = Math.max(Math.abs(dx), Math.abs(dy))
      setFunction(canvas, cx + dx, cy + dy, distance !== 2 && distance !== 4)
    }
  }
}

function drawAlignment(canvas: Canvas, cx: number, cy: number): void {
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      setFunction(canvas, cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1)
    }
  }
}

function drawFunctionPatterns(canvas: Canvas, version: number): void {
  const { size } = canvas

  // Timing patterns run the full width and height; the finders overwrite
  // their ends with identical values.
  for (let i = 0; i < size; i++) {
    setFunction(canvas, 6, i, i % 2 === 0)
    setFunction(canvas, i, 6, i % 2 === 0)
  }

  drawFinder(canvas, 3, 3)
  drawFinder(canvas, size - 4, 3)
  drawFinder(canvas, 3, size - 4)

  // Versions 2–6 carry exactly one extra alignment pattern, at the corner
  // opposite the three finders.
  if (version >= 2) {
    const centre = size - 7
    drawAlignment(canvas, centre, centre)
  }

  // Reserve the format-information strips, plus the always-dark module.
  //
  // Index 6 is skipped in both directions: (8,6) and (6,8) belong to the
  // timing patterns, which run the full width and height. The format strip
  // steps around them — writing here would blank two timing modules and the
  // code would stop scanning.
  for (let i = 0; i < 9; i++) {
    if (i === 6) continue
    setFunction(canvas, 8, i, false)
    setFunction(canvas, i, 8, false)
  }
  for (let i = 0; i < 8; i++) {
    setFunction(canvas, size - 1 - i, 8, false)
    setFunction(canvas, 8, size - 1 - i, false)
  }
  setFunction(canvas, 8, size - 8, true)
}

/** BCH(15,5)-protected format information for level L and the given mask. */
export function formatBits(mask: number): number {
  // Level L is 0b01 in the format field.
  const data = (0b01 << 3) | mask
  let remainder = data
  for (let i = 0; i < 10; i++) {
    remainder = (remainder << 1) ^ ((remainder >> 9) * 0x537)
  }
  return ((data << 10) | remainder) ^ 0x5412
}

function drawFormat(canvas: Canvas, mask: number): void {
  const bits = formatBits(mask)
  const bit = (index: number) => ((bits >> index) & 1) === 1
  const { size } = canvas

  for (let i = 0; i <= 5; i++) setFunction(canvas, 8, i, bit(i))
  setFunction(canvas, 8, 7, bit(6))
  setFunction(canvas, 8, 8, bit(7))
  setFunction(canvas, 7, 8, bit(8))
  for (let i = 9; i < 15; i++) setFunction(canvas, 14 - i, 8, bit(i))

  for (let i = 0; i < 8; i++) setFunction(canvas, size - 1 - i, 8, bit(i))
  for (let i = 8; i < 15; i++) setFunction(canvas, 8, size - 15 + i, bit(i))
  setFunction(canvas, 8, size - 8, true)
}

/**
 * Zigzag placement: two-module columns, right to left, alternating direction,
 * skipping the vertical timing pattern in column 6.
 */
function drawCodewords(canvas: Canvas, codewords: Uint8Array): void {
  const { size } = canvas
  let bitIndex = 0

  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5
    for (let vertical = 0; vertical < size; vertical++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j
        const upward = ((right + 1) & 2) === 0
        const y = upward ? size - 1 - vertical : vertical

        if (isReserved(canvas, x, y)) continue
        if (bitIndex >= codewords.length * 8) continue

        const byte = codewords[bitIndex >>> 3] ?? 0
        const row = canvas.modules[y]
        if (row) row[x] = ((byte >> (7 - (bitIndex & 7))) & 1) === 1
        bitIndex++
      }
    }
  }
}

function maskAt(mask: number, x: number, y: number): boolean {
  switch (mask) {
    case 0:
      return (x + y) % 2 === 0
    case 1:
      return y % 2 === 0
    case 2:
      return x % 3 === 0
    case 3:
      return (x + y) % 3 === 0
    case 4:
      return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0
    case 5:
      return ((x * y) % 2) + ((x * y) % 3) === 0
    case 6:
      return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0
    default:
      return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0
  }
}

function applyMask(canvas: Canvas, mask: number): void {
  for (let y = 0; y < canvas.size; y++) {
    const row = canvas.modules[y]
    if (!row) continue
    for (let x = 0; x < canvas.size; x++) {
      if (isReserved(canvas, x, y)) continue
      if (maskAt(mask, x, y)) row[x] = !row[x]
    }
  }
}

/**
 * Penalty score, per the four rules in the specification. Lower is better;
 * the mask with the lowest score is the one that ships.
 */
function penalty(canvas: Canvas): number {
  const { size, modules } = canvas
  const at = (x: number, y: number) => modules[y]?.[x] ?? false
  let score = 0

  // Rule 1: runs of five or more same-coloured modules in a line.
  for (let i = 0; i < size; i++) {
    for (const horizontal of [true, false]) {
      let run = 1
      for (let j = 1; j < size; j++) {
        const current = horizontal ? at(j, i) : at(i, j)
        const previous = horizontal ? at(j - 1, i) : at(i, j - 1)
        if (current === previous) {
          run++
          if (run === 5) score += 3
          else if (run > 5) score += 1
        } else {
          run = 1
        }
      }
    }
  }

  // Rule 2: 2x2 blocks of one colour.
  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const value = at(x, y)
      if (value === at(x + 1, y) && value === at(x, y + 1) && value === at(x + 1, y + 1)) {
        score += 3
      }
    }
  }

  // Rule 3: finder-like 1:1:3:1:1 patterns, which confuse a scanner.
  const pattern = [true, false, true, true, true, false, true]
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      for (const horizontal of [true, false]) {
        if (horizontal ? x + 10 >= size : y + 10 >= size) continue
        const matches = pattern.every((expected, offset) =>
          horizontal ? at(x + offset, y) === expected : at(x, y + offset) === expected,
        )
        if (!matches) continue
        const clear = [7, 8, 9, 10].every((offset) =>
          horizontal ? !at(x + offset, y) : !at(x, y + offset),
        )
        if (clear) score += 40
      }
    }
  }

  // Rule 4: deviation from an even balance of dark and light.
  let dark = 0
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) if (at(x, y)) dark++
  }
  const percent = (dark * 100) / (size * size)
  score += Math.floor(Math.abs(percent - 50) / 5) * 10

  return score
}

/* --------------------------------------------------------------------------
   Public API
   -------------------------------------------------------------------------- */

/** Encode a string (UTF-8) into a QR matrix. */
export function encodeQr(text: string): QrMatrix {
  const payload = Uint8Array.from(Buffer.from(text, 'utf8'))
  const version = chooseVersion(payload.length)
  const codewords = interleave(buildDataCodewords(payload, version), version)
  const size = 17 + 4 * version

  let best: Canvas | null = null
  let bestScore = Number.POSITIVE_INFINITY

  for (let mask = 0; mask < 8; mask++) {
    const canvas = blankCanvas(size)
    drawFunctionPatterns(canvas, version)
    drawCodewords(canvas, codewords)
    drawFormat(canvas, mask)
    applyMask(canvas, mask)

    const score = penalty(canvas)
    if (score < bestScore) {
      bestScore = score
      best = canvas
    }
  }

  if (!best) throw new Error('QR encoding produced no candidate')
  return { size: best.size, modules: best.modules }
}

/**
 * Render as an inline SVG string.
 *
 * One `<path>` of rectangles rather than one element per module: a version-6
 * code is 41x41, and 1681 DOM nodes in a server-rendered page is a waste of
 * bytes and layout time.
 *
 * The quiet zone is four modules on every side. It is not decoration — a code
 * printed or screenshotted flush to a dark background often will not scan.
 */
export function qrToSvg(matrix: QrMatrix, options: { size?: number; title: string }): string {
  const quiet = 4
  const extent = matrix.size + quiet * 2
  const pixels = options.size ?? 220

  let path = ''
  for (let y = 0; y < matrix.size; y++) {
    const row = matrix.modules[y]
    if (!row) continue
    for (let x = 0; x < matrix.size; x++) {
      if (row[x]) path += `M${x + quiet} ${y + quiet}h1v1h-1z`
    }
  }

  const title = options.title.replace(/[<>&"]/g, (char) => {
    if (char === '<') return '&lt;'
    if (char === '>') return '&gt;'
    if (char === '&') return '&amp;'
    return '&quot;'
  })

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${extent} ${extent}"`,
    ` width="${pixels}" height="${pixels}" role="img" aria-label="${title}"`,
    ' shape-rendering="crispEdges">',
    `<rect width="${extent}" height="${extent}" fill="#ffffff"/>`,
    `<path d="${path}" fill="#0f2e1d"/>`,
    '</svg>',
  ].join('')
}
