'use server'

/**
 * Phase 4: the customer's side of support — open a ticket, reply, rate the
 * answer. Every action re-checks the signed-in account owns the ticket.
 */

import { and, eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'

import { db } from '@/db'
import { orders, supportTickets } from '@/db/schema'
import { defaultLocale, isLocale, type Locale } from '@/i18n/config'
import { getPathname } from '@/i18n/routing'
import { activeUserOrNull } from '@/lib/security/require'
import {
  createTicket,
  rateTicket,
  replyToTicket,
  ticketCategory,
  TicketError,
} from '@/lib/support/service'

function localeOf(value: FormDataEntryValue | null): Locale {
  return typeof value === 'string' && isLocale(value) ? value : defaultLocale
}

function text(form: FormData, name: string): string {
  const value = form.get(name)
  return typeof value === 'string' ? value.trim() : ''
}

function go(locale: Locale, pathname: string, query: Record<string, string> = {}): never {
  redirect(getPathname({ href: { pathname, query }, locale }))
}

function codeOf(error: unknown): string {
  if (error instanceof TicketError) return error.code
  console.error('[support] customer action failed', error)
  return 'failed'
}

async function ownTicket(userId: string, number: string) {
  const [ticket] = await db
    .select({ id: supportTickets.id, number: supportTickets.number })
    .from(supportTickets)
    .where(and(eq(supportTickets.number, number), eq(supportTickets.userId, userId)))
    .limit(1)
  return ticket ?? null
}

export async function createTicketAction(form: FormData): Promise<never> {
  const locale = localeOf(form.get('locale'))
  const user = await activeUserOrNull('account:support')
  if (user === null) go(locale, '/account')

  // An order may be linked only if it is this customer's own.
  let orderId: string | null = null
  const orderNumber = text(form, 'orderNumber')
  if (orderNumber !== '') {
    const [order] = await db
      .select({ id: orders.id })
      .from(orders)
      .where(and(eq(orders.orderNumber, orderNumber), eq(orders.userId, user.id)))
      .limit(1)
    orderId = order?.id ?? null
  }

  let number: string
  try {
    const created = await createTicket({
      userId: user.id,
      email: user.email,
      name: user.name ?? null,
      orderId,
      subject: text(form, 'subject'),
      category: ticketCategory(text(form, 'category')),
      // Customers do not set priority; staff triage it.
      priority: 'normal',
      body: text(form, 'body'),
      source: 'account',
      attachment: form.get('attachment'),
    })
    number = created.number
  } catch (error) {
    go(locale, '/account/support', { error: codeOf(error) })
  }
  go(locale, `/account/support/${number}`, { sent: '1' })
}

export async function replyTicketAction(number: string, form: FormData): Promise<never> {
  const locale = localeOf(form.get('locale'))
  const user = await activeUserOrNull('account:support')
  if (user === null) go(locale, '/account')
  const ticket = await ownTicket(user.id, number)
  if (ticket === null) go(locale, '/account/support')
  try {
    await replyToTicket({
      ticketId: ticket.id,
      author: { type: 'customer', userId: user.id },
      body: text(form, 'body'),
      attachment: form.get('attachment'),
    })
  } catch (error) {
    go(locale, `/account/support/${ticket.number}`, { error: codeOf(error) })
  }
  go(locale, `/account/support/${ticket.number}`, { sent: '1' })
}

export async function rateTicketAction(number: string, form: FormData): Promise<never> {
  const locale = localeOf(form.get('locale'))
  const user = await activeUserOrNull('account:support')
  if (user === null) go(locale, '/account')
  const ticket = await ownTicket(user.id, number)
  if (ticket === null) go(locale, '/account/support')
  try {
    await rateTicket(ticket.id, Number(text(form, 'rating')), text(form, 'comment') || null)
  } catch (error) {
    go(locale, `/account/support/${ticket.number}`, { error: codeOf(error) })
  }
  go(locale, `/account/support/${ticket.number}`, { rated: '1' })
}
