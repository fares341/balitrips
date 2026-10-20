/**
 * GET /api/analytics/config — the PUBLIC ids of the tracking tools an admin
 * switched on (GA4, GTM, Meta Pixel, TikTok Pixel). Fetched by the browser
 * only after the visitor accepted the matching cookies. Never a token: the
 * server API tokens stay on the server (`integration_secrets`).
 */

import { NextResponse } from 'next/server'

import { publicTrackingConfig, readMarketingSettings } from '@/lib/analytics/settings'

export const dynamic = 'force-dynamic'

export async function GET(): Promise<NextResponse> {
  const config = publicTrackingConfig(await readMarketingSettings())
  return NextResponse.json(config, {
    headers: { 'Cache-Control': 'public, max-age=300', 'X-Robots-Tag': 'noindex' },
  })
}
