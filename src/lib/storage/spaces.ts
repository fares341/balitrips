/**
 * Object storage — DigitalOcean Spaces, S3-compatible.
 *
 * Two buckets, with genuinely different rules:
 *
 *  - **public** (`SPACES_PUBLIC_BUCKET`): imagery. CDN on, immutable cache
 *    headers, world-readable by design. Served straight from the CDN
 *    hostname; the app never proxies these bytes.
 *
 *  - **private** (`SPACES_PRIVATE_BUCKET`): the PDFs people paid for. CDN
 *    OFF, and the bucket ACL must be private at the provider — nothing in
 *    this file can enforce that, so it is stated here and in `.env.example`
 *    as an operational requirement. Reads happen only through a presigned
 *    URL with a short expiry, minted **after** an entitlement check. A
 *    presigned URL is a bearer token: it works for whoever holds it, it lands
 *    in browser history and in `Referer`, and it cannot be revoked. Short
 *    expiry is the only control that survives it being shared.
 *
 * Configuration is read lazily, not at module load. The site has to boot in
 * development with no Spaces credentials — an import-time throw would take
 * every page down over a feature most of them never touch.
 */

import { presignObjectUrl, signRequest, type SigningCredentials } from './sigv4'

export type BucketName = 'public' | 'private'

export interface StorageConfig {
  region: string
  endpoint: string
  credentials: SigningCredentials
  publicBucket: string
  privateBucket: string
  /** CDN hostname in front of the public bucket, if one is configured. */
  cdnUrl: string | null
  forcePathStyle: boolean
}

export class StorageNotConfiguredError extends Error {
  constructor(missing: readonly string[]) {
    super(
      `Object storage is not configured. Missing: ${missing.join(', ')}. ` +
        'Set these in .env.local (see .env.example) or the droplet environment file.',
    )
    this.name = 'StorageNotConfiguredError'
  }
}

export class StorageError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    /** Network blips and 5xx are worth another attempt; a 403 is not. */
    readonly retryable: boolean,
  ) {
    super(message)
    this.name = 'StorageError'
  }
}

/* --------------------------------------------------------------------------
   Configuration
   -------------------------------------------------------------------------- */

function env(name: string): string | null {
  const value = process.env[name]
  return value === undefined || value.trim() === '' ? null : value.trim()
}

/** Configuration, or `null` when storage has not been set up. */
export function getStorageConfig(): StorageConfig | null {
  const region = env('SPACES_REGION')
  const endpoint = env('SPACES_ENDPOINT')
  const accessKeyId = env('SPACES_KEY')
  const secretAccessKey = env('SPACES_SECRET')
  const publicBucket = env('SPACES_PUBLIC_BUCKET')
  const privateBucket = env('SPACES_PRIVATE_BUCKET')

  if (
    region === null ||
    endpoint === null ||
    accessKeyId === null ||
    secretAccessKey === null ||
    publicBucket === null ||
    privateBucket === null
  ) {
    return null
  }

  return {
    region,
    // A trailing slash would produce `//key` in the canonical path and a
    // signature over a URL nobody asked for.
    endpoint: endpoint.replace(/\/+$/, ''),
    credentials: { accessKeyId, secretAccessKey },
    publicBucket,
    privateBucket,
    cdnUrl: env('NEXT_PUBLIC_CDN_URL')?.replace(/\/+$/, '') ?? null,
    forcePathStyle: env('SPACES_FORCE_PATH_STYLE') === 'true',
  }
}

export function isStorageConfigured(): boolean {
  return getStorageConfig() !== null
}

export function requireStorageConfig(): StorageConfig {
  const config = getStorageConfig()
  if (config !== null) return config

  const missing = (
    [
      'SPACES_REGION',
      'SPACES_ENDPOINT',
      'SPACES_KEY',
      'SPACES_SECRET',
      'SPACES_PUBLIC_BUCKET',
      'SPACES_PRIVATE_BUCKET',
    ] as const
  ).filter((name) => env(name) === null)

  throw new StorageNotConfiguredError(missing)
}

function bucketFor(config: StorageConfig, bucket: BucketName): string {
  return bucket === 'public' ? config.publicBucket : config.privateBucket
}

/* --------------------------------------------------------------------------
   Upload
   -------------------------------------------------------------------------- */

export interface UploadInput {
  key: string
  body: Uint8Array | string
  contentType: string
  /**
   * Defaults are deliberately asymmetric: public objects are content-hashed
   * or version-pathed, so a year of immutable caching is correct; private
   * objects are served through a presigned URL and must never be cached by
   * an intermediary.
   */
  cacheControl?: string
  /** Sets `Content-Disposition` on the stored object. */
  contentDisposition?: string
  timeoutMs?: number
}

export interface UploadResult {
  bucket: BucketName
  key: string
  bytes: number
  /** Only meaningful for the public bucket. */
  url: string | null
}

