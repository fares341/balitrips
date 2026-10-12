import { NextResponse } from 'next/server'

/**
 * Liveness probe for the container healthcheck and the reverse proxy.
 *
 * Deliberately does NOT touch Postgres: this endpoint decides whether Caddy
 * routes traffic to a container during a zero-downtime swap, and a slow
 * database query here would take healthy web containers out of rotation.
 * Database health is a separate concern with its own alerting.
 */
export const dynamic = 'force-dynamic'

export function GET() {
  return NextResponse.json({ status: 'ok', uptime: process.uptime() })
}
