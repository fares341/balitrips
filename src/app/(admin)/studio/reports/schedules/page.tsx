import Link from 'next/link'

import { db } from '@/db'
import { reportSchedules } from '@/db/schema'
import { REPORT_IDS, isReportId } from '@/lib/reports/catalog'
import { staffMembers } from '@/lib/reports/data'

import { adminHref } from '../../../_lib/admin-path'
import { getAdminI18n } from '../../../_lib/i18n'
import { requireCapability } from '../../../_lib/session'
import { Field } from '../../../_ui/field'
import { Flash } from '../../../_ui/flash'
import { PageHead } from '../../../_ui/shell'
import { Empty, Pill, Table, When } from '../../../_ui/table'
import { createSchedule, deleteSchedule, toggleSchedule } from './actions'

export const dynamic = 'force-dynamic'

/**
 * Scheduled report emails: a report, daily or weekly, to chosen staff.
 * Each person receives only what their own role may see.
 */
export default async function SchedulesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireCapability('config.write')
  const query = await searchParams
  const { t } = await getAdminI18n()
  const [rows, staff] = await Promise.all([
    db.select().from(reportSchedules).orderBy(reportSchedules.createdAt),
    staffMembers(),
  ])
  const nameOf = new Map(staff.map((s) => [s.id, s.name ?? s.email]))
  const reportLabel = (id: string) =>
    id === 'overview' ? t('rp.overview_title') : isReportId(id) ? t(`rp.r_${id}`) : id

  return (
    <>
      <PageHead
        title={t('rp.schedules_title')}
        description={t('rp.schedules_description')}
        actions={
          <Link className="a-btn ghost" href={adminHref('/reports')}>
            {t('rp.back_to_reports')}
          </Link>
        }
      />
      <Flash searchParams={query} />
      <section className="a-card">
        {rows.length === 0 ? (
          <Empty>{t('rp.schedules_empty')}</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>{t('rp.col_report')}</th>
                <th>{t('rp.frequency')}</th>
                <th>{t('rp.recipients')}</th>
                <th>{t('common.status')}</th>
                <th>{t('rp.last_sent')}</th>
                <th>{t('rp.col_actions')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{reportLabel(row.report)}</td>
                  <td>{t(`rp.freq_${row.frequency}`)}</td>
                  <td>{row.recipients.map((id) => nameOf.get(id) ?? '—').join('، ')}</td>
                  <td>
                    <Pill tone={row.enabled ? 'good' : 'neutral'}>
                      {row.enabled ? t('rp.on') : t('rp.off')}
                    </Pill>
                  </td>
                  <td>{row.lastSentAt ? <When value={row.lastSentAt} /> : '—'}</td>
                  <td>
                    <div className="a-row">
                      <form action={toggleSchedule}>
                        <input type="hidden" name="id" value={row.id} />
                        <input type="hidden" name="enabled" value={row.enabled ? '0' : '1'} />
                        <button className="a-btn ghost small" type="submit">
                          {row.enabled ? t('rp.pause') : t('rp.resume')}
                        </button>
                      </form>
                      <form action={deleteSchedule}>
                        <input type="hidden" name="id" value={row.id} />
                        <button className="a-btn ghost small" type="submit">
                          {t('rp.delete')}
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>

      <form className="a-form" action={createSchedule}>
        <div className="a-card">
          <h2>{t('rp.schedule_new')}</h2>
          <div className="a-row">
            <Field label={t('rp.col_report')} htmlFor="report">
              <select id="report" name="report" className="a-select" defaultValue="overview">
                <option value="overview">{t('rp.overview_title')}</option>
                {REPORT_IDS.map((id) => (
                  <option key={id} value={id}>
                    {t(`rp.r_${id}`)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('rp.frequency')} htmlFor="frequency" hint={t('rp.frequency_hint')}>
              <select id="frequency" name="frequency" className="a-select" defaultValue="weekly">
                <option value="daily">{t('rp.freq_daily')}</option>
                <option value="weekly">{t('rp.freq_weekly')}</option>
              </select>
            </Field>
          </div>
          <fieldset className="a-fieldset">
            <legend>{t('rp.recipients')}</legend>
            {staff.map((member) => (
              <label key={member.id} className="a-check">
                <input type="checkbox" name="recipients" value={member.id} />
                {member.name ? `${member.name} — ` : ''}
                <span dir="ltr">{member.email}</span>
              </label>
            ))}
            <span className="a-hint">{t('rp.recipients_hint')}</span>
          </fieldset>
        </div>
        <div className="a-actions">
          <button className="a-btn" type="submit">
            {t('rp.schedule_save')}
          </button>
        </div>
      </form>
    </>
  )
}
