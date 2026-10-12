import { isStorageConfigured } from '@/lib/storage'
import { presignOrderVoucher } from '@/lib/pdf'

import { isUuid } from '../../../../_lib/form'
import { requireCapability } from '../../../../_lib/session'

/** تحميل إيصال الطلب (PDF) من لوحة التحكم — "إصدار إيصال". */
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' }

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireCapability('orders.read')
  const { id } = await params
  if (!isUuid(id)) return new Response(null, { status: 404, headers: NO_STORE })
  if (!isStorageConfigured()) {
    return new Response('Object storage is not configured; receipts cannot be served.', {
      status: 503,
      headers: NO_STORE,
    })
  }
  const url = await presignOrderVoucher(id, null, { expiresInSeconds: 60 })
  if (url === null) {
    return new Response('No receipt for this order (unpaid, or not generated yet).', {
      status: 404,
      headers: NO_STORE,
    })
  }
  return Response.redirect(url, 302)
}
