/**
 * Phase 4: an attachment on the customer's own support ticket. Only messages
 * the customer can see (not staff notes), only on their own ticket.
 */

import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { db } from '@/db'
import { supportTicketMessages, supportTickets } from '@/db/schema'
import { checkSecureAccess } from '@/lib/security/guard'
import { contentDisposition, readPrivateObject } from '@/lib/storage'

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(
  request: Request,
  { params }: { params: Promise<{ locale: string; number: string }> },
) {
  const { number } = await params
  const access = await checkSecureAccess(`support:${number}`)
  if (!access.ok) return new NextResponse(null, { status: 404, headers: NO_STORE })
  const url = new URL(request.url)
  const messageId = url.searchParams.get('m') ?? ''
  const index = Number(url.searchParams.get('i') ?? '0')
  if (!UUID.test(messageId) || !Number.isInteger(index) || index < 0) {
    return new NextResponse(null, { status: 404, headers: NO_STORE })
  }
  const [row] = await db
    .select({ attachments: supportTicketMessages.attachments })
    .from(supportTicketMessages)
    .innerJoin(supportTickets, eq(supportTickets.id, supportTicketMessages.ticketId))
    .where(
      and(
        eq(supportTicketMessages.id, messageId),
        eq(supportTicketMessages.internal, false),
        eq(supportTickets.number, number),
        eq(supportTickets.userId, access.user.id),
      ),
    )
    .limit(1)
  const file = row?.attachments?.[index]
  if (!file) return new NextResponse(null, { status: 404, headers: NO_STORE })
  const bytes = await readPrivateObject(file.key)
  if (bytes === null) return new NextResponse(null, { status: 404, headers: NO_STORE })
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      ...NO_STORE,
      'Content-Type': file.contentType,
      'Content-Disposition': contentDisposition(file.filename),
    },
  })
}
