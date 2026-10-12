/**
 * إيصال الطلب (PDF) للعميل — "سجل المدفوعات" و"إصدار إيصال".
 * الملكية تُفحص في `presignOrderVoucher`؛ رابط موقّع قصير العمر.
 */

import { NextResponse } from 'next/server'

import { defaultLocale, isLocale } from '@/i18n/config'
import { getPathname } from '@/i18n/routing'
import { presignOrderVoucher } from '@/lib/pdf'
import { checkSecureAccess } from '@/lib/security/guard'
import { isStorageConfigured } from '@/lib/storage'

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(
  request: Request,
  { params }: { params: Promise<{ locale: string; orderId: string }> },
) {
  const { locale: raw, orderId } = await params
  const locale = isLocale(raw) ? raw : defaultLocale
  const access = await checkSecureAccess(`receipt:${orderId}`)
  const back = (query: Record<string, string>) =>
    NextResponse.redirect(
      new URL(getPathname({ href: { pathname: '/account/invoices', query }, locale }), request.url),
      { headers: NO_STORE },
    )
  if (!access.ok) {
    return NextResponse.redirect(new URL(getPathname({ href: '/account', locale }), request.url), {
      headers: NO_STORE,
    })
  }
  if (!UUID.test(orderId)) return new NextResponse(null, { status: 404, headers: NO_STORE })
  if (!isStorageConfigured()) return back({ receipt: 'pending' })

  const url = await presignOrderVoucher(orderId, access.user.id, { expiresInSeconds: 60 })
  if (url === null) return back({ receipt: 'pending' })
  return NextResponse.redirect(url, { headers: NO_STORE })
}
