import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'

import { isStorageConfigured, uploadPublic } from '@/lib/storage'
import {
  DERIVATIVE_FORMATS,
  MAX_STORED_WIDTH,
  WIDTH_LADDER,
  UNOPTIMISED_SEGMENT,
  derivativeKey,
  isUnoptimised,
  rungsFor,
  type DerivativeFormat,
} from '@/lib/media/ladder'

import { inspectImage, ImageRejected, stripMetadata, type ImageFormat } from './inspect'

/**
 * The ingest pipeline.
 *
 * This is what finally retires the handoff's `flickr(query)` helper — a
 * function that returned a hot-linked search URL, so every image on the site
 * was a third party's bandwidth, a third party's uptime and a third party's
 * licence. Every `hero_image_id` in the database is currently null because
 * there was nothing to point at.
 *
 * An upload runs:
 *
 *   size cap → magic-byte sniff → dimension read → metadata strip
 *     → re-encode into an AVIF + WebP width ladder → upload → one media row
 *
 * ORDER MATTERS. The cap is enforced before anything parses the bytes, and
 * the format is decided from the bytes before any of them are handed to a
 * codec.
 *
 * THE LADDER IS DERIVED, NOT STORED. The `media` table has no column for
 * derivative keys, and its schema is owned elsewhere, so the keys are a pure
 * function of the media id and the stored width: `media/<id>/<width>.avif`.
 * That only stays true if the derivatives are always written — so an upload
 * that cannot generate them does not quietly store the original under a key
 * that implies they exist. It stores it under an `unoptimised/` prefix
 * instead, which `derivativesFor()` recognises and reports honestly.
 */

/* --------------------------------------------------------------------------
   Policy
   -------------------------------------------------------------------------- */

/**
 * Upload cap.
 *
 * A phone photograph is 3–8 MB; a print-resolution TIFF export is 200 MB and
 * will take the container's memory with it, because the whole body is
 * buffered to be hashed and re-encoded.
 */
export const MAX_UPLOAD_BYTES = readByteLimit('MEDIA_MAX_UPLOAD_BYTES', 12 * 1024 * 1024)

/** Smallest sensible source. Below this it is a favicon, not a photograph. */
const MIN_SOURCE_WIDTH = 320

const EXTENSION: Record<ImageFormat, string> = { jpeg: 'jpg', png: 'png', webp: 'webp' }

// Re-exported so the ladder has exactly one definition. The widths written on
// upload and the widths requested by <Photo> must be the same list; when they
// were two lists, a change to either would have 404'd every image on the site.
export {
  DERIVATIVE_FORMATS,
  MAX_STORED_WIDTH,
  WIDTH_LADDER,
  UNOPTIMISED_SEGMENT,
  derivativeKey,
  isUnoptimised,
  rungsFor,
  type DerivativeFormat,
}

