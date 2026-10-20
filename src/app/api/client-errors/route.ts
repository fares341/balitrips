/**
 * Phase 6: the browser's error beacon (src/components/monitoring/error-beacon.tsx).
 *
 * Uncaught errors and unhandled promise rejections in visitors' browsers are
 * posted here and land in `error_events` (source `client`), scrubbed and
 * grouped like server errors. Limited per IP; anything malformed is dropped
 * quietly with 204 — a beacon never gets an error page.
 */

import { headers } from 'next/headers'
import { z } from 'zod'

import { recordError } from '@/lib/monitoring/errors'
import { consumeRateLimit } from '@/lib/rate-limit'
import { clientIp } from '@/lib/security/ip'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const reportSchema = z.object({
  message: z.string().min(1).max(2000),
  name: z.string().max(120).optional(),
  stack: z.string().max(8000).optional(),
  path: z.string().max(500).optional(),
  kind: z.enum(['error', 'rejection']).optional(),
})

const MAX_BYTES = 16 * 1024

export async function POST(request: Request): Promise<Response> {
  const nothing = new Response(null, { status: 204 })
  const ip = clientIp(await headers()) ?? 'unknown'
  const limit = await consumeRateLimit('clientError', ip)
  if (!limit.allowed) return nothing

  const text = await request.text()
  if (text.length > MAX_BYTES) return nothing
  let parsed
  try {
    parsed = reportSchema.safeParse(JSON.parse(text))
  } catch {
    return nothing
  }
  if (!parsed.success) return nothing

  const report = parsed.data
  // Browser extensions and third-party scripts throw into every page; those
  // are not our bugs and would drown the real ones.
  if (/^(chrome|moz|safari)-extension:/.test(report.stack ?? '')) return nothing
  if (report.message === 'Script error.' && !report.stack) return nothing

  await recordError(
    { name: report.name ?? 'Error', message: report.message, stack: report.stack },
    { source: 'client', path: report.path ?? null, details: { kind: report.kind ?? 'error' } },
  )
  return new Response(null, { status: 204 })
}
