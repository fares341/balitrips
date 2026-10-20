/**
 * Phase 4: the customer's numbered invoice (PDF). Ownership is checked in
 * `presignOrderInvoice` / `loadOrderInvoice`; the link is short-lived. Not
 * rendered yet → the render is queued and the customer is told it is coming.
 */

import { NextResponse } from 'next/server'

import { defaultLocale, isLocale } from '@/i18n/config'
import { getPathname } from '@/i18n/routing'
import { invoiceAvailable, invoiceRendered, loadOrderInvoice, presignOrderInvoice } from '@/lib/pdf'
import { checkSecureAccess } from '@/lib/security/guard'
import { contentDisposition, isStorageConfigured, localPrivateRoot } from '@/lib/storage'

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(
  request: Request,
  { params }: { params: Promise<{ locale: string; orderId: string }> },
) {
  const { locale: raw, orderId } = await params
  const locale = isLocale(raw) ? raw : defaultLocale
  const access = await checkSecureAccess(`invoice:${orderId}`)
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
  if (!(await invoiceAvailable(orderId, access.user.id))) {
    return new NextResponse(null, { status: 404, headers: NO_STORE })
  }
  if (!(await invoiceRendered(orderId))) {
    try {
      const { enqueueInvoicePdf } = await import('@/worker/queues')
      await enqueueInvoicePdf(orderId)
    } catch (error) {
      console.error('[invoice] could not queue the render', error)
    }
    return back({ invoice: 'pending' })
  }
  if (!isStorageConfigured()) {
    const local =
      localPrivateRoot() === null ? null : await loadOrderInvoice(orderId, access.user.id)
    if (local === null) return back({ invoice: 'pending' })
    return new NextResponse(Buffer.from(local.bytes), {
      headers: {
        ...NO_STORE,
        'Content-Type': 'application/pdf',
        'Content-Disposition': contentDisposition(local.filename),
      },
    })
  }
  const url = await presignOrderInvoice(orderId, access.user.id, { expiresInSeconds: 60 })
  if (url === null) return back({ invoice: 'pending' })
  return NextResponse.redirect(url, { headers: NO_STORE })
}
