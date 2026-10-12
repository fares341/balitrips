/**
 * GET /api/places/search — البحث المركّب والأماكن القريبة.
 *
 *   ?q=        نص (اسم، منطقة، تصنيف، وسم — بكل اللغات). جملة كاملة تُفهم:
 *              "كافيهات في كوتا" ← المنطقة Kuta؛ "Cafes near me" ← `nearMe` في
 *              الرد (أرسل lat/lon للترتيب بالأقرب). انظر src/lib/search/query.ts
 *   &region=   مفتاح منطقة (regions.key)
 *   &category= مفتاح تصنيف (categories.key)
 *   &tag=      مفتاح وسم، يتكرر للدمج (AND)
 *   &gems=1    Hidden Gems فقط
 *   &lat=&lon= موقع المستخدم (يُتجاهل خارج بالي) &radius= كم (افتراضي 5، أقصى 60)
 *   &locale=   en | ar | id
 *
 * لا تخزين مؤقت: النتيجة تعتمد على صلاحيات من يسأل.
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'

import { parseLatLon } from '@/lib/geo'
import { searchPlaces } from '@/lib/search/places'
import { logActivity } from '@/lib/security/activity'

import { localeOf, NO_STORE, viewer } from '../_viewer'

export const dynamic = 'force-dynamic'

const KEY = z.string().regex(/^[a-z0-9-]{1,64}$/)

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url)
  const p = url.searchParams
  const locale = localeOf(p.get('locale'))

  const region = KEY.safeParse(p.get('region') ?? '')
  const category = KEY.safeParse(p.get('category') ?? '')
  const tags = p
    .getAll('tag')
    .slice(0, 5)
    .filter((tag) => KEY.safeParse(tag).success)
  const radius = Number.parseFloat(p.get('radius') ?? '')

  const who = await viewer('map_search')
  const result = await searchPlaces(
    {
      q: p.get('q'),
      region: region.success ? region.data : null,
      category: category.success ? category.data : null,
      tags,
      gemsOnly: p.get('gems') === '1',
      near: parseLatLon(p.get('lat'), p.get('lon')),
      radiusKm: Number.isFinite(radius) ? radius : null,
      limit: 40,
    },
    who.held,
    locale,
  )

  if (who.userId !== null) {
    await logActivity({
      action: 'search_map',
      userId: who.userId,
      ip: who.ip,
      deviceId: who.deviceId,
      // الموقع لا يُخزَّن — فقط هل استُخدم.
      details: {
        q: p.get('q')?.slice(0, 80) ?? null,
        region: result.region,
        category: category.success ? category.data : null,
        tags,
        gems: p.get('gems') === '1',
        nearby: result.usedLocation,
        nearMe: result.nearMe,
        hits: result.hits.length,
      },
    })
  }

  return NextResponse.json(result, { headers: NO_STORE })
}
