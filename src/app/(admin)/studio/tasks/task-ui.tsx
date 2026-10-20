import { and, asc, desc, eq, inArray, or, sql, type SQL } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import Link from 'next/link'

import { db } from '@/db'
import { crmTasks, customTripRequests, orders, users } from '@/db/schema'

import { adminHref } from '../../_lib/admin-path'
import { getAdminI18n } from '../../_lib/i18n'
import { Field, Select, TextInput } from '../../_ui/field'
import { Empty, Pill, Table } from '../../_ui/table'
import { createTask, setTaskStatus } from './actions'

/** Today in Bali, `YYYY-MM-DD`. */
export function baliToday(now = new Date()): string {
  return new Date(now.getTime() + 8 * 3_600_000).toISOString().slice(0, 10)
}

const assignee = alias(users, 'task_assignee')
const customer = alias(users, 'task_customer')

export async function loadTasks(where: SQL | undefined, limit = 200) {
  return db
    .select({
      id: crmTasks.id,
      title: crmTasks.title,
      notes: crmTasks.notes,
      dueDate: crmTasks.dueDate,
      status: crmTasks.status,
      assigneeName: sql<string | null>`coalesce(${assignee.name}, ${assignee.email})`,
      customerId: crmTasks.customerId,
      customerLabel: sql<string | null>`coalesce(${customer.name}, ${customer.email})`,
      leadId: crmTasks.leadId,
      leadName: customTripRequests.name,
      orderId: crmTasks.orderId,
      orderNumber: orders.orderNumber,
    })
    .from(crmTasks)
    .leftJoin(assignee, eq(assignee.id, crmTasks.assigneeId))
    .leftJoin(customer, eq(customer.id, crmTasks.customerId))
    .leftJoin(customTripRequests, eq(customTripRequests.id, crmTasks.leadId))
    .leftJoin(orders, eq(orders.id, crmTasks.orderId))
    .where(where)
    .orderBy(
      sql`case when ${crmTasks.status} = 'open' then 0 else 1 end`,
      asc(sql`coalesce(${crmTasks.dueDate}, '9999-12-31')`),
      desc(crmTasks.createdAt),
    )
    .limit(limit)
}

export type TaskRow = Awaited<ReturnType<typeof loadTasks>>[number]

/** Tasks linked to any of these: a customer, a lead, an order. None given → none. */
export async function tasksFor(link: {
  customerId?: string | undefined
  leadId?: string | undefined
  orderId?: string | undefined
}): Promise<TaskRow[]> {
  const parts: SQL[] = []
  if (link.customerId) parts.push(eq(crmTasks.customerId, link.customerId))
  if (link.leadId) parts.push(eq(crmTasks.leadId, link.leadId))
  if (link.orderId) parts.push(eq(crmTasks.orderId, link.orderId))
  if (parts.length === 0) return []
  return loadTasks(or(...parts), 50)
}

