import { randomUUID } from 'node:crypto'

import { eq, sql } from 'drizzle-orm'

import { db } from '@/db'
import {
  supportTicketMessages,
  supportTickets,
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  users,
  type TicketAttachment,
  type TicketCategory,
  type TicketPriority,
} from '@/db/schema'
import { isLocale, type Locale } from '@/i18n/config'
import { notifyStaff, notifyUser } from '@/lib/notify'
import { emailGuest } from '@/lib/notify/guest'
import { isPrivateStorageAvailable, uploadPrivate } from '@/lib/storage'

import {
  formatTicketNumber,
  isTicketStatus,
  nextTicketStatus,
  ticketTimestamps,
  type TicketEvent,
  type TicketStatus,
} from './tickets'

/**
 * Support tickets — the writes, shared by the customer's account pages, the
 * contact form and the Studio. Every state change goes through
 * `nextTicketStatus`, so the rules in `./tickets.ts` are the only rules.
 */

export class TicketError extends Error {
  constructor(readonly code: 'not_found' | 'closed' | 'invalid' | 'attachment') {
    super(code)
    this.name = 'TicketError'
  }
}

export function ticketCategory(value: unknown): TicketCategory {
  return (TICKET_CATEGORIES as readonly string[]).includes(String(value))
    ? (value as TicketCategory)
    : 'other'
}

export function ticketPriority(value: unknown): TicketPriority {
  return (TICKET_PRIORITIES as readonly string[]).includes(String(value))
    ? (value as TicketPriority)
    : 'normal'
}

/** Files customers and staff may attach: images and PDFs, 8 MB each. */
const ATTACHMENT_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024

/**
 * Store an attachment in PRIVATE storage under an unguessable key. Returns
 * null for "no file chosen". Throws `attachment` for a type or size we refuse,
 * or when no private storage is configured.
 */
