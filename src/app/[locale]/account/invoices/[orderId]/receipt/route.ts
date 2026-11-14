/**
 * إيصال الطلب (PDF) للعميل — "سجل المدفوعات" و"إصدار إيصال".
 * الملكية تُفحص في `presignOrderVoucher`؛ رابط موقّع قصير العمر.
 */

import { NextResponse } from 'next/server'

import { fallbackLocale, isLocale } from '@/i18n/config'
import { getPathname } from '@/i18n/routing'
import { loadOrderVoucher, presignOrderVoucher } from '@/lib/pdf'
import { checkSecureAccess } from '@/lib/security/guard'
import { contentDisposition, isStorageConfigured, localPrivateRoot } from '@/lib/storage'
import { localRedirect } from '@/lib/http/local-redirect'

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(
  request: Request,
  { params }: { params: Promise<{ locale: string; orderId: string }> },
) {
  const { locale: raw, orderId } = await params
  const locale = isLocale(raw) ? raw : fallbackLocale
  const access = await checkSecureAccess(`receipt:${orderId}`)
  const back = (query: Record<string, string>) =>
    localRedirect(getPathname({ href: { pathname: '/account/invoices', query }, locale }), {
      headers: NO_STORE,
    })
  if (!access.ok) {
    return localRedirect(getPathname({ href: '/account', locale }), {
      headers: NO_STORE,
    })
  }
  if (!UUID.test(orderId)) return new NextResponse(null, { status: 404, headers: NO_STORE })
  if (!isStorageConfigured()) {
    // تشغيل خادم واحد بلا Spaces: الإيصال من المجلد الخاص المحلي.
    const local =
      localPrivateRoot() === null ? null : await loadOrderVoucher(orderId, access.user.id)
    if (local === null) return back({ receipt: 'pending' })
    return new NextResponse(Buffer.from(local.bytes), {
      headers: {
        ...NO_STORE,
        'Content-Type': 'application/pdf',
        'Content-Disposition': contentDisposition(local.filename),
      },
    })
  }

  const url = await presignOrderVoucher(orderId, access.user.id, { expiresInSeconds: 60 })
  if (url === null) return back({ receipt: 'pending' })
  return NextResponse.redirect(url, { headers: NO_STORE })
}
