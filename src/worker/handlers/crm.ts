/**
 * `crm.sweep` — every 15 minutes (phase 4).
 *
 *  1. Follow-up tasks due today or earlier (Bali date) that are still open
 *     and were not reminded yet: the person they are assigned to gets a
 *     reminder (site notification + e-mail). Once per task — `reminded_at`.
 *  2. Support tickets of high or urgent priority still waiting for a first
 *     answer after SUPPORT_ESCALATE_HOURS (default 4): the team is told
 *     (Studio inbox + e-mail/WhatsApp to the admins). Once per ticket —
 *     `escalated_at`.
 *
 * Both claim their rows with a conditional UPDATE … RETURNING, so two workers
 * running the same tick cannot send the same reminder twice.
 */

import { and, eq, isNotNull, isNull, lte, sql } from 'drizzle-orm'

import { db } from '@/db'
import { crmTasks, supportTickets } from '@/db/schema'
import { notifyStaff, notifyUser } from '@/lib/notify'

import { intFromEnv } from '../config'
import type { CrmSweepJob } from '../queues'

function baliToday(now: Date): string {
  return new Date(now.getTime() + 8 * 3_600_000).toISOString().slice(0, 10)
}

export async function handleCrmSweep(
  job: CrmSweepJob,
  now: Date = new Date(),
): Promise<{ reminded: number; escalated: number }> {
  const hours = job.escalateAfterHours ?? intFromEnv('SUPPORT_ESCALATE_HOURS', 4, 1, 168)

  const due = await db
    .update(crmTasks)
    .set({ remindedAt: now })
    .where(
      and(
        eq(crmTasks.status, 'open'),
        isNull(crmTasks.remindedAt),
        isNotNull(crmTasks.assigneeId),
        lte(crmTasks.dueDate, baliToday(now)),
      ),
    )
    .returning({
      id: crmTasks.id,
      title: crmTasks.title,
      dueDate: crmTasks.dueDate,
      assigneeId: crmTasks.assigneeId,
    })
  for (const task of due) {
    if (task.assigneeId === null) continue
    await notifyUser(task.assigneeId, 'task_due', {
      title: task.title.slice(0, 120),
      date: task.dueDate ?? '',
    })
  }

  const cutoff = new Date(now.getTime() - hours * 3_600_000)
  const late = await db
    .update(supportTickets)
    .set({ escalatedAt: now })
    .where(
      and(
        eq(supportTickets.status, 'open'),
        sql`${supportTickets.priority} in ('high', 'urgent')`,
        isNull(supportTickets.firstResponseAt),
        isNull(supportTickets.escalatedAt),
        lte(supportTickets.createdAt, cutoff),
      ),
    )
    .returning({ id: supportTickets.id, number: supportTickets.number })
  for (const ticket of late) {
    await notifyStaff(
      'staff_ticket_escalated',
      { number: ticket.number, hours },
      `/support/${ticket.id}`,
    )
  }

  if (due.length > 0 || late.length > 0) {
    console.info('[crm] sweep', { reminded: due.length, escalated: late.length })
  }
  return { reminded: due.length, escalated: late.length }
}
