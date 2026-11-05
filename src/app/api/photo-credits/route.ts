/**
 * Credits of free photos (Commons / Openverse / Unsplash) by media id, for
 * the «Photo: author · licence · source» line under each one. Only rows with
 * a free-photo source are answered; uploads and unknown ids are left out.
 * Credits are public provenance data (no place, no lock-relevant field).
 *
 *   GET /api/photo-credits?ids=<uuid>,<uuid>   (at most 60)
 */

import { and, inArray, isNotNull, isNull } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { db } from '@/db'
import { media } from '@/db/schema'

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get('ids') ?? ''
  const ids = [...new Set(raw.split(',').map((s) => s.trim().toLowerCase()))]
    .filter((id) => UUID.test(id))
    .slice(0, 60)
  if (ids.length === 0) return NextResponse.json({ credits: {} })
  const rows = await db
    .select({
      id: media.id,
      source: media.source,
      author: media.author,
      authorUrl: media.authorUrl,
      license: media.license,
      licenseUrl: media.licenseUrl,
      sourceUrl: media.sourceUrl,
    })
    .from(media)
    .where(and(inArray(media.id, ids), isNotNull(media.source), isNull(media.deletedAt)))
  const credits = Object.fromEntries(
    rows
      .filter((r) => r.license)
      .map((r) => [
        r.id,
        {
          source: r.source,
          author: r.author,
          authorUrl: r.authorUrl,
          license: r.license,
          licenseUrl: r.licenseUrl,
          sourceUrl: r.sourceUrl,
        },
      ]),
  )
  return NextResponse.json(
    { credits },
    { headers: { 'Cache-Control': 'public, max-age=300, s-maxage=3600' } },
  )
}
