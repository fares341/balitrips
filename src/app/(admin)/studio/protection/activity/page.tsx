import { count, desc, eq } from 'drizzle-orm'
import Link from 'next/link'

import { db } from '@/db'
import { can } from '@/lib/auth/roles'
import { activityLog, devices, users } from '@/db/schema'
import { ACTIVITY_ACTIONS } from '@/lib/security/activity'

import { adminHref } from '../../../_lib/admin-path'
import { auditLines } from '../../../_lib/audit-labels'
import { getAdminI18n } from '../../../_lib/i18n'
import { pageParam } from '../../../_lib/result'
import { requireCapability } from '../../../_lib/session'
import { Changes } from '../../../_ui/changes'
import { PageHead } from '../../../_ui/shell'
import { Empty, Pager, Pill, Table, When, type PillTone } from '../../../_ui/table'
import { labelOr } from '../labels'
import { activityFilters } from './filters'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 50
const LIST = adminHref('/protection/activity')

const TONE: Partial<Record<string, PillTone>> = {
  login_failed: 'warn',
  login_blocked: 'bad',
  device_limit_blocked: 'warn',
  unauthorized_access: 'bad',
  banned: 'bad',
  new_device: 'info',
  device_evicted: 'warn',
  download_pdf: 'good',
}

/** سجل نشاط المستخدمين، مع فلترة حسب الإجراء والمستخدم والـ IP والتاريخ. */
export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requireCapability('security.read')
  const { t, locale, intl } = await getAdminI18n()
  const params = await searchParams

  const { q, action, user, from, to, where } = activityFilters(params)
  const page = pageParam(params)
  const mayExport = can(session.role, 'customers.export')
  const exportQuery = new URLSearchParams(
    Object.entries({ q, action, user, from, to }).flatMap(([key, value]) =>
      value ? [[key, value]] : [],
    ),
  ).toString()

  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        id: activityLog.id,
        action: activityLog.action,
        ip: activityLog.ip,
        details: activityLog.details,
        createdAt: activityLog.createdAt,
        userId: activityLog.userId,
        email: users.email,
        browser: devices.browser,
        os: devices.os,
      })
      .from(activityLog)
      .leftJoin(users, eq(users.id, activityLog.userId))
      .leftJoin(devices, eq(devices.id, activityLog.deviceId))
      .where(where)
      .orderBy(desc(activityLog.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db
      .select({ value: count() })
      .from(activityLog)
      .leftJoin(users, eq(users.id, activityLog.userId))
      .where(where),
  ])

  return (
    <>
      <PageHead
        title={t('protection.activity_title')}
        description={t('protection.activity_description')}
      />

      <form className="a-row a-card" method="get" action={LIST}>
        {user ? <input type="hidden" name="user" value={user} /> : null}
        <div className="a-field">
          <label htmlFor="q">{t('protection.search')}</label>
          <input
            className="a-input"
            id="q"
            name="q"
            defaultValue={q ?? ''}
            placeholder={t('protection.search_placeholder')}
          />
        </div>
        <div className="a-field">
          <label htmlFor="action">{t('protection.col_action')}</label>
          <select className="a-select" id="action" name="action" defaultValue={action ?? ''}>
            <option value="">{t('protection.any')}</option>
            {ACTIVITY_ACTIONS.map((value) => (
              <option key={value} value={value}>
                {labelOr(t, 'protection.action_', value)}
              </option>
            ))}
          </select>
        </div>
        <div className="a-field">
          <label htmlFor="from">{t('protection.from')}</label>
          <input className="a-input" id="from" name="from" type="date" defaultValue={from ?? ''} />
        </div>
        <div className="a-field">
          <label htmlFor="to">{t('protection.to')}</label>
          <input className="a-input" id="to" name="to" type="date" defaultValue={to ?? ''} />
        </div>
        <div className="a-actions">
          <button className="a-btn" type="submit">
            {t('protection.filter')}
          </button>
          <Link className="a-btn ghost" href={LIST}>
            {t('protection.reset')}
          </Link>
          {mayExport ? (
            // Route handler: a plain <a> so the browser downloads the file.
            <a
              className="a-btn ghost"
              href={`${adminHref('/protection/activity/export')}?${exportQuery}`}
            >
              {t('protection.export_csv')}
            </a>
          ) : null}
        </div>
      </form>

      {rows.length === 0 ? (
        <Empty>{t('protection.activity_empty')}</Empty>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>{t('protection.col_when')}</th>
              <th>{t('protection.col_user')}</th>
              <th>{t('protection.col_action')}</th>
              <th>{t('protection.col_device')}</th>
              <th>{t('protection.col_details')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <When value={row.createdAt} />
                  <div className="a-mono a-muted">{row.ip ?? ''}</div>
                </td>
                <td>
                  {row.userId ? (
                    <Link href={adminHref(`/customers/${row.userId}`)}>
                      {row.email ?? row.userId}
                    </Link>
                  ) : (
                    <span className="a-muted">{t('protection.anonymous')}</span>
                  )}
                </td>
                <td>
                  <Pill tone={TONE[row.action] ?? 'neutral'}>
                    {labelOr(t, 'protection.action_', row.action)}
                  </Pill>
                </td>
                <td>{row.browser ? `${row.browser} · ${row.os ?? ''}` : '—'}</td>
                <td>
                  <Changes lines={auditLines(t, row.details, locale, intl)} />
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      <Pager
        basePath={LIST}
        searchParams={params}
        page={page}
        pageSize={PAGE_SIZE}
        total={totalRow?.value ?? 0}
      />
    </>
  )
}
