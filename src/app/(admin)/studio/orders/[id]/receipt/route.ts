import { contentDisposition, isStorageConfigured, localPrivateRoot } from '@/lib/storage'
import { loadOrderVoucher, presignOrderVoucher } from '@/lib/pdf'

import { isUuid } from '../../../../_lib/form'
import { getAdminI18n } from '../../../../_lib/i18n'
import { requireCapability } from '../../../../_lib/session'

/** تحميل إيصال الطلب (PDF) من لوحة التحكم — "إصدار إيصال". */
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' }

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireCapability('orders.read')
  const { id } = await params
  if (!isUuid(id)) return new Response(null, { status: 404, headers: NO_STORE })
  if (!isStorageConfigured()) {
    // Single-host production: the receipt lives on the local private volume.
    const local = localPrivateRoot() === null ? null : await loadOrderVoucher(id, null)
    if (local === null) {
      const { t } = await getAdminI18n()
      return new Response(t('orders.receipt_missing_local'), {
        status: 404,
        headers: NO_STORE,
      })
    }
    return new Response(Buffer.from(local.bytes), {
      headers: {
        ...NO_STORE,
        'Content-Type': 'application/pdf',
        'Content-Disposition': contentDisposition(local.filename),
      },
    })
  }
  const url = await presignOrderVoucher(id, null, { expiresInSeconds: 60 })
  if (url === null) {
    const { t } = await getAdminI18n()
    return new Response(t('orders.receipt_missing'), {
      status: 404,
      headers: NO_STORE,
    })
  }
  return Response.redirect(url, 302)
}
