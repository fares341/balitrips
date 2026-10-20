'use server'

import { and, eq, inArray, isNull } from 'drizzle-orm'
import { redirect } from 'next/navigation'

import { db } from '@/db'
import { reportSchedules, users } from '@/db/schema'
import { isReportId } from '@/lib/reports/catalog'

import { adminHref } from '../../../_lib/admin-path'
import { writeAudit } from '../../../_lib/audit'
import { fmulti, fstr, fuuid } from '../../../_lib/form'
import { getAdminI18n } from '../../../_lib/i18n'
import { encodeMessage, errorMessage, isRedirectError, withOutcome } from '../../../_lib/result'
import { requireCapability } from '../../../_lib/session'

const BACK = adminHref('/reports/schedules')

export async function createSchedule(form: FormData): Promise<void> {
  const session = await requireCapability('config.write')
  const { t } = await getAdminI18n()
  let outcome: { ok: string } | { err: string }
  try {
    const report = fstr(form, 'report') ?? ''
    if (report !== 'overview' && !isReportId(report)) throw new Error(t('rp.err_report'))
    const frequency = fstr(form, 'frequency') === 'weekly' ? 'weekly' : 'daily'
    const wanted = fmulti(form, 'recipients').filter((id) => /^[0-9a-f-]{36}$/i.test(id))
    if (wanted.length === 0) throw new Error(t('rp.err_recipients'))
    const staff = await db
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          inArray(users.id, wanted),
          inArray(users.role, ['staff', 'admin']),
          isNull(users.deletedAt),
        ),
      )
    if (staff.length === 0) throw new Error(t('rp.err_recipients'))
    const [row] = await db
      .insert(reportSchedules)
      .values({
        report,
        frequency,
        recipients: staff.map((s) => s.id),
        createdBy: session.userId,
      })
      .returning({ id: reportSchedules.id })
    await writeAudit({
      actor: session,
      action: 'report.schedule_create',
      entityType: 'report_schedule',
      entityId: row?.id ?? null,
      before: null,
      after: { report, frequency, recipients: staff.length },
    })
    outcome = { ok: encodeMessage('rp.ok_schedule_saved') }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  redirect(withOutcome(BACK, outcome))
}

export async function toggleSchedule(form: FormData): Promise<void> {
  const session = await requireCapability('config.write')
  let outcome: { ok: string } | { err: string }
  try {
    const id = fuuid(form, 'id')
    const enabled = fstr(form, 'enabled') === '1'
    await db.update(reportSchedules).set({ enabled }).where(eq(reportSchedules.id, id))
    await writeAudit({
      actor: session,
      action: 'report.schedule_toggle',
      entityType: 'report_schedule',
      entityId: id,
      before: null,
      after: { enabled },
    })
    outcome = { ok: encodeMessage('rp.ok_schedule_saved') }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  redirect(withOutcome(BACK, outcome))
}

export async function deleteSchedule(form: FormData): Promise<void> {
  const session = await requireCapability('config.write')
  let outcome: { ok: string } | { err: string }
  try {
    const id = fuuid(form, 'id')
    await db.delete(reportSchedules).where(eq(reportSchedules.id, id))
    await writeAudit({
      actor: session,
      action: 'report.schedule_delete',
      entityType: 'report_schedule',
      entityId: id,
      before: null,
      after: null,
    })
    outcome = { ok: encodeMessage('rp.ok_schedule_deleted') }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  redirect(withOutcome(BACK, outcome))
}
