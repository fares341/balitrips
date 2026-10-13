/**
 * POST /api/places/search-log — تسجيل بحث الخريطة (`search_map`).
 *
 * الخريطة تفلتر في المتصفح ولا تستدعي `/api/places/search`، فكان بحثها لا
 * يُسجَّل أبداً. `useMapFilters` يرسل هنا الجملة بعد توقف الكتابة (≥ 1.5 ث)،
 * غير فارغة ومختلفة عن آخر ما أُرسل — لا مع كل حرف.
 *
 * الزائر بلا حساب يُتجاهل (204). حد: نفس الجملة مرة في الدقيقة، و
 * `MAX_PER_MINUTE` عملية بحث في الدقيقة لكل مستخدم. الموقع لا يُخزَّن — فقط هل
 * استُخدم.
 */

import { and, eq, gte, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { db } from '@/db'
import { activityLog } from '@/db/schema'
import { logActivity } from '@/lib/security/activity'
import { checkSecureAccess } from '@/lib/security/guard'

export const dynamic = 'force-dynamic'

const MAX_PER_MINUTE = 20

const KEY = z.string().regex(/^[a-z0-9-]{1,64}$/)

const Body = z.object({
  q: z.string().trim().min(1).max(200),
  areaKey: KEY.nullable().catch(null),
  categories: z.array(KEY).max(5).catch([]),
  tag: KEY.nullable().catch(null),
  gems: z.boolean().catch(false),
  nearMe: z.boolean().catch(false),
  results: z.number().int().min(0).max(100_000).catch(0),
})

export async function POST(request: Request): Promise<NextResponse> {
  const done = new NextResponse(null, { status: 204 })

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return done
  }
  const parsed = Body.safeParse(raw)
  if (!parsed.success) return done

  const access = await checkSecureAccess('map_search_log')
  if (!access.ok) return done

  const q = parsed.data.q.slice(0, 80)
  const [recent] = await db
    .select({
      total: sql<number>`count(*)::int`,
      same: sql<number>`count(*) filter (where ${activityLog.details}->>'q' = ${q})::int`,
    })
    .from(activityLog)
    .where(
      and(
        eq(activityLog.userId, access.user.id),
        eq(activityLog.action, 'search_map'),
        gte(activityLog.createdAt, new Date(Date.now() - 60_000)),
      ),
    )
  if ((recent?.same ?? 0) > 0 || (recent?.total ?? 0) >= MAX_PER_MINUTE) return done

  await logActivity({
    action: 'search_map',
    userId: access.user.id,
    ip: access.ip,
    deviceId: access.deviceId,
    details: {
      q,
      source: 'map',
      areaKey: parsed.data.areaKey,
      categories: parsed.data.categories,
      tag: parsed.data.tag,
      gems: parsed.data.gems,
      nearMe: parsed.data.nearMe,
      results: parsed.data.results,
    },
  })
  return done
}
