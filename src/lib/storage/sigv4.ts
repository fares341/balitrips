/**
 * AWS Signature Version 4, by hand.
 *
 * This project needs exactly two S3 operations — PUT an object, and mint a
 * presigned GET — against DigitalOcean Spaces. `@aws-sdk/client-s3` brings
 * ~80 transitive packages and several megabytes for that, into an image that
 * has to co-exist with Postgres and Chromium on a 4 GiB droplet, and into the
 * Next server bundle. SigV4 is a documented algorithm pinned by public test
 * vectors, so it is written out here instead — the same reasoning that has
 * `auth/email.ts` calling Resend's REST endpoint rather than its SDK.
 *
 * `sigv4.test.ts` checks this against AWS's own worked example from the
 * "Authenticating Requests: Using Query Parameters" documentation. If a
 * signature ever stops matching, that test fails before an upload does.
 *
 * Everything here is pure: no environment, no network, no clock unless one is
 * passed in. `spaces.ts` is the part that reads configuration.
 */

import { createHash, createHmac } from 'node:crypto'

export const AWS4_ALGORITHM = 'AWS4-HMAC-SHA256'

/**
 * Presigned URLs sign no payload — the bytes are not known when the URL is
 * minted, and the recipient is a browser that will not send an
 * `x-amz-content-sha256` header.
 */
export const UNSIGNED_PAYLOAD = 'UNSIGNED-PAYLOAD'

export interface SigningCredentials {
  accessKeyId: string
  secretAccessKey: string
  /** Only used by temporary credentials. Spaces keys are long-lived. */
  sessionToken?: string
}

export interface ObjectTarget {
  /** Scheme + host only, e.g. `https://sgp1.digitaloceanspaces.com`. */
  endpoint: string
  bucket: string
  /** Object key, unencoded, no leading slash. */
  key: string
  /**
   * Virtual-hosted style (`bucket.host/key`) is what Spaces and S3 use.
   * Path style (`host/bucket/key`) exists for MinIO and similar local
   * stand-ins, which cannot do wildcard DNS on localhost.
   */
  forcePathStyle?: boolean
}

/* --------------------------------------------------------------------------
   Primitives
   -------------------------------------------------------------------------- */

const UNRESERVED = /[A-Za-z0-9\-._~]/

/**
 * RFC 3986 percent-encoding, AWS flavour.
 *
 * `encodeURIComponent` is not a substitute: it leaves `!*'()` alone, and AWS
 * requires them encoded. Encoding runs over UTF-8 *bytes*, so a key with
 * Arabic or Indonesian characters in it signs identically on every platform.
 */
export function uriEncode(value: string, encodeSlash = true): string {
  let out = ''
  for (const byte of Buffer.from(value, 'utf8')) {
    const char = String.fromCharCode(byte)
    if (UNRESERVED.test(char)) {
      out += char
    } else if (char === '/' && !encodeSlash) {
      out += char
    } else {
      out += `%${byte.toString(16).toUpperCase().padStart(2, '0')}`
    }
  }
  return out
}

function sha256Hex(data: string | Uint8Array): string {
  return createHash('sha256').update(data).digest('hex')
}

function hmac(key: Uint8Array | string, data: string): Buffer {
  return createHmac('sha256', key).update(data, 'utf8').digest()
}

function deriveSigningKey(
  secretAccessKey: string,
  dateStamp: string,
  region: string,
  service: string,
): Buffer {
  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp)
  const kRegion = hmac(kDate, region)
  const kService = hmac(kRegion, service)
  return hmac(kService, 'aws4_request')
}

/** `20130524T000000Z` and `20130524`, both always in UTC. */
export function amzTimestamps(now: Date): { amzDate: string; dateStamp: string } {
  const amzDate = now
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '')
  return { amzDate, dateStamp: amzDate.slice(0, 8) }
}

/**
 * Canonical query string: every key and value encoded, then sorted by encoded
 * key and encoded value. Sorting on the *encoded* form matters — `%2F` and
 * `/` do not sort the same way.
 */
function canonicalQuery(params: readonly (readonly [string, string])[]): string {
  return params
    .map(([key, value]) => [uriEncode(key), uriEncode(value)] as const)
    .sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : 1) : a[0] < b[0] ? -1 : 1))
    .map(([key, value]) => `${key}=${value}`)
    .join('&')
}

interface ResolvedTarget {
  host: string
  origin: string
  canonicalPath: string
}

function resolveTarget(target: ObjectTarget): ResolvedTarget {
  const endpoint = new URL(target.endpoint)
  // Each segment is encoded separately: `/` is a path delimiter, not part of
  // a name. S3 does NOT normalise the path, so `a//b` stays `a//b`.
  const encodedKey = target.key
    .split('/')
    .map((segment) => uriEncode(segment))
    .join('/')

  if (target.forcePathStyle === true) {
    return {
      host: endpoint.host,
      origin: `${endpoint.protocol}//${endpoint.host}`,
      canonicalPath: `/${uriEncode(target.bucket)}/${encodedKey}`,
    }
  }

  const host = `${target.bucket}.${endpoint.host}`
  return {
    host,
    origin: `${endpoint.protocol}//${host}`,
    canonicalPath: `/${encodedKey}`,
  }
}

/**
 * CanonicalRequest, exactly as the specification lays it out:
 *
 *   METHOD \n URI \n QUERY \n <headers, each with a trailing \n> \n
 *   SIGNED_HEADERS \n PAYLOAD_HASH
 *
 * The blank line between the headers block and the signed-header list is
 * load-bearing and is the single most common way a hand-rolled signer breaks.
 */