function readByteLimit(name: string, fallback: number): number {
  const raw = process.env[name]
  const parsed = raw === undefined ? Number.NaN : Number.parseInt(raw, 10)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

/* --------------------------------------------------------------------------
   Key derivation
   -------------------------------------------------------------------------- */

export function originalKey(mediaId: string, format: ImageFormat, optimised: boolean): string {
  const name = `original.${EXTENSION[format]}`
  return optimised ? `media/${mediaId}/${name}` : `media/${mediaId}/${UNOPTIMISED_SEGMENT}/${name}`
}

export interface Derivative {
  width: number
  format: DerivativeFormat
  key: string
}

/**
 * The derivatives that exist for a stored image.
 *
 * Derived from the row rather than looked up, and empty for an unoptimised
 * object — a caller must never be handed a key that 404s.
 */
export function derivativesFor(objectKey: string, width: number): Derivative[] {
  if (isUnoptimised(objectKey)) return []

  const mediaId = objectKey.split('/')[1]
  if (mediaId === undefined || mediaId === '') return []

  return rungsFor(width).flatMap((rung) =>
    DERIVATIVE_FORMATS.map((format) => ({
      width: rung,
      format,
      key: derivativeKey(mediaId, rung, format),
    })),
  )
}

/* --------------------------------------------------------------------------
   Encoder
   -------------------------------------------------------------------------- */

interface SharpInstance {
  rotate(): SharpInstance
  resize(options: { width: number; withoutEnlargement: boolean; fit: 'inside' }): SharpInstance
  avif(options: { quality: number; effort: number }): SharpInstance
  webp(options: { quality: number; effort: number }): SharpInstance
  toBuffer(): Promise<Buffer>
}

type SharpFactory = (input: Uint8Array) => SharpInstance

let cachedSharp: SharpFactory | null | undefined

/**
 * Load the encoder, once.
 *
 * `sharp` is a native module: it is listed in this project's
 * `pnpm.onlyBuiltDependencies` and ships as an optional dependency of Next,
 * but it is not guaranteed to be present in every environment (a CI image
 * built with `--no-optional`, or a machine whose platform binary failed to
 * install). Resolved through `createRequire` with a variable specifier so the
 * bundler does not try to follow it and a missing binary is a runtime
 * condition this code can report, not a build failure.
 */
export function loadEncoder(): SharpFactory | null {
  if (cachedSharp !== undefined) return cachedSharp

  const moduleName = 'sharp'
  try {
    const require_ = createRequire(import.meta.url)
    const loaded: unknown = require_(moduleName)
    const factory =
      typeof loaded === 'function' ? loaded : (loaded as { default?: unknown } | null)?.default

    cachedSharp = typeof factory === 'function' ? (factory as SharpFactory) : null
  } catch {
    cachedSharp = null
  }

  return cachedSharp
}

export function encoderAvailable(): boolean {
  return loadEncoder() !== null
}

/* --------------------------------------------------------------------------
   Ingest
   -------------------------------------------------------------------------- */

export interface IngestResult {
  objectKey: string
  mimeType: string
  width: number
  height: number
  bytes: number
  /** Every derivative actually written. Empty when the encoder was absent. */
  derivatives: Derivative[]
  optimised: boolean
  /** Where the bytes went, for the operator's benefit. */
  driver: 'spaces' | 'local'
}

export interface IngestInput {
  mediaId: string
  bytes: Uint8Array
  declaredMime: string | null
  declaredName: string | null
}

export async function ingestImage(input: IngestInput): Promise<IngestResult> {
  const { bytes } = input

  if (bytes.byteLength === 0) throw new ImageRejected('That file is empty.')
  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw new ImageRejected(
      `That file is ${formatBytes(bytes.byteLength)}. The limit is ${formatBytes(MAX_UPLOAD_BYTES)} — resize or re-export it first.`,
    )
  }

  const inspected = inspectImage(bytes, input.declaredMime)

  if (inspected.width < MIN_SOURCE_WIDTH) {
    throw new ImageRejected(
      `That image is only ${inspected.width}px wide. The smallest layout slot is ${MIN_SOURCE_WIDTH}px, and upscaling looks worse than a missing image.`,
    )
  }

  // Guard against decompression bombs: a 100 kB PNG can declare 40000x40000
  // and cost 6 GB to decode. Checked from the header, before any codec runs.
  const megapixels = (inspected.width * inspected.height) / 1_000_000
  if (megapixels > 80) {
    throw new ImageRejected(
      `That image is ${Math.round(megapixels)} megapixels. Anything over 80 is refused — decoding it would take the server down.`,
    )
  }

  const sanitised = stripMetadata(bytes, inspected.format)
  const encoder = loadEncoder()
  const optimised = encoder !== null

  const originalObjectKey = originalKey(input.mediaId, inspected.format, optimised)
  const driver = isStorageConfigured() ? 'spaces' : 'local'

  await store(originalObjectKey, sanitised, inspected.mimeType)

  const derivatives: Derivative[] = []
  if (encoder !== null) {
    for (const rung of rungsFor(inspected.width)) {
      for (const format of DERIVATIVE_FORMATS) {
        const pipeline = encoder(sanitised)
          // Honour the EXIF orientation before it is discarded, otherwise a
          // portrait phone photo is stored on its side.
          .rotate()
          .resize({ width: rung, withoutEnlargement: true, fit: 'inside' })

        const encoded =
          format === 'avif'
            ? await pipeline.avif({ quality: 55, effort: 4 }).toBuffer()
            : await pipeline.webp({ quality: 78, effort: 4 }).toBuffer()

        const key = derivativeKey(input.mediaId, rung, format)
        await store(key, encoded, `image/${format}`)
        derivatives.push({ width: rung, format, key })
      }
    }
  }

  return {
    objectKey: originalObjectKey,
    mimeType: inspected.mimeType,
    width: inspected.width,
    height: inspected.height,
    bytes: sanitised.byteLength,
    derivatives,
    optimised,
    driver,
  }
}

/**
 * Write one object.
 *
 * Spaces when it is configured; otherwise the local `public/` directory,
 * which is exactly where `mediaUrl()` looks when `NEXT_PUBLIC_CDN_URL` is
 * unset. That makes the whole library usable in development without a Spaces
 * account, and it is not a silent downgrade — the media screen states which
 * driver is live.
 */
async function store(key: string, body: Uint8Array, contentType: string): Promise<void> {
  if (isStorageConfigured()) {
    await uploadPublic({ key, body, contentType })
    return
  }

  const root = join(process.cwd(), 'public')
  const path = resolve(root, key)
  if (!path.startsWith(root.endsWith(sep) ? root : `${root}${sep}`)) {
    throw new Error(`Refusing to write outside public/: ${key}`)
  }

  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, body)
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} kB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
