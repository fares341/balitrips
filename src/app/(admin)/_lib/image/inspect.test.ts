import { describe, expect, it } from 'vitest'

import { inspectImage, ImageRejected, stripMetadata } from './inspect'
import { derivativesFor, originalKey, rungsFor } from './pipeline'

/* --------------------------------------------------------------------------
   Fixtures — hand-built containers, so the parser is tested rather than a
   library's idea of a file.
   -------------------------------------------------------------------------- */

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.byteLength)
  // CRC is not verified by the parser (a corrupt image fails at decode, which
  // is the decoder's job), so a placeholder keeps the fixture readable.
  return Buffer.concat([length, Buffer.from(type, 'latin1'), data, Buffer.alloc(4)])
}

function png({ width, height }: { width: number; height: number }): Uint8Array {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6

  return Uint8Array.from(
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      pngChunk('IHDR', ihdr),
      pngChunk('iCCP', Buffer.from('profile\0\0colour-critical', 'latin1')),
      pngChunk('tEXt', Buffer.from('Comment\0shot at home', 'latin1')),
      pngChunk('eXIf', Buffer.from('gps-coordinates-of-the-photographer', 'latin1')),
      pngChunk('IDAT', Buffer.from([0x78, 0x9c, 0x63, 0x00, 0x00, 0x00, 0x01])),
      pngChunk('IEND', Buffer.alloc(0)),
    ]),
  )
}

function jpegSegment(marker: number, payload: Buffer): Buffer {
  const header = Buffer.alloc(4)
  header[0] = 0xff
  header[1] = marker
  header.writeUInt16BE(payload.byteLength + 2, 2)
  return Buffer.concat([header, payload])
}

function jpeg({ width, height }: { width: number; height: number }): Uint8Array {
  const sof = Buffer.alloc(15)
  sof[0] = 8
  sof.writeUInt16BE(height, 1)
  sof.writeUInt16BE(width, 3)
  sof[5] = 3

  return Uint8Array.from(
    Buffer.concat([
      Buffer.from([0xff, 0xd8]),
      jpegSegment(0xe0, Buffer.from('JFIF\0\0\0\0\0\0', 'latin1')),
      jpegSegment(0xe1, Buffer.from('Exif\0\0GPS 8.5069S 115.2625E', 'latin1')),
      jpegSegment(0xe2, Buffer.from('ICC_PROFILE\0colour-critical', 'latin1')),
      jpegSegment(0xed, Buffer.from('Photoshop 3.0\0iptc-credit-line', 'latin1')),
      jpegSegment(0xfe, Buffer.from('a comment', 'latin1')),
      jpegSegment(0xdb, Buffer.alloc(65)),
      jpegSegment(0xc0, sof),
      jpegSegment(0xda, Buffer.from([0x01, 0x01, 0x00, 0x00, 0x3f, 0x00])),
      Buffer.from([0x12, 0x34, 0x56, 0xff, 0xd9]),
    ]),
  )
}

function riffChunk(type: string, data: Buffer): Buffer {
  const header = Buffer.alloc(8)
  header.write(type, 0, 'latin1')
  header.writeUInt32LE(data.byteLength, 4)
  const pad = data.byteLength % 2 === 1 ? Buffer.alloc(1) : Buffer.alloc(0)
  return Buffer.concat([header, data, pad])
}

function webpLossless({ width, height }: { width: number; height: number }): Uint8Array {
  const vp8l = Buffer.alloc(9)
  vp8l[0] = 0x2f
  // 14 bits of (width - 1), then 14 bits of (height - 1), little-endian.
  vp8l.writeUInt32LE((width - 1) | ((height - 1) << 14), 1)

  const body = Buffer.concat([
    Buffer.from('WEBP', 'latin1'),
    riffChunk('VP8L', vp8l),
    riffChunk('EXIF', Buffer.from('gps-coordinates', 'latin1')),
    riffChunk('XMP ', Buffer.from('<x:xmpmeta/>', 'latin1')),
  ])

  const header = Buffer.alloc(8)
  header.write('RIFF', 0, 'latin1')
  header.writeUInt32LE(body.byteLength, 4)

  return Uint8Array.from(Buffer.concat([header, body]))
}