function buildCanonicalRequest(
  method: string,
  canonicalPath: string,
  query: string,
  headers: readonly (readonly [string, string])[],
  payloadHash: string,
): string {
  const sorted = [...headers].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
  const headerBlock = sorted.map(([name, value]) => `${name}:${value}\n`).join('')
  const signedHeaders = sorted.map(([name]) => name).join(';')

  return [method, canonicalPath, query, headerBlock, signedHeaders, payloadHash].join('\n')
}

function sign(
  credentials: SigningCredentials,
  amzDate: string,
  scope: string,
  canonicalRequest: string,
  region: string,
  service: string,
  dateStamp: string,
): string {
  const stringToSign = [AWS4_ALGORITHM, amzDate, scope, sha256Hex(canonicalRequest)].join('\n')
  const key = deriveSigningKey(credentials.secretAccessKey, dateStamp, region, service)
  return hmac(key, stringToSign).toString('hex')
}

/* --------------------------------------------------------------------------
   Presigned GET
   -------------------------------------------------------------------------- */

export interface PresignOptions extends ObjectTarget {
  region: string
  /** `s3` for both AWS and Spaces. */
  service?: string
  credentials: SigningCredentials
  /**
   * Keep this SHORT. The URL is a bearer token: whoever holds it can read the
   * object until it expires, and it will end up in browser history, in a
   * `Referer` header, and in whatever the customer pastes into a group chat.
   */
  expiresInSeconds: number
  method?: 'GET' | 'HEAD'
  /**
   * Signed response overrides, e.g. `response-content-disposition`. They are
   * part of the signature, so a recipient cannot rewrite them.
   */
  query?: Readonly<Record<string, string>>
  /** Injectable for tests. */
  now?: Date
}

export function presignObjectUrl(options: PresignOptions): string {
  const service = options.service ?? 's3'
  const method = options.method ?? 'GET'
  const { amzDate, dateStamp } = amzTimestamps(options.now ?? new Date())
  const scope = `${dateStamp}/${options.region}/${service}/aws4_request`
  const { host, origin, canonicalPath } = resolveTarget(options)

  const params: [string, string][] = [
    ['X-Amz-Algorithm', AWS4_ALGORITHM],
    ['X-Amz-Credential', `${options.credentials.accessKeyId}/${scope}`],
    ['X-Amz-Date', amzDate],
    ['X-Amz-Expires', String(Math.max(1, Math.floor(options.expiresInSeconds)))],
    ['X-Amz-SignedHeaders', 'host'],
  ]

  if (options.credentials.sessionToken !== undefined) {
    params.push(['X-Amz-Security-Token', options.credentials.sessionToken])
  }
  for (const [name, value] of Object.entries(options.query ?? {})) {
    params.push([name, value])
  }

  const query = canonicalQuery(params)
  const canonicalRequest = buildCanonicalRequest(
    method,
    canonicalPath,
    query,
    [['host', host]],
    UNSIGNED_PAYLOAD,
  )
  const signature = sign(
    options.credentials,
    amzDate,
    scope,
    canonicalRequest,
    options.region,
    service,
    dateStamp,
  )

  return `${origin}${canonicalPath}?${query}&X-Amz-Signature=${signature}`
}

/* --------------------------------------------------------------------------
   Signed request (header authorization)
   -------------------------------------------------------------------------- */

export interface SignRequestOptions extends ObjectTarget {
  method: string
  region: string
  service?: string
  credentials: SigningCredentials
  /** Extra headers to sign, e.g. `content-type`, `x-amz-acl`. */
  headers?: Readonly<Record<string, string>>
  body?: Uint8Array | string
  now?: Date
}

export interface SignedRequest {
  url: string
  /**
   * Ready to hand to `fetch`. `host` is deliberately absent: it is signed, but
   * `fetch` derives and owns it, and setting it explicitly is a forbidden
   * header write that throws in undici.
   */
  headers: Record<string, string>
}

export function signRequest(options: SignRequestOptions): SignedRequest {
  const service = options.service ?? 's3'
  const { amzDate, dateStamp } = amzTimestamps(options.now ?? new Date())
  const scope = `${dateStamp}/${options.region}/${service}/aws4_request`
  const { host, origin, canonicalPath } = resolveTarget(options)

  const body = options.body ?? ''
  const payloadHash = sha256Hex(body)

  const signedHeaders: Record<string, string> = {
    host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  }
  if (options.credentials.sessionToken !== undefined) {
    signedHeaders['x-amz-security-token'] = options.credentials.sessionToken
  }
  for (const [name, value] of Object.entries(options.headers ?? {})) {
    // Header names are case-insensitive on the wire but case-SENSITIVE in the
    // canonical request, which must use lowercase. Values are trimmed.
    signedHeaders[name.toLowerCase()] = value.trim()
  }

  const headerPairs = Object.entries(signedHeaders) as [string, string][]
  const canonicalRequest = buildCanonicalRequest(
    options.method,
    canonicalPath,
    '',
    headerPairs,
    payloadHash,
  )
  const signature = sign(
    options.credentials,
    amzDate,
    scope,
    canonicalRequest,
    options.region,
    service,
    dateStamp,
  )

  const signedHeaderList = headerPairs
    .map(([name]) => name)
    .sort()
    .join(';')

  const authorization =
    `${AWS4_ALGORITHM} Credential=${options.credentials.accessKeyId}/${scope}, ` +
    `SignedHeaders=${signedHeaderList}, Signature=${signature}`

  const { host: _host, ...fetchHeaders } = signedHeaders

  return {
    url: `${origin}${canonicalPath}`,
    headers: { ...fetchHeaders, authorization },
  }
}
