import { eq } from 'drizzle-orm'

import { db } from '@/db'
import { supportTicketMessages } from '@/db/schema'
import { contentDisposition, readPrivateObject } from '@/lib/storage'

import { isUuid } from '../../../../_lib/form'
import { requireCapability } from '../../../../_lib/session'

/** A ticket attachment, from private storage, for staff (`crm.write`). */
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' }

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireCapability('crm.write')
  const { id } = await params
  const url = new URL(request.url)
  const messageId = url.searchParams.get('m') ?? ''
  const index = Number(url.searchParams.get('i') ?? '0')
  if (!isUuid(id) || !isUuid(messageId) || !Number.isInteger(index) || index < 0) {
    return new Response(null, { status: 404, headers: NO_STORE })
  }
  const [message] = await db
    .select({
      ticketId: supportTicketMessages.ticketId,
      attachments: supportTicketMessages.attachments,
    })
    .from(supportTicketMessages)
    .where(eq(supportTicketMessages.id, messageId))
    .limit(1)
  const file = message?.ticketId === id ? message.attachments?.[index] : undefined
  if (!file) return new Response(null, { status: 404, headers: NO_STORE })
  const bytes = await readPrivateObject(file.key)
  if (bytes === null) return new Response(null, { status: 404, headers: NO_STORE })
  return new Response(Buffer.from(bytes), {
    headers: {
      ...NO_STORE,
      'Content-Type': file.contentType,
      'Content-Disposition': contentDisposition(file.filename),
    },
  })
}
