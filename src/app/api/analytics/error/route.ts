/**
 * POST /api/analytics/error — a browser could not load the map (engine,
 * tiles, WebGL…). A short code and the path, nothing else: no message text,
 * no stack, no location. Studio → Map analytics counts them.
 *
 * Not tied to analytics consent: an error report carries no visitor id and
 * is needed to keep the paid map working.
 */

import { NextResponse } from 'next/server'

import { db } from '@/db'
import { clientErrors } from '@/db/schema'
import { cleanPath } from '@/lib/analytics/events'
import { parseDeviceType } from '@/lib/security/fingerprint'

export const dynamic = 'force-dynamic'

const AREAS = new Set(['map'])
const PER_MINUTE = 600
let windowStart = 0
let windowCount = 0

export async function POST(request: Request): Promise<NextResponse> {
  const now = Date.now()
  if (now - windowStart > 60_000) {
    windowStart = now
    windowCount = 0
  }
  windowCount += 1
  if (windowCount > PER_MINUTE) return new NextResponse(null, { status: 204 })

  let body: { area?: unknown; code?: unknown; path?: unknown }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return new NextResponse(null, { status: 204 })
  }
  const area = typeof body.area === 'string' && AREAS.has(body.area) ? body.area : null
  const code =
    typeof body.code === 'string' && /^[a-z0-9_]{2,48}$/.test(body.code) ? body.code : null
  if (area === null || code === null) return new NextResponse(null, { status: 204 })

  try {
    await db.insert(clientErrors).values({
      area,
      code,
      path: cleanPath(body.path),
      deviceType: parseDeviceType(request.headers.get('user-agent')),
    })
  } catch (error) {
    console.error('[analytics] could not store a client error', error)
  }
  return new NextResponse(null, { status: 204 })
}
