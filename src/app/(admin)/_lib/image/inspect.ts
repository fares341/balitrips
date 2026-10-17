/**
 * Image inspection and sanitisation.
 *
 * Everything an operator uploads is hostile until proved otherwise, and the
 * declared `Content-Type` on a multipart part is attacker-controlled — it is
 * a string the browser was told to send, not a fact about the bytes. So the
 * format is decided HERE, from the magic bytes, and the declared type is only
 * ever compared against the verdict.
 *
 * Two jobs:
 *
 *  1. **Sniff** — identify the container and read its intrinsic dimensions.
 *     A file that does not parse is rejected; a file whose declared type
 *     disagrees with its bytes is rejected.
 *  2. **Strip** — rewrite the container keeping only the chunks an image
 *     needs. This removes EXIF (which routinely carries the GPS coordinates
 *     of the photographer's home), XMP, IPTC, and PNG text chunks — the usual
 *     hiding places for both personal data and polyglot payloads.
 *
 * Colour-critical metadata (ICC profiles, gamma, chromaticity) is deliberately
 * KEPT: dropping an ICC profile from a wide-gamut photograph visibly shifts
 * its colours, and it carries no privacy or execution risk.
 *
 * SVG is rejected outright and is not merely absent from the allow-list: it is
 * XML with script and external-entity support, so a "logo.svg" in a
 * world-readable bucket served from the site's own origin is stored XSS.
 */

export type ImageFormat = 'jpeg' | 'png' | 'webp'

export interface InspectedImage {
  format: ImageFormat
  mimeType: string
  width: number
  height: number
}

/**
 * Why a file was refused, for the owner-facing message. The English `message`
 * stays technical (logs, tests); the Studio shows a plain sentence per reason.
 */
export type ImageRejectedReason = 'unreadable' | 'too_large' | 'too_narrow' | 'too_many_pixels'

export class ImageRejected extends Error {
  readonly reason: ImageRejectedReason
  readonly vars: Record<string, string | number>

  constructor(
    message: string,
    reason: ImageRejectedReason = 'unreadable',
    vars: Record<string, string | number> = {},
  ) {
    super(message)
    this.name = 'ImageRejected'
    this.reason = reason
    this.vars = vars
  }
}

export const ACCEPTED_MIME_TYPES: Record<ImageFormat, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
}

/**
 * Formats recognised but refused, with the reason an operator sees.
 *
 * Naming them beats a generic "unsupported file": an operator who uploaded a
 * HEIC straight off an iPhone needs to be told that, not left guessing.
 */
const REFUSED: { test: (bytes: Uint8Array) => boolean; reason: string }[] = [
  {
    test: (b) => startsWith(b, [0x3c, 0x3f, 0x78, 0x6d]) || containsSvgRoot(b),
    reason:
      'SVG is not accepted. It is executable XML, and serving one from the site origin is stored XSS. Export a PNG or JPEG instead.',
  },
  {
    test: (b) => startsWith(b, [0x47, 0x49, 0x46, 0x38]),
    reason: 'GIF is not accepted. Convert to WebP or PNG — animation belongs in a video element.',
  },
  {
    test: (b) => isFtyp(b, ['heic', 'heix', 'hevc', 'mif1', 'msf1']),
    reason:
      'HEIC/HEIF is not accepted — most browsers cannot display it. Export as JPEG before uploading.',
  },
  {
    test: (b) => isFtyp(b, ['avif', 'avis']),
    reason:
      'AVIF is a delivery format here, not a source format: derivatives are generated from the original. Upload the JPEG, PNG or WebP master.',
  },
  {
    test: (b) => startsWith(b, [0x25, 0x50, 0x44, 0x46]),
    reason: 'That is a PDF, not an image.',
  },
  {
    test: (b) => startsWith(b, [0x50, 0x4b, 0x03, 0x04]),
    reason: 'That is a zip archive (or an Office document), not an image.',
  },
]

/* --------------------------------------------------------------------------
   Sniffing
   -------------------------------------------------------------------------- */

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  if (bytes.length < signature.length) return false
  return signature.every((byte, index) => bytes[index] === byte)
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  if (bytes.length < offset + length) return ''
  return Buffer.from(bytes.subarray(offset, offset + length)).toString('latin1')
}

/** ISO base-media container with one of the given brands. */
function isFtyp(bytes: Uint8Array, brands: readonly string[]): boolean {
  if (ascii(bytes, 4, 4) !== 'ftyp') return false
  const major = ascii(bytes, 8, 4)
  if (brands.includes(major)) return true
  // Compatible brands follow the major brand and its minor version.
  for (let offset = 16; offset + 4 <= Math.min(bytes.length, 64); offset += 4) {
    if (brands.includes(ascii(bytes, offset, 4))) return true
  }
  return false
}

