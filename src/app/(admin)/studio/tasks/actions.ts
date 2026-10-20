'use server'

import { eq, sql } from 'drizzle-orm'
import { redirect } from 'next/navigation'

import { db } from '@/db'
import { crmTasks, customTripRequests, orders, users } from '@/db/schema'

import { adminHref } from '../../_lib/admin-path'
import { writeAudit } from '../../_lib/audit'
import { fdate, fenum, freq, fstr, fuuidOrNull, isUuid } from '../../_lib/form'
import { getAdminI18n } from '../../_lib/i18n'
import { errorMessage, isRedirectError, withOutcome } from '../../_lib/result'
import { requireCapability } from '../../_lib/session'

/**
 * Follow-up tasks (المهام). A task can point at a customer, a custom-trip
 * request and/or an order; the worker reminds the person it is assigned to
 * on the due date (`crm.sweep`). `crm.write`.
 */

/** Only Studio-relative paths the forms themselves send. */
function backPath(form: FormData): string {
  const value = fstr(form, 'back') ?? '/tasks'
  return /^\/(tasks|customers\/[0-9a-f-]{36}|leads\/[0-9a-f-]{36}|orders\/[0-9a-f-]{36}|support\/[0-9a-f-]{36})$/i.test(
    value,
  )
    ? value
    : '/tasks'
}

export async function createTask(form: FormData): Promise<void> {
  const session = await requireCapability('crm.write')
  const { t } = await getAdminI18n()
  const target = adminHref(backPath(form))
  let outcome: { ok: string } | { err: string }
  try {
    const title = freq(form, 'title', t('tasks.task')).slice(0, 200)
    const notes = (fstr(form, 'notes') ?? '').slice(0, 4000) || null
    const dueDate = fdate(form, 'dueDate', t('tasks.due'))
    const assigneeId = fuuidOrNull(form, 'assigneeId', t('tasks.assignee')) ?? session.userId
    let customerId = fuuidOrNull(form, 'customerId', t('tasks.customer'))
    const leadId = fuuidOrNull(form, 'leadId', t('tasks.lead'))
    let orderId = fuuidOrNull(form, 'orderId', t('tasks.order'))

    // Typed links: a customer's e-mail, an order number.
    const customerEmail = fstr(form, 'customerEmail')
    if (customerId === null && customerEmail !== null) {
      const [row] = await db
        .select({ id: users.id })
        .from(users)
        .where(sql`lower(${users.email}) = lower(${customerEmail})`)
        .limit(1)
      if (!row) throw new Error(t('tasks.err_customer'))
      customerId = row.id
    }
    const orderNumber = fstr(form, 'orderNumber')
    if (orderId === null && orderNumber !== null) {
      const [row] = await db
        .select({ id: orders.id, userId: orders.userId })
        .from(orders)
        .where(eq(orders.orderNumber, orderNumber.toUpperCase()))
        .limit(1)
      if (!row) throw new Error(t('tasks.err_order'))
      orderId = row.id
      customerId ??= row.userId
    }
    if (leadId !== null) {
      const [row] = await db
        .select({ id: customTripRequests.id })
        .from(customTripRequests)
        .where(eq(customTripRequests.id, leadId))
        .limit(1)
      if (!row) throw new Error(t('tasks.err_lead'))
    }
    const [assignee] = await db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, assigneeId))
      .limit(1)
    if (!assignee || assignee.role === 'customer') throw new Error(t('crm.err_assignee'))

    const [row] = await db
      .insert(crmTasks)
      .values({
        title,
        notes,
        dueDate,
        assigneeId,
        customerId,
        leadId,
        orderId,
        createdBy: session.userId,
      })
      .returning({ id: crmTasks.id })
    await writeAudit({
      actor: session,
      action: 'task.create',
      entityType: 'crm_task',
      entityId: row?.id ?? null,
      before: null,
      after: { title, dueDate, assigneeId, customerId, leadId, orderId },
    })
    outcome = { ok: t('tasks.ok_created') }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  redirect(withOutcome(target, outcome))
}

export async function setTaskStatus(id: string, form: FormData): Promise<void> {
  const session = await requireCapability('crm.write')
  const { t } = await getAdminI18n()
  const target = adminHref(backPath(form))
  let outcome: { ok: string } | { err: string }
  try {
    if (!isUuid(id)) throw new Error(t('tasks.err_gone'))
    const status = fenum(form, 'status', ['open', 'done', 'cancelled'] as const, 'done')
    const [before] = await db
      .select({ status: crmTasks.status })
      .from(crmTasks)
      .where(eq(crmTasks.id, id))
      .limit(1)
    if (!before) throw new Error(t('tasks.err_gone'))
    await db
      .update(crmTasks)
      .set({
        status,
        completedAt: status === 'open' ? null : new Date(),
        // Reopened: remind again on the due date.
        ...(status === 'open' ? { remindedAt: null } : {}),
        updatedAt: new Date(),
      })
      .where(eq(crmTasks.id, id))
    await writeAudit({
      actor: session,
      action: `task.${status}`,
      entityType: 'crm_task',
      entityId: id,
      before,
      after: { status },
    })
    outcome = { ok: t('tasks.ok_status') }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  redirect(withOutcome(target, outcome))
}
