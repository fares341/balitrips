/**
 * POST /api/activity/page — "الصفحات التي زارها" (الوثيقة 15.2).
 *
 * يرسله `PageViewBeacon` عند كل تنقل. الزائر بلا حساب يُتجاهل (204) — لا نتتبع
 * المجهولين. المسار وحده يُخزَّن (بلا query string: قد يحمل بيانات شخصية).
 */

import { NextResponse } from 'next/server'
import { headers } from 'next/headers'

import { getSession } from '@/lib/auth/session'
import { logActivity } from '@/lib/security/activity'
import { clientIp } from '@/lib/security/ip'

export const dynamic = 'force-dynamic'

export async function POST(request: Request): Promise<NextResponse> {
  const session = await getSession()
  if (session === null) return new NextResponse(null, { status: 204 })

  let path: unknown = null
  try {
    path = ((await request.json()) as { path?: unknown }).path
  } catch {
    return new NextResponse(null, { status: 204 })
  }
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) {
    return new NextResponse(null, { status: 204 })
  }
  const clean = path.split(/[?#]/)[0]?.slice(0, 200) ?? ''

  await logActivity({
    action: 'page_view',
    userId: session.user.id,
    ip: clientIp(await headers()),
    details: { path: clean },
  })
  return new NextResponse(null, { status: 204 })
}
