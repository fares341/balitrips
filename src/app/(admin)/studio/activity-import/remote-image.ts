import 'server-only'

import { randomUUID } from 'node:crypto'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

import { db } from '@/db'
import { media } from '@/db/schema'

import { writeAudit } from '../../_lib/audit'
import { ingestImage, MAX_UPLOAD_BYTES } from '../../_lib/image/pipeline'
import type { requireCapability } from '../../_lib/session'

type Session = Awaited<ReturnType<typeof requireCapability>>

/** Private, loopback, link-local and other non-public addresses. */
function privateAddress(address: string): boolean {
  if (isIP(address) === 6) {
    const a = address.toLowerCase()
    if (a.startsWith('::ffff:')) return privateAddress(a.slice(7))
    return (
      a === '::1' || a === '::' || a.startsWith('fc') || a.startsWith('fd') || a.startsWith('fe80')
    )
  }
  const parts = address.split('.').map(Number)
  const [a = 0, b = 0] = parts
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

async function safeUrl(raw: string): Promise<URL | null> {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  if (url.username || url.password) return null
  const host = url.hostname.replace(/^\[|\]$/g, '')
  const addresses = isIP(host)
    ? [host]
    : (await lookup(host, { all: true }).catch(() => [])).map((entry) => entry.address)
  if (addresses.length === 0 || addresses.some(privateAddress)) return null
  return url
}

/**
 * Downloads one image URL from a spreadsheet into the media library (the
 * same pipeline as an upload). Public http(s) hosts only, three redirects at
 * most, the upload size limit, 20 s. Failure is a reason, never a throw.
 */
export async function fetchRemoteImage(
  raw: string,
  session: Session,
): Promise<{ id: string } | { reason: string }> {
  try {
    let url = await safeUrl(raw)
    let response: Response | null = null
    for (let hop = 0; hop < 4 && url; hop += 1) {
      response = await fetch(url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(20_000),
        headers: { accept: 'image/*' },
      })
      if (response.status >= 300 && response.status < 400) {
        const next = response.headers.get('location')
        url = next ? await safeUrl(new URL(next, url).toString()) : null
        response = null
        continue
      }
      break
    }
    if (!url || !response) return { reason: 'blocked' }
    if (!response.ok) return { reason: `HTTP ${response.status}` }
    const length = Number(response.headers.get('content-length') ?? '0')
    if (length > MAX_UPLOAD_BYTES) return { reason: 'too_large' }
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.byteLength > MAX_UPLOAD_BYTES) return { reason: 'too_large' }
    const mediaId = randomUUID()
    const result = await ingestImage({
      mediaId,
      bytes,
      declaredMime: response.headers.get('content-type'),
      declaredName: url.pathname.split('/').pop() ?? null,
    })
    await db.insert(media).values({
      id: mediaId,
      objectKey: result.objectKey,
      mimeType: result.mimeType,
      width: result.width,
      height: result.height,
      bytes: result.bytes,
      credit: url.hostname,
    })
    await writeAudit({
      actor: session,
      action: 'media.upload',
      entityType: 'media',
      entityId: mediaId,
      before: null,
      after: { objectKey: result.objectKey, source: 'spreadsheet', url: url.toString() },
    })
    return { id: mediaId }
  } catch (error) {
    return { reason: error instanceof Error ? error.message.slice(0, 120) : 'failed' }
  }
}