function contains(bytes: Uint8Array, needle: string): boolean {
  return Buffer.from(bytes).toString('latin1').includes(needle)
}

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe('inspectImage', () => {
  it('reads PNG dimensions from IHDR', () => {
    expect(inspectImage(png({ width: 1600, height: 900 }))).toEqual({
      format: 'png',
      mimeType: 'image/png',
      width: 1600,
      height: 900,
    })
  })

  it('reads JPEG dimensions from the frame header, past the metadata segments', () => {
    expect(inspectImage(jpeg({ width: 4032, height: 3024 }))).toEqual({
      format: 'jpeg',
      mimeType: 'image/jpeg',
      width: 4032,
      height: 3024,
    })
  })

  it('reads lossless WebP dimensions from the packed VP8L header', () => {
    expect(inspectImage(webpLossless({ width: 1280, height: 720 }))).toEqual({
      format: 'webp',
      mimeType: 'image/webp',
      width: 1280,
      height: 720,
    })
  })

  it('trusts the bytes, not the declared type', () => {
    // The classic upload bypass: a PNG announced as a JPEG, or anything
    // announced as an image to get past a naive allow-list.
    expect(() => inspectImage(png({ width: 800, height: 600 }), 'image/jpeg')).toThrow(
      ImageRejected,
    )
    expect(() => inspectImage(png({ width: 800, height: 600 }), 'image/png')).not.toThrow()
  })

  it('accepts a declared type with parameters and a generic octet-stream', () => {
    expect(inspectImage(png({ width: 800, height: 600 }), 'image/png; charset=binary').width).toBe(
      800,
    )
    expect(inspectImage(png({ width: 800, height: 600 }), 'application/octet-stream').width).toBe(
      800,
    )
  })

  it('refuses SVG by name, however it is declared', () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>', 'latin1')
    expect(() => inspectImage(Uint8Array.from(svg), 'image/png')).toThrow(/SVG is not accepted/)
  })

  it('refuses GIF, HEIC, AVIF sources, PDF and zip with a specific reason', () => {
    const gif = Uint8Array.from(Buffer.from('GIF89a\0\0\0\0\0\0\0\0\0\0', 'latin1'))
    expect(() => inspectImage(gif)).toThrow(/GIF is not accepted/)

    const heic = Uint8Array.from(
      Buffer.concat([Buffer.alloc(4), Buffer.from('ftypheic', 'latin1'), Buffer.alloc(8)]),
    )
    expect(() => inspectImage(heic)).toThrow(/HEIC/)

    const avif = Uint8Array.from(
      Buffer.concat([Buffer.alloc(4), Buffer.from('ftypavif', 'latin1'), Buffer.alloc(8)]),
    )
    expect(() => inspectImage(avif)).toThrow(/delivery format/)

    const pdf = Uint8Array.from(Buffer.from('%PDF-1.7\n%????\n1 0 obj', 'latin1'))
    expect(() => inspectImage(pdf)).toThrow(/PDF/)

    const zip = Uint8Array.from(
      Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(20)]),
    )
    expect(() => inspectImage(zip)).toThrow(/zip archive/)
  })

  it('refuses anything unrecognised rather than guessing', () => {
    const junk = Uint8Array.from(Buffer.alloc(64, 0x41))
    expect(() => inspectImage(junk)).toThrow(/Unrecognised file/)
  })
})

describe('stripMetadata', () => {
  it('drops EXIF, IPTC and comments from a JPEG but keeps colour segments', () => {
    const source = jpeg({ width: 4032, height: 3024 })
    const stripped = stripMetadata(source, 'jpeg')

    expect(contains(source, 'GPS 8.5069S')).toBe(true)
    expect(contains(stripped, 'GPS 8.5069S')).toBe(false)
    expect(contains(stripped, 'iptc-credit-line')).toBe(false)
    expect(contains(stripped, 'a comment')).toBe(false)

    // Colour management and the JFIF header change how the image decodes.
    expect(contains(stripped, 'ICC_PROFILE')).toBe(true)
    expect(contains(stripped, 'JFIF')).toBe(true)

    // Still a valid JPEG of the same size, and the scan data survived.
    expect(inspectImage(stripped)).toMatchObject({ width: 4032, height: 3024 })
    expect(Buffer.from(stripped).subarray(-2).toString('hex')).toBe('ffd9')
  })

  it('drops PNG text and eXIf chunks but keeps IDAT and iCCP', () => {
    const source = png({ width: 1600, height: 900 })
    const stripped = stripMetadata(source, 'png')

    expect(contains(stripped, 'shot at home')).toBe(false)
    expect(contains(stripped, 'gps-coordinates-of-the-photographer')).toBe(false)
    expect(contains(stripped, 'colour-critical')).toBe(true)
    expect(contains(stripped, 'IDAT')).toBe(true)
    expect(contains(stripped, 'IEND')).toBe(true)

    expect(inspectImage(stripped)).toMatchObject({ width: 1600, height: 900 })
  })

  it('drops WebP EXIF and XMP chunks and rewrites the RIFF length', () => {
    const source = webpLossless({ width: 1280, height: 720 })
    const stripped = stripMetadata(source, 'webp')

    expect(contains(stripped, 'gps-coordinates')).toBe(false)
    expect(contains(stripped, 'xmpmeta')).toBe(false)

    // The declared RIFF size must match what is actually there, or every
    // decoder downstream reads past the end.
    const declared = Buffer.from(stripped).readUInt32LE(4)
    expect(declared).toBe(stripped.byteLength - 8)

    expect(inspectImage(stripped)).toMatchObject({ width: 1280, height: 720 })
  })
})

describe('width ladder', () => {
  it('never upscales and always includes the source width', () => {
    expect(rungsFor(1000)).toEqual([320, 480, 640, 960, 1000])
    expect(rungsFor(640)).toEqual([320, 480, 640])
    expect(rungsFor(400)).toEqual([320, 400])
  })

  it('caps at the widest slot the site ever renders', () => {
    expect(rungsFor(6000).at(-1)).toBe(2048)
    expect(rungsFor(6000)).not.toContain(6000)
  })

  it('derives derivative keys from the media id and stored width', () => {
    const key = originalKey('11111111-2222-3333-4444-555555555555', 'jpeg', true)
    expect(key).toBe('media/11111111-2222-3333-4444-555555555555/original.jpg')

    const derivatives = derivativesFor(key, 640)
    expect(derivatives).toHaveLength(6)
    expect(derivatives.map((d) => d.key)).toContain(
      'media/11111111-2222-3333-4444-555555555555/640.avif',
    )
  })

  it('reports no derivatives for an object stored without the ladder', () => {
    const key = originalKey('11111111-2222-3333-4444-555555555555', 'jpeg', false)
    expect(key).toContain('/unoptimised/')
    // The alternative — deriving keys anyway — hands callers URLs that 404.
    expect(derivativesFor(key, 1600)).toEqual([])
  })
})