export async function storeAttachment(
  ticketId: string,
  file: FormDataEntryValue | null,
): Promise<TicketAttachment | null> {
  if (!(file instanceof File) || file.size === 0) return null
  const extension = ATTACHMENT_TYPES[file.type]
  if (!extension || file.size > MAX_ATTACHMENT_BYTES || !isPrivateStorageAvailable()) {
    throw new TicketError('attachment')
  }
  const bytes = new Uint8Array(await file.arrayBuffer())
  const key = `support/${ticketId}/${randomUUID()}.${extension}`
  await uploadPrivate({ key, body: bytes, contentType: file.type })
  const filename = (file.name || `attachment.${extension}`).replace(/[\r\n"]/g, '').slice(0, 120)
  return { key, filename, bytes: bytes.byteLength, contentType: file.type }
}

async function nextTicketNumber(): Promise<string> {
  const rows = await db.execute<{ n: string }>(sql`select nextval('ticket_number_seq') as n`)
  const raw = rows[0]?.n
  if (raw === undefined) throw new Error('Could not allocate a ticket number')
  return formatTicketNumber(Number(raw))
}

export interface NewTicket {
  userId: string | null
  email: string | null
  name: string | null
  orderId: string | null
  subject: string
  category: TicketCategory
  priority: TicketPriority
  body: string
  source: 'account' | 'contact' | 'staff'
  attachment?: FormDataEntryValue | null
  /** Staff opening a ticket on a customer's behalf. */
  staffAuthorId?: string | null
  /** False when the caller already told the team (the contact form does). */
  notifyTeam?: boolean
}

export async function createTicket(input: NewTicket): Promise<{ id: string; number: string }> {
  const subject = input.subject.trim().slice(0, 200)
  const body = input.body.trim().slice(0, 10_000)
  if (subject === '' || body === '') throw new TicketError('invalid')
  const id = randomUUID()
  const attachment = await storeAttachment(id, input.attachment ?? null)
  const number = await nextTicketNumber()
  const now = new Date()
  await db.transaction(async (tx) => {
    await tx.insert(supportTickets).values({
      id,
      number,
      userId: input.userId,
      email: input.email?.trim().toLowerCase() || null,
      name: input.name?.trim().slice(0, 128) || null,
      orderId: input.orderId,
      subject,
      category: input.category,
      priority: input.priority,
      status: 'open',
      source: input.source,
      lastCustomerMessageAt: input.source === 'staff' ? null : now,
    })
    await tx.insert(supportTicketMessages).values({
      ticketId: id,
      authorType: input.source === 'staff' ? 'staff' : 'customer',
      authorId: input.source === 'staff' ? (input.staffAuthorId ?? null) : input.userId,
      body,
      internal: false,
      attachments: attachment ? [attachment] : null,
    })
  })
  if (input.source !== 'staff' && input.notifyTeam !== false) {
    await notifyStaff(
      'staff_ticket_new',
      { number, subject: subject.slice(0, 80), priority: input.priority },
      `/support/${id}`,
    )
  }
  return { id, number }
}

export interface ReplyInput {
  ticketId: string
  author: { type: 'staff' | 'customer'; userId: string | null }
  body: string
  internal?: boolean
  attachment?: FormDataEntryValue | null
  /** After the reply, also resolve the ticket (staff). */
  resolve?: boolean
}

/** Add a message and move the ticket along. Notifies the other side. */
export async function replyToTicket(input: ReplyInput): Promise<TicketStatus> {
  const body = input.body.trim().slice(0, 10_000)
  if (body === '') throw new TicketError('invalid')
  const internal = input.author.type === 'staff' && input.internal === true
  const event: TicketEvent = internal
    ? 'internal_note'
    : input.author.type === 'staff'
      ? 'staff_reply'
      : 'customer_reply'
  const attachment = await storeAttachment(input.ticketId, input.attachment ?? null)

  const result = await db.transaction(async (tx) => {
    const [ticket] = await tx
      .select()
      .from(supportTickets)
      .where(eq(supportTickets.id, input.ticketId))
      .for('update')
      .limit(1)
    if (!ticket) throw new TicketError('not_found')
    const current: TicketStatus = isTicketStatus(ticket.status) ? ticket.status : 'open'
    let next = nextTicketStatus(current, event)
    if (next === null) throw new TicketError('closed')
    const now = new Date()
    let stamps = ticketTimestamps(ticket, event, next, now)
    if (input.resolve && input.author.type === 'staff') {
      const resolved = nextTicketStatus(next, 'resolve')
      if (resolved !== null) {
        next = resolved
        stamps = { ...stamps, ...ticketTimestamps(ticket, 'resolve', resolved, now) }
      }
    }
    await tx.insert(supportTicketMessages).values({
      ticketId: ticket.id,
      authorType: input.author.type,
      authorId: input.author.userId,
      body,
      internal,
      attachments: attachment ? [attachment] : null,
    })
    await tx
      .update(supportTickets)
      .set({ status: next, ...stamps, updatedAt: now })
      .where(eq(supportTickets.id, ticket.id))
    return { ticket, next }
  })

  if (internal) return result.next
  const { ticket, next } = result
  if (input.author.type === 'staff') {
    await notifyCustomer(ticket, next === 'resolved' ? 'ticket_resolved' : 'ticket_reply')
  } else {
    await notifyStaff(
      'staff_ticket_reply',
      { number: ticket.number, subject: ticket.subject.slice(0, 80) },
      `/support/${ticket.id}`,
    )
  }
  return next
}

/** Staff changes status without a message (resolve, close, reopen). */
export async function moveTicket(ticketId: string, event: TicketEvent): Promise<TicketStatus> {
  const result = await db.transaction(async (tx) => {
    const [ticket] = await tx
      .select()
      .from(supportTickets)
      .where(eq(supportTickets.id, ticketId))
      .for('update')
      .limit(1)
    if (!ticket) throw new TicketError('not_found')
    const current: TicketStatus = isTicketStatus(ticket.status) ? ticket.status : 'open'
    const next = nextTicketStatus(current, event)
    if (next === null) throw new TicketError('invalid')
    const now = new Date()
    await tx
      .update(supportTickets)
      .set({ status: next, ...ticketTimestamps(ticket, event, next, now), updatedAt: now })
      .where(eq(supportTickets.id, ticketId))
    return { ticket, next }
  })
  if (event === 'resolve') await notifyCustomer(result.ticket, 'ticket_resolved')
  return result.next
}

/** The customer rates a resolved ticket 1–5; the ticket closes. */
export async function rateTicket(ticketId: string, rating: number, comment: string | null) {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new TicketError('invalid')
  await db.transaction(async (tx) => {
    const [ticket] = await tx
      .select()
      .from(supportTickets)
      .where(eq(supportTickets.id, ticketId))
      .for('update')
      .limit(1)
    if (!ticket) throw new TicketError('not_found')
    if (ticket.rating !== null) throw new TicketError('invalid')
    const current: TicketStatus = isTicketStatus(ticket.status) ? ticket.status : 'open'
    const next = nextTicketStatus(current, 'rate')
    if (next === null) throw new TicketError('invalid')
    const now = new Date()
    await tx
      .update(supportTickets)
      .set({
        status: next,
        rating,
        ratingComment: comment?.trim().slice(0, 2000) || null,
        ...ticketTimestamps(ticket, 'rate', next, now),
        updatedAt: now,
      })
      .where(eq(supportTickets.id, ticketId))
  })
}

async function notifyCustomer(
  ticket: typeof supportTickets.$inferSelect,
  type: 'ticket_reply' | 'ticket_resolved',
): Promise<void> {
  const params = { number: ticket.number, subject: ticket.subject.slice(0, 80) }
  if (ticket.userId !== null) {
    await notifyUser(ticket.userId, type, params, `/account/support/${ticket.number}`)
    return
  }
  // A guest (contact form): straight to their e-mail, in their language when known.
  let locale: Locale = 'en'
  if (ticket.email) {
    const [owner] = await db
      .select({ locale: users.locale })
      .from(users)
      .where(sql`lower(${users.email}) = ${ticket.email}`)
      .limit(1)
    if (owner && isLocale(owner.locale)) locale = owner.locale
  }
  await emailGuest({ to: ticket.email, locale, type, params, name: ticket.name, href: '/contact' })
}
