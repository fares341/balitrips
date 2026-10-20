/**
 * Phase 6: deep health — database, job queue, storage, PDF renderer, backup.
 *
 * NOT the container probe: `/api/health` stays a liveness check that touches
 * nothing. This one queries real dependencies, so it is protected:
 *
 *   - `Authorization: Bearer <HEALTH_CHECK_TOKEN>` (for an uptime monitor), or
 *   - a signed-in session holding `system.read` (an admin in the browser).
 *
 * Anyone else gets 404, the same as a path that does not exist.
 * 200 when everything is ok or only warns, 503 when something is down.
 */

import { timingSafeEqual } from 'node:crypto'

import { NextResponse } from 'next/server'

import { hasCapability } from '@/lib/auth/session'
import { overallState, runHealthChecks } from '@/lib/monitoring/health'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function tokenMatches(header: string | null): boolean {
  const expected = process.env.HEALTH_CHECK_TOKEN?.trim()
  if (!expected || expected.length < 24 || !header?.startsWith('Bearer ')) return false
  const given = Buffer.from(header.slice('Bearer '.length).trim())
  const wanted = Buffer.from(expected)
  return given.length === wanted.length && timingSafeEqual(given, wanted)
}

export async function GET(request: Request): Promise<NextResponse> {
  const allowed =
    tokenMatches(request.headers.get('authorization')) || (await hasCapability('system.read'))
  if (!allowed) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  const checks = await runHealthChecks()
  const status = overallState(checks)
  return NextResponse.json(
    { status, checkedAt: new Date().toISOString(), checks },
    {
      status: status === 'down' ? 503 : 200,
      headers: { 'Cache-Control': 'no-store, private' },
    },
  )
}
