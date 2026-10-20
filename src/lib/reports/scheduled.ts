import { and, eq, inArray, isNull } from 'drizzle-orm'

import { db } from '@/db'
import { reportSchedules, users } from '@/db/schema'
import { adminHref } from '@/app/(admin)/_lib/admin-path'
import { translator } from '@/app/(admin)/_i18n'
import { can, isRole } from '@/lib/auth/roles'
import { renderDocument, sendEmail, type Block } from '@/lib/email'

import { buildReport, isReportId, mayOpen } from './catalog'
import { changeText, kpiChange, kpiText } from './format'
import { parseReportFilters } from './filters'
import { scheduleDue, schedulePeriod } from './schedule-time'
import { rangeLabel } from './builders/helpers'

/**
 * Scheduled report emails (Studio → Reports → Scheduled emails).
 *
 * Daily: yesterday's numbers, sent after 07:00 Bali time. Weekly: the last
 * seven full days, on Mondays after 07:00. Each recipient must still be staff
 * when it is sent and gets only what their role may see (a staff member
 * never receives costs or margins). The email carries the headline numbers
 * with their comparison and a button to the full report in the Studio.
 */

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/+$/, '')

export async function sendDueReports(now = new Date()): Promise<number> {
  const schedules = await db.select().from(reportSchedules).where(eq(reportSchedules.enabled, true))
  let sent = 0
  for (const schedule of schedules) {
    if (!isReportId(schedule.report) && schedule.report !== 'overview') continue
    if (!scheduleDue(schedule.frequency, schedule.lastSentAt, now)) continue
    const recipients =
      schedule.recipients.length === 0
        ? []
        : await db
            .select({ id: users.id, email: users.email, name: users.name, role: users.role })
            .from(users)
            .where(and(inArray(users.id, schedule.recipients), isNull(users.deletedAt)))
    const filters = parseReportFilters(schedulePeriod(schedule.frequency, now), now)
    const t = translator('ar')
    const intl = 'ar-u-nu-latn'

    for (const recipient of recipients) {
      const role = isRole(recipient.role) ? recipient.role : 'customer'
      if (!can(role, 'admin.access') || !can(role, 'orders.read')) continue
      const access = {
        finance: can(role, 'suppliers.write'),
        customers: can(role, 'customers.read'),
        orders: true,
      }
      const ctx = { t, intl, finance: access.finance, customers: access.customers, now }
      let result
      if (schedule.report === 'overview') {
        const { buildOverview } = await import('./builders/overview')
        result = await buildOverview(filters, ctx)
      } else if (isReportId(schedule.report) && mayOpen(schedule.report, access)) {
        result = await buildReport(schedule.report, filters, ctx)
      } else {
        continue
      }
      const p = filters.period
      const period = rangeLabel(p.fromDate, p.toDate, intl)
      const path =
        schedule.report === 'overview'
          ? `/?period=${p.preset === 'custom' ? `custom&from=${p.fromDate}&to=${p.toDate}` : p.preset}`
          : `/reports/${schedule.report}?period=${p.preset === 'custom' ? `custom&from=${p.fromDate}&to=${p.toDate}` : p.preset}`
      const blocks: Block[] = [
        { kind: 'heading', text: result.title },
        { kind: 'muted', text: `${t('rp.period')}: ${period}` },
        {
          kind: 'facts',
          rows: result.kpis
            .filter((kpi) => kpi.value.kind !== 'unavailable')
            .slice(0, 14)
            .map((kpi) => {
              const change = changeText(kpi, kpiChange(kpi), intl, {
                newLabel: t('rp.change_new'),
                points: t('rp.change_points'),
              })
              return {
                label: kpi.label,
                value: `${kpiText(kpi, intl, t('rp.hours_short')).join(' · ')}${change ? ` (${change})` : ''}`,
              }
            }),
        },
        { kind: 'button', label: t('rp.open_report'), href: `${SITE_URL}${adminHref(path)}` },
        { kind: 'muted', text: t('rp.email_why') },
      ]
      const { html, text } = renderDocument({
        locale: 'ar',
        preheader: `${result.title} — ${period}`,
        blocks,
        footer: [t('rp.email_footer')],
      })
      const delivery = await sendEmail({
        to: recipient.email,
        subject: `${result.title} — ${period}`,
        html,
        text,
      })
      if (delivery.delivered) sent += 1
      else
        console.error('[reports] scheduled email not delivered', {
          schedule: schedule.id,
          error: delivery.error,
        })
    }
    await db
      .update(reportSchedules)
      .set({ lastSentAt: now })
      .where(eq(reportSchedules.id, schedule.id))
  }
  return sent
}