export async function TaskList({ tasks, back }: { tasks: readonly TaskRow[]; back: string }) {
  const { t } = await getAdminI18n()
  const today = baliToday()
  if (tasks.length === 0) return <Empty>{t('tasks.empty')}</Empty>
  return (
    <Table>
      <thead>
        <tr>
          <th>{t('tasks.task')}</th>
          <th>{t('tasks.due')}</th>
          <th>{t('tasks.assignee')}</th>
          <th>{t('tasks.linked')}</th>
          <th>{t('common.status')}</th>
        </tr>
      </thead>
      <tbody>
        {tasks.map((task) => {
          const overdue = task.status === 'open' && task.dueDate !== null && task.dueDate < today
          return (
            <tr key={task.id}>
              <td>
                <strong>{task.title}</strong>
                {task.notes ? <div className="a-muted">{task.notes}</div> : null}
              </td>
              <td className="a-mono">
                {task.dueDate ?? '—'}
                {overdue ? (
                  <div>
                    <Pill tone="bad">{t('tasks.overdue')}</Pill>
                  </div>
                ) : null}
              </td>
              <td>{task.assigneeName ?? '—'}</td>
              <td>
                {task.customerId ? (
                  <div>
                    <Link href={adminHref(`/customers/${task.customerId}`)}>
                      {task.customerLabel ?? t('tasks.customer')}
                    </Link>
                  </div>
                ) : null}
                {task.leadId ? (
                  <div>
                    <Link href={adminHref(`/leads/${task.leadId}`)}>
                      {t('tasks.lead')}: {task.leadName ?? '—'}
                    </Link>
                  </div>
                ) : null}
                {task.orderId ? (
                  <div>
                    <Link className="a-mono" href={adminHref(`/orders/${task.orderId}`)}>
                      {task.orderNumber}
                    </Link>
                  </div>
                ) : null}
              </td>
              <td>
                <Pill
                  tone={
                    task.status === 'done' ? 'good' : task.status === 'open' ? 'warn' : 'neutral'
                  }
                >
                  {t(`tasks.status_${task.status}`)}
                </Pill>
                <form className="a-inline-form" action={setTaskStatus.bind(null, task.id)}>
                  <input type="hidden" name="back" value={back} />
                  {task.status === 'open' ? (
                    <button
                      className="a-btn ghost small"
                      name="status"
                      value="done"
                      type="submit"
                      style={{ marginBlockStart: 6 }}
                    >
                      {t('tasks.mark_done')}
                    </button>
                  ) : (
                    <button
                      className="a-btn ghost small"
                      name="status"
                      value="open"
                      type="submit"
                      style={{ marginBlockStart: 6 }}
                    >
                      {t('tasks.reopen')}
                    </button>
                  )}
                </form>
              </td>
            </tr>
          )
        })}
      </tbody>
    </Table>
  )
}

export async function NewTaskForm({
  back,
  staff,
  defaultAssignee,
  customerId,
  leadId,
  orderId,
  linkFields = false,
}: {
  back: string
  staff: readonly { id: string; label: string }[]
  defaultAssignee: string
  customerId?: string
  leadId?: string
  orderId?: string
  /** Show "customer e-mail" and "order number" inputs (the Tasks page). */
  linkFields?: boolean
}) {
  const { t } = await getAdminI18n()
  const key = back.replace(/[^a-z0-9]/gi, '').slice(-12)
  return (
    <form className="a-form" action={createTask} style={{ marginBlockStart: 12 }}>
      <input type="hidden" name="back" value={back} />
      {customerId ? <input type="hidden" name="customerId" value={customerId} /> : null}
      {leadId ? <input type="hidden" name="leadId" value={leadId} /> : null}
      {orderId ? <input type="hidden" name="orderId" value={orderId} /> : null}
      <div className="a-row">
        <Field label={t('tasks.task')} htmlFor={`task-title-${key}`} required>
          <TextInput id={`task-title-${key}`} name="title" required maxLength={200} />
        </Field>
        <Field label={t('tasks.due')} htmlFor={`task-due-${key}`}>
          <TextInput id={`task-due-${key}`} name="dueDate" type="date" dir="ltr" />
        </Field>
        <Field label={t('tasks.assignee')} htmlFor={`task-assignee-${key}`}>
          <Select id={`task-assignee-${key}`} name="assigneeId" defaultValue={defaultAssignee}>
            {staff.map((person) => (
              <option key={person.id} value={person.id}>
                {person.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {linkFields ? (
        <div className="a-row">
          <Field label={t('tasks.customer_email')} htmlFor="task-customer-email">
            <TextInput id="task-customer-email" name="customerEmail" type="email" dir="ltr" />
          </Field>
          <Field label={t('tasks.order_number')} htmlFor="task-order-number">
            <TextInput id="task-order-number" name="orderNumber" dir="ltr" />
          </Field>
        </div>
      ) : null}
      <Field label={t('tasks.notes')} htmlFor={`task-notes-${key}`}>
        <TextInput id={`task-notes-${key}`} name="notes" maxLength={4000} />
      </Field>
      <div className="a-actions">
        <button className="a-btn" type="submit">
          {t('tasks.add')}
        </button>
      </div>
    </form>
  )
}

/** Open tasks per assignee id, for counters. */
export async function openTaskCount(assigneeId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(crmTasks)
    .where(and(eq(crmTasks.assigneeId, assigneeId), inArray(crmTasks.status, ['open'])))
  return row?.n ?? 0
}