/** A leading `<svg` after optional whitespace, or an XML prologue. */
function containsSvgRoot(bytes: Uint8Array): boolean {
  const head = ascii(bytes, 0, Math.min(bytes.length, 256)).toLowerCase()
  return head.trimStart().startsWith('<svg') || head.includes('<svg')
}

/**
 * Identify the bytes and read the dimensions.
 *
 * `declaredMime` is checked only for agreement — it never selects the parser.
 */
export function inspectImage(bytes: Uint8Array, declaredMime?: string | null): InspectedImage {
  if (bytes.length < 16) throw new ImageRejected('That file is too small to be an image.')

  for (const refusal of REFUSED) {
    if (refusal.test(bytes)) throw new ImageRejected(refusal.reason)
  }

  const inspected = sniffJpeg(bytes) ?? sniffPng(bytes) ?? sniffWebp(bytes)
  if (!inspected) {
    throw new ImageRejected(
      'Unrecognised file. Accepted formats are JPEG, PNG and WebP, identified by their contents rather than their name.',
    )
  }

  if (inspected.width < 1 || inspected.height < 1) {
    throw new ImageRejected('That image reports zero width or height and cannot be used.')
  }

  const declared = (declaredMime ?? '').split(';')[0]?.trim().toLowerCase() ?? ''
  if (
    declared !== '' &&
    declared !== inspected.mimeType &&
    declared !== 'application/octet-stream'
  ) {
    throw new ImageRejected(
      `The file claims to be ${declared} but its contents are ${inspected.mimeType}. Refusing it — a mismatch is either a broken export or an attempt to smuggle a different file type.`,
    )
  }

  return inspected
}

function sniffJpeg(bytes: Uint8Array): InspectedImage | null {
  if (!startsWith(bytes, [0xff, 0xd8, 0xff])) return null

  const view = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let offset = 2

  while (offset + 4 <= view.length) {
    if (view[offset] !== 0xff) {
      offset += 1
      continue
    }

    const marker = view[offset + 1] ?? 0
    // Padding and standalone markers carry no length field.
    if (marker === 0xff) {
      offset += 1
      continue
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      offset += 2
      continue
    }

    const length = view.readUInt16BE(offset + 2)
    if (length < 2) throw new ImageRejected('Malformed JPEG: a segment declares a negative length.')

    const isStartOfFrame =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc

    if (isStartOfFrame) {
      if (offset + 9 > view.length) break
      return {
        format: 'jpeg',
        mimeType: 'image/jpeg',
        height: view.readUInt16BE(offset + 5),
        width: view.readUInt16BE(offset + 7),
      }
    }

    // Scan data is not segmented; dimensions always precede it.
    if (marker === 0xda) break
    offset += 2 + length
  }

  throw new ImageRejected('Malformed JPEG: no frame header, so its dimensions are unknowable.')
}