async function putObject(bucket: BucketName, input: UploadInput): Promise<UploadResult> {
  const config = requireStorageConfig()
  const key = normalizeKey(input.key)
  const body = typeof input.body === 'string' ? Buffer.from(input.body, 'utf8') : input.body

  const headers: Record<string, string> = {
    'content-type': input.contentType,
    'content-length': String(body.byteLength),
    // Belt and braces. The bucket ACL is the real control, but an object
    // that explicitly says `private` cannot be exposed by a later, careless
    // change to the bucket default.
    'x-amz-acl': bucket === 'public' ? 'public-read' : 'private',
    'cache-control':
      input.cacheControl ??
      (bucket === 'public' ? 'public, max-age=31536000, immutable' : 'private, no-store'),
  }
  if (input.contentDisposition !== undefined) {
    headers['content-disposition'] = input.contentDisposition
  }

  const signed = signRequest({
    method: 'PUT',
    endpoint: config.endpoint,
    bucket: bucketFor(config, bucket),
    key,
    region: config.region,
    credentials: config.credentials,
    forcePathStyle: config.forcePathStyle,
    headers,
    body,
  })

  let response: Response
  try {
    response = await fetch(signed.url, {
      method: 'PUT',
      headers: signed.headers,
      body: new Uint8Array(body),
      signal: AbortSignal.timeout(input.timeoutMs ?? 30_000),
    })
  } catch (error) {
    // DNS, TLS, timeout: transient by nature, so the job should try again.
    throw new StorageError(`PUT ${bucket}/${key} failed: ${String(error)}`, null, true)
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new StorageError(
      `PUT ${bucket}/${key} returned ${response.status}: ${detail.slice(0, 500)}`,
      response.status,
      response.status >= 500 || response.status === 429,
    )
  }

  return {
    bucket,
    key,
    bytes: body.byteLength,
    url: bucket === 'public' ? publicUrl(key) : null,
  }
}

/** Upload to the world-readable bucket and return its CDN URL. */
export async function uploadPublic(input: UploadInput): Promise<UploadResult> {
  return putObject('public', input)
}

/**
 * Upload to the paid-content bucket.
 *
 * Returns the key, never a URL — there is no URL for this object that is
 * valid without a signature, and returning one would invite a caller to
 * store it somewhere.
 */
export async function uploadPrivate(input: UploadInput): Promise<UploadResult> {
  // Single-host production without Spaces: the local private volume
  // (PRIVATE_STORAGE_DIR, see local-private.ts). Spaces wins when configured.
  if (!isStorageConfigured() && process.env.PRIVATE_STORAGE_DIR?.trim()) {
    const { writeLocalPrivate } = await import('./local-private')
    const key = normalizeKey(input.key)
    const bytes = await writeLocalPrivate(key, input.body)
    return { bucket: 'private', key, bytes, url: null }
  }
  return putObject('private', input)
}

/* --------------------------------------------------------------------------
   Read
   -------------------------------------------------------------------------- */

/** Public URL for a public-bucket key. Prefers the CDN hostname. */
export function publicUrl(key: string): string {
  const config = requireStorageConfig()
  const normalized = normalizeKey(key)

  if (config.cdnUrl !== null) return `${config.cdnUrl}/${normalized}`

  const endpoint = new URL(config.endpoint)
  return config.forcePathStyle
    ? `${endpoint.protocol}//${endpoint.host}/${config.publicBucket}/${normalized}`
    : `${endpoint.protocol}//${config.publicBucket}.${endpoint.host}/${normalized}`
}

/**
 * Default lifetime of a presigned download URL.
 *
 * The consumer is a browser following a redirect it received a moment ago,
 * so this only has to outlive one hop plus a retry. Anything longer is time
 * during which a forwarded link still works.
 */
const DEFAULT_PRESIGN_SECONDS = 120
const MIN_PRESIGN_SECONDS = 30
const MAX_PRESIGN_SECONDS = 900

export function presignTtlSeconds(): number {
  const raw = Number.parseInt(process.env.DOWNLOAD_URL_TTL_SECONDS ?? '', 10)
  if (!Number.isFinite(raw)) return DEFAULT_PRESIGN_SECONDS
  return Math.min(MAX_PRESIGN_SECONDS, Math.max(MIN_PRESIGN_SECONDS, raw))
}

export interface PresignedGetOptions {
  expiresInSeconds?: number
  /** Filename the browser should save as. ASCII is encoded verbatim. */
  downloadFilename?: string
  contentType?: string
}

/**
 * Mint a read URL for a private object.
 *
 * CALLERS MUST CHECK ENTITLEMENT FIRST. This function knows nothing about who
 * is asking; signing is the last step, never the gate.
 */
export function presignedGet(key: string, options: PresignedGetOptions = {}): string {
  const config = requireStorageConfig()

  const query: Record<string, string> = {}
  if (options.downloadFilename !== undefined) {
    query['response-content-disposition'] = contentDisposition(options.downloadFilename)
  }
  if (options.contentType !== undefined) {
    query['response-content-type'] = options.contentType
  }

  return presignObjectUrl({
    endpoint: config.endpoint,
    bucket: config.privateBucket,
    key: normalizeKey(key),
    region: config.region,
    credentials: config.credentials,
    forcePathStyle: config.forcePathStyle,
    expiresInSeconds: options.expiresInSeconds ?? presignTtlSeconds(),
    query,
  })
}

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

/** Keys never start with a slash; `//` in a key is a different object. */
function normalizeKey(key: string): string {
  return key.replace(/^\/+/, '')
}

/**
 * RFC 6266 `Content-Disposition`.
 *
 * Both forms are emitted: a sanitised ASCII `filename` that every client
 * understands, and `filename*` with the real UTF-8 name for those that do.
 * An Arabic itinerary title in a bare `filename=` produces mojibake or a
 * rejected header, depending on the client.
 */
export function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\w.\- ]+/g, '_').replace(/"/g, '')
  const safeAscii = ascii.trim() === '' ? 'download' : ascii
  return `attachment; filename="${safeAscii}"; filename*=UTF-8''${encodeURIComponent(filename)}`
}
