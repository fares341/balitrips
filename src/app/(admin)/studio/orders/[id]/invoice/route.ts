import { invoiceAvailable, invoiceRendered, loadOrderInvoice, presignOrderInvoice } from '@/lib/pdf'
import { contentDisposition, isStorageConfigured, localPrivateRoot } from '@/lib/storage'

import { isUuid } from '../../../../_lib/form'
import { getAdminI18n } from '../../../../_lib/i18n'
import { requireCapability } from '../../../../_lib/session'

/** Phase 4: download an order's numbered invoice (PDF) from the Studio. */
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' }

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireCapability('orders.read')
  const { id } = await params
  if (!isUuid(id) || !(await invoiceAvailable(id, null))) {
    return new Response(null, { status: 404, headers: NO_STORE })
  }
  const pending = async () => {
    const { t } = await getAdminI18n()
    return new Response(t('fin.invoice_pending'), {
      status: 404,
      headers: { ...NO_STORE, 'Content-Type': 'text/plain; charset=utf-8' },
    })
  }
  if (!(await invoiceRendered(id))) {
    try {
      const { enqueueInvoicePdf } = await import('@/worker/queues')
      await enqueueInvoicePdf(id)
    } catch (error) {
      console.error('[invoice] could not queue the render', error)
    }
    return pending()
  }
  if (!isStorageConfigured()) {
    const local = localPrivateRoot() === null ? null : await loadOrderInvoice(id, null)
    if (local === null) return pending()
    return new Response(Buffer.from(local.bytes), {
      headers: {
        ...NO_STORE,
        'Content-Type': 'application/pdf',
        'Content-Disposition': contentDisposition(local.filename),
      },
    })
  }
  const url = await presignOrderInvoice(id, null, { expiresInSeconds: 60 })
  if (url === null) return pending()
  return Response.redirect(url, 302)
}