function sniffPng(bytes: Uint8Array): InspectedImage | null {
  if (!startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return null
  if (bytes.length < 24 || ascii(bytes, 12, 4) !== 'IHDR') {
    throw new ImageRejected('Malformed PNG: the header chunk is missing.')
  }

  const view = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return {
    format: 'png',
    mimeType: 'image/png',
    width: view.readUInt32BE(16),
    height: view.readUInt32BE(20),
  }
}

function sniffWebp(bytes: Uint8Array): InspectedImage | null {
  if (ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WEBP') return null

  const view = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const chunk = ascii(bytes, 12, 4)
  const data = 20

  // Lossy: the VP8 keyframe header carries 14-bit dimensions.
  if (chunk === 'VP8 ' && view.length >= data + 10) {
    return {
      format: 'webp',
      mimeType: 'image/webp',
      width: view.readUInt16LE(data + 6) & 0x3fff,
      height: view.readUInt16LE(data + 8) & 0x3fff,
    }
  }

  // Lossless: 14 bits each, packed little-endian, stored minus one.
  if (chunk === 'VP8L' && view.length >= data + 5) {
    const packed = view.readUInt32LE(data + 1)
    return {
      format: 'webp',
      mimeType: 'image/webp',
      width: (packed & 0x3fff) + 1,
      height: ((packed >> 14) & 0x3fff) + 1,
    }
  }

  // Extended: canvas size as two 24-bit values, stored minus one.
  if (chunk === 'VP8X' && view.length >= data + 10) {
    return {
      format: 'webp',
      mimeType: 'image/webp',
      width: view.readUIntLE(data + 4, 3) + 1,
      height: view.readUIntLE(data + 7, 3) + 1,
    }
  }

  throw new ImageRejected('Malformed WebP: no readable image chunk.')
}

/* --------------------------------------------------------------------------
   Metadata stripping
   -------------------------------------------------------------------------- */

/**
 * JPEG application segments that are kept.
 *
 * APP0 (JFIF density), APP2 (ICC colour profile) and APP14 (Adobe colour
 * transform) change how the image is *decoded*. Everything else — APP1 EXIF
 * and XMP, APP13 IPTC, and comments — is metadata about the photograph and is
 * dropped.
 */
const JPEG_KEEP_APP = new Set([0xe0, 0xe2, 0xee])

/** PNG chunks that are kept: critical, transparency and colour management. */
const PNG_KEEP = new Set([
  'IHDR',
  'PLTE',
  'IDAT',
  'IEND',
  'tRNS',
  'gAMA',
  'cHRM',
  'sRGB',
  'iCCP',
  'sBIT',
  'pHYs',
])

/** RIFF chunks that are kept. `EXIF` and `XMP ` are dropped. */
const WEBP_KEEP = new Set(['VP8 ', 'VP8L', 'VP8X', 'ALPH', 'ANIM', 'ANMF', 'ICCP'])

/**
 * Rewrite the container without its metadata.
 *
 * This is a container rewrite, not a re-encode: the compressed image data is
 * copied through untouched, so it is lossless and fast. Full re-encoding
 * happens in the derivative pipeline, which needs a real codec.
 */
export function stripMetadata(bytes: Uint8Array, format: ImageFormat): Uint8Array {
  if (format === 'jpeg') return stripJpeg(bytes)
  if (format === 'png') return stripPng(bytes)
  return stripWebp(bytes)
}

function stripJpeg(bytes: Uint8Array): Uint8Array {
  const view = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const parts: Buffer[] = [Buffer.from([0xff, 0xd8])]
  let offset = 2

  while (offset + 2 <= view.length) {
    if (view[offset] !== 0xff) break

    const marker = view[offset + 1] ?? 0
    if (marker === 0xff) {
      offset += 1
      continue
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      parts.push(Buffer.from(view.subarray(offset, offset + 2)))
      offset += 2
      continue
    }
    if (offset + 4 > view.length) break

    const length = view.readUInt16BE(offset + 2)
    const end = offset + 2 + length
    if (length < 2 || end > view.length) break

    // Start of scan: everything from here to the end is entropy-coded data
    // and the EOI marker. Copy it verbatim.
    if (marker === 0xda) {
      parts.push(Buffer.from(view.subarray(offset)))
      offset = view.length
      break
    }

    const isApp = marker >= 0xe0 && marker <= 0xef
    const isComment = marker === 0xfe
    const drop = (isApp && !JPEG_KEEP_APP.has(marker)) || isComment

    if (!drop) parts.push(Buffer.from(view.subarray(offset, end)))
    offset = end
  }

  return Uint8Array.from(Buffer.concat(parts))
}

function stripPng(bytes: Uint8Array): Uint8Array {
  const view = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const parts: Buffer[] = [Buffer.from(view.subarray(0, 8))]
  let offset = 8

  while (offset + 8 <= view.length) {
    const length = view.readUInt32BE(offset)
    const type = view.toString('latin1', offset + 4, offset + 8)
    const end = offset + 12 + length
    if (end > view.length) break

    if (PNG_KEEP.has(type)) parts.push(Buffer.from(view.subarray(offset, end)))

    offset = end
    if (type === 'IEND') break
  }

  return Uint8Array.from(Buffer.concat(parts))
}

function stripWebp(bytes: Uint8Array): Uint8Array {
  const view = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const parts: Buffer[] = []
  let offset = 12

  while (offset + 8 <= view.length) {
    const type = view.toString('latin1', offset, offset + 4)
    const length = view.readUInt32LE(offset + 4)
    // RIFF chunks are padded to an even length; the pad byte is not counted.
    const padded = length + (length % 2)
    const end = offset + 8 + padded
    if (end > view.length) break

    if (WEBP_KEEP.has(type)) parts.push(Buffer.from(view.subarray(offset, end)))
    offset = end
  }

  const body = Buffer.concat(parts)
  const header = Buffer.alloc(12)
  header.write('RIFF', 0, 'latin1')
  // The RIFF size covers everything after this field, including 'WEBP'.
  header.writeUInt32LE(body.byteLength + 4, 4)
  header.write('WEBP', 8, 'latin1')

  return Uint8Array.from(Buffer.concat([header, body]))
}
