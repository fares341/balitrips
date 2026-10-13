import { and, count, desc, eq, type SQL } from 'drizzle-orm'
import Link from 'next/link'

import { db } from '@/db'
import { ALERT_STATUSES, securityAlerts, users, type AlertStatus } from '@/db/schema'
import { can } from '@/lib/auth/roles'

import { adminHref } from '../../../_lib/admin-path'
import { getAdminI18n } from '../../../_lib/i18n'
import { pageParam, param } from '../../../_lib/result'
import { requireCapability } from '../../../_lib/session'
import { Flash } from '../../../_ui/flash'
import { PageHead } from '../../../_ui/shell'
import { Empty, Pager, Pill, Table, When, type PillTone } from '../../../_ui/table'
import { reviewAlert } from '../actions'
import { labelOr } from '../labels'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 50
const LIST = adminHref('/protection/alerts')
const TONE: Record<string, PillTone> = { high: 'bad', medium: 'warn', low: 'info' }

/** قائمة مراجعة التنبيهات التي تفتحها قواعد الكشف التلقائي. */
export default async function AlertsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requireCapability('security.read')
  const { t } = await getAdminI18n()
  const mayWrite = can(session.role, 'security.write')
  const params = await searchParams
  const page = pageParam(params)
  const rawStatus = param(params, 'status')
  const status: AlertStatus = (ALERT_STATUSES as readonly string[]).includes(rawStatus ?? '')
    ? (rawStatus as AlertStatus)
    : 'open'

  const where: SQL | undefined = and(eq(securityAlerts.status, status))

  const [rows, [total]] = await Promise.all([
    db
      .select({ alert: securityAlerts, email: users.email })
      .from(securityAlerts)
      .leftJoin(users, eq(users.id, securityAlerts.userId))
      .where(where)
      .orderBy(desc(securityAlerts.updatedAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ value: count() }).from(securityAlerts).where(where),
  ])

  return (
    <>
      <PageHead
        title={t('protection.alerts_title')}
        description={t('protection.alerts_description')}
      />
      <Flash searchParams={params} />

      <div className="a-row" style={{ marginBlockEnd: 12 }}>
        {ALERT_STATUSES.map((value) => (
          <Link
            key={value}
            className={`a-btn ${value === status ? '' : 'ghost'}`}
            href={`${LIST}?status=${value}`}
          >
            {t(`protection.alert_status_${value}`)}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <Empty>
          {t('protection.alerts_empty', { status: t(`protection.alert_status_${status}`) })}
        </Empty>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>{t('protection.col_last_seen')}</th>
              <th>{t('protection.col_rule')}</th>
              <th>{t('protection.col_subject')}</th>
              <th>{t('protection.col_observed')}</th>
              <th>{t('protection.col_auto_action')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map(({ alert, email }) => {
              const details = (alert.details ?? {}) as Record<string, unknown>
              return (
                <tr key={alert.id}>
                  <td>
                    <When value={alert.updatedAt} />
                    <div className="a-muted">×{alert.hits}</div>
                  </td>
                  <td>
                    <Pill tone={TONE[alert.severity] ?? 'neutral'}>
                      {labelOr(t, 'protection.severity_', alert.severity)}
                    </Pill>{' '}
                    <span className="a-mono">{alert.rule}</span>
                    <div className="a-hint">
                      {labelOr(t, 'protection.rule_', alert.rule, String(details.label ?? ''))}
                    </div>
                  </td>
                  <td>
                    {alert.userId ? (
                      <Link href={adminHref(`/customers/${alert.userId}`)}>
                        {email ?? alert.userId}
                      </Link>
                    ) : null}
                    {alert.ip ? <div className="a-mono a-muted">{alert.ip}</div> : null}
                    <div>
                      <Link
                        className="a-hint"
                        href={
                          alert.userId
                            ? adminHref(`/protection/activity?user=${alert.userId}`)
                            : adminHref(
                                `/protection/activity?q=${encodeURIComponent(alert.ip ?? '')}`,
                              )
                        }
                      >
                        {t('protection.activity_link')}
                      </Link>
                    </div>
                  </td>
                  <td>
                    {t('protection.observed', {
                      observed: String(details.observed ?? '?'),
                      threshold: String(details.threshold ?? '?'),
                      minutes: String(details.windowMinutes ?? '?'),
                    })}
                  </td>
                  <td>
                    {alert.autoAction ? (
                      <Pill tone="warn">{labelOr(t, 'protection.auto_', alert.autoAction)}</Pill>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    {mayWrite && alert.status === 'open' ? (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <form className="a-inline-form" action={reviewAlert}>
                          <input type="hidden" name="alertId" value={alert.id} />
                          <input type="hidden" name="status" value="actioned" />
                          <button className="a-btn small" type="submit">
                            {t('protection.handled')}
                          </button>
                        </form>
                        <form className="a-inline-form" action={reviewAlert}>
                          <input type="hidden" name="alertId" value={alert.id} />
                          <input type="hidden" name="status" value="dismissed" />
                          <button className="a-btn ghost small" type="submit">
                            {t('protection.dismiss')}
                          </button>
                        </form>
                      </div>
                    ) : null}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </Table>
      )}

      <Pager
        basePath={LIST}
        searchParams={params}
        page={page}
        pageSize={PAGE_SIZE}
        total={total?.value ?? 0}
      />
    </>
  )
}
