'use server'

import { eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'

import { isStudioRole } from '@/lib/auth/roles'
import { db } from '@/db'
import { supportSavedReplies, supportTickets, users } from '@/db/schema'
import {
  createTicket,
  moveTicket,
  replyToTicket,
  ticketCategory,
  ticketPriority,
  TicketError,
} from '@/lib/support/service'

import { adminHref } from '../../_lib/admin-path'
import { writeAudit } from '../../_lib/audit'
import { fbool, fenum, freq, fstr, fuuidOrNull, isUuid } from '../../_lib/form'
import { getAdminI18n } from '../../_lib/i18n'
import { errorMessage, isRedirectError, withOutcome } from '../../_lib/result'
import { requireCapability } from '../../_lib/session'

/** Support (الدعم) in the Studio. `crm.write` (staff and admin). */

type Outcome = { ok: string } | { err: string }
const LIST = adminHref('/support')
const detail = (id: string) => adminHref(`/support/${id}`)

async function translateError(error: unknown): Promise<string> {
  const { t } = await getAdminI18n()
  if (error instanceof TicketError) return t(`support.err_${error.code}`)
  return errorMessage(error)
}

export async function staffReply(id: string, form: FormData): Promise<void> {
  const session = await requireCapability('crm.write')
  const { t } = await getAdminI18n()
  let outcome: Outcome
  try {
    if (!isUuid(id)) throw new TicketError('not_found')
    const internal = fbool(form, 'internal')
    const next = await replyToTicket({
      ticketId: id,
      author: { type: 'staff', userId: session.userId },
      body: freq(form, 'body', t('support.message')),
      internal,
      attachment: form.get('attachment'),
      resolve: !internal && fbool(form, 'resolve'),
    })
    await writeAudit({
      actor: session,
      action: internal ? 'ticket.note' : 'ticket.reply',
      entityType: 'support_ticket',
      entityId: id,
      before: null,
      after: { status: next },
    })
    outcome = { ok: t(internal ? 'support.ok_note' : 'support.ok_reply') }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: await translateError(error) }
  }
  redirect(withOutcome(detail(id), outcome))
}

export async function updateTicket(id: string, form: FormData): Promise<void> {
  const session = await requireCapability('crm.write')
  const { t } = await getAdminI18n()
  let outcome: Outcome
  try {
    if (!isUuid(id)) throw new TicketError('not_found')
    const assigneeId = fuuidOrNull(form, 'assigneeId', t('support.assignee'))
    if (assigneeId !== null) {
      const [staff] = await db
        .select({ role: users.role })
        .from(users)
        .where(eq(users.id, assigneeId))
        .limit(1)
      if (!staff || !isStudioRole(staff.role)) throw new Error(t('crm.err_assignee'))
    }
    const [before] = await db
      .select({
        priority: supportTickets.priority,
        category: supportTickets.category,
        assigneeId: supportTickets.assigneeId,
      })
      .from(supportTickets)
      .where(eq(supportTickets.id, id))
      .limit(1)
    if (!before) throw new TicketError('not_found')
    const after = {
      priority: ticketPriority(fstr(form, 'priority')),
      category: ticketCategory(fstr(form, 'category')),
      assigneeId,
    }
    await db
      .update(supportTickets)
      .set({ ...after, updatedAt: new Date() })
      .where(eq(supportTickets.id, id))
    await writeAudit({
      actor: session,
      action: 'ticket.update',
      entityType: 'support_ticket',
      entityId: id,
      before,
      after,
    })
    outcome = { ok: t('support.ok_updated') }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: await translateError(error) }
  }
  redirect(withOutcome(detail(id), outcome))
}

export async function changeTicketStatus(id: string, form: FormData): Promise<void> {
  const session = await requireCapability('crm.write')
  const { t } = await getAdminI18n()
  let outcome: Outcome
  try {
    if (!isUuid(id)) throw new TicketError('not_found')
    const event = fenum(form, 'event', ['resolve', 'close', 'reopen'] as const, 'resolve')
    const next = await moveTicket(id, event)
    await writeAudit({
      actor: session,
      action: `ticket.${event}`,
      entityType: 'support_ticket',
      entityId: id,
      before: null,
      after: { status: next },
    })
    outcome = { ok: t('support.ok_status') }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: await translateError(error) }
  }
  redirect(withOutcome(detail(id), outcome))
}

/** Staff open a ticket for a customer (e.g. after a phone call). */
export async function openTicketForCustomer(form: FormData): Promise<void> {
  const session = await requireCapability('crm.write')
  const { t } = await getAdminI18n()
  let target = LIST
  let outcome: Outcome
  try {
    const email = freq(form, 'email', t('common.email')).toLowerCase()
    const [customer] = await db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(eq(users.email, email))
      .limit(1)
    const created = await createTicket({
      userId: customer?.id ?? null,
      email,
      name: customer?.name ?? null,
      orderId: null,
      subject: freq(form, 'subject', t('support.subject')),
      category: ticketCategory(fstr(form, 'category')),
      priority: ticketPriority(fstr(form, 'priority')),
      body: freq(form, 'body', t('support.message')),
      source: 'staff',
      staffAuthorId: session.userId,
    })
    await writeAudit({
      actor: session,
      action: 'ticket.open_for_customer',
      entityType: 'support_ticket',
      entityId: created.id,
      before: null,
      after: { number: created.number },
    })
    target = detail(created.id)
    outcome = { ok: t('support.ok_created', { number: created.number }) }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: await translateError(error) }
  }
  redirect(withOutcome(target, outcome))
}

export async function saveReplyTemplate(form: FormData): Promise<void> {
  const session = await requireCapability('crm.write')
  const { t } = await getAdminI18n()
  let outcome: Outcome
  try {
    const title = freq(form, 'title', t('support.template_title')).slice(0, 120)
    const body = freq(form, 'body', t('support.template_body')).slice(0, 5000)
    const [row] = await db
      .insert(supportSavedReplies)
      .values({ title, body, createdBy: session.userId })
      .returning({ id: supportSavedReplies.id })
    await writeAudit({
      actor: session,
      action: 'saved_reply.create',
      entityType: 'saved_reply',
      entityId: row?.id ?? null,
      before: null,
      after: { title },
    })
    outcome = { ok: t('support.ok_template') }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  redirect(withOutcome(`${LIST}?view=templates`, outcome))
}

export async function deleteReplyTemplate(id: string): Promise<void> {
  const session = await requireCapability('crm.write')
  const { t } = await getAdminI18n()
  let outcome: Outcome
  try {
    if (!isUuid(id)) throw new Error(t('support.err_not_found'))
    await db.delete(supportSavedReplies).where(eq(supportSavedReplies.id, id))
    await writeAudit({
      actor: session,
      action: 'saved_reply.delete',
      entityType: 'saved_reply',
      entityId: id,
      before: null,
      after: null,
    })
    outcome = { ok: t('support.ok_template_deleted') }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  redirect(withOutcome(`${LIST}?view=templates`, outcome))
}
