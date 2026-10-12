/**
 * GET /api/notifications/count — عدد غير المقروء لجرس الرأس.
 *
 * الرأس مكوّن عميل يُخدم من الكاش، فلا يقرأ الجلسة على الخادم؛ يسأل هنا بعد
 * التحميل. زائر بلا كوكي جلسة يُجاب فوراً بلا استعلام.
 */

import { and, count, eq, isNull } from 'drizzle-orm'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { db } from '@/db'
import { notifications } from '@/db/schema'
import { getUser } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'private, no-store' }

export async function GET(): Promise<NextResponse> {
  const jar = await cookies()
  if (!jar.has('bt.session_token') && !jar.has('__Secure-bt.session_token')) {
    return NextResponse.json({ unread: 0 }, { headers: NO_STORE })
  }
  const user = await getUser()
  if (user === null) return NextResponse.json({ unread: 0 }, { headers: NO_STORE })

  const [row] = await db
    .select({ value: count() })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, user.id),
        eq(notifications.audience, 'user'),
        isNull(notifications.readAt),
      ),
    )
  return NextResponse.json({ unread: row?.value ?? 0 }, { headers: NO_STORE })
}
