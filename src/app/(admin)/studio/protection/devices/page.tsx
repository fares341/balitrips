import { and, count, desc, eq, ilike, or, type SQL } from 'drizzle-orm'
import Link from 'next/link'

import { db } from '@/db'
import { DEVICE_STATUSES, devices, users } from '@/db/schema'
import { can } from '@/lib/auth/roles'
import { REJECTED_REASON } from '@/lib/security/devices'

import { adminHref } from '../../../_lib/admin-path'
import { getAdminI18n } from '../../../_lib/i18n'
import { pageParam, param } from '../../../_lib/result'
import { requireCapability } from '../../../_lib/session'
import { Flash } from '../../../_ui/flash'
import { PageHead } from '../../../_ui/shell'
import { Empty, Pager, Pill, Table, When } from '../../../_ui/table'
import { decideDevice } from '../actions'
import { labelOr } from '../labels'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 50
const LIST = adminHref('/protection/devices')

/**
 * كل الأجهزة على المنصة (الوثيقة: "عرض جميع الأجهزة"، "التحكم في الأجهزة").
 * الأجهزة المعلّقة (سياسة "موافقة الإدارة") أولاً مع زر موافقة/رفض.
 */
export default async function DevicesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requireCapability('security.read')
  const { t } = await getAdminI18n()
  const mayWrite = can(session.role, 'security.write')
  const params = await searchParams
  const page = pageParam(params)
  const q = param(params, 'q')
  const rawStatus = param(params, 'status')
  const status = (DEVICE_STATUSES as readonly string[]).includes(rawStatus ?? '')
    ? (rawStatus as (typeof DEVICE_STATUSES)[number])
    : null

  const filters: SQL[] = []
  if (status !== null) filters.push(eq(devices.status, status))
  if (q) {
    const like = `%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`
    const match = or(ilike(users.email, like), ilike(devices.ip, like))
    if (match) filters.push(match)
  }
  const where = filters.length > 0 ? and(...filters) : undefined

  const [rows, [total], [pending]] = await Promise.all([
    db
      .select({
        id: devices.id,
        userId: devices.userId,
        email: users.email,
        browser: devices.browser,
        os: devices.os,
        deviceType: devices.deviceType,
        ip: devices.ip,
        status: devices.status,
        firstSeenAt: devices.firstSeenAt,
        lastSeenAt: devices.lastSeenAt,
        revokedReason: devices.revokedReason,
      })
      .from(devices)
      .innerJoin(users, eq(users.id, devices.userId))
      .where(where)
      // المعلّق أولاً، ثم الأحدث استخداماً.
      .orderBy(desc(eq(devices.status, 'pending')), desc(devices.lastSeenAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db
      .select({ value: count() })
      .from(devices)
      .innerJoin(users, eq(users.id, devices.userId))
      .where(where),
    db.select({ value: count() }).from(devices).where(eq(devices.status, 'pending')),
  ])

  return (
    <>
      <PageHead
        title={t('protection.devices_title')}
        description={t('protection.devices_description', { count: pending?.value ?? 0 })}
      />
      <Flash searchParams={params} />

      <form className="a-row a-card" method="get" action={LIST}>
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
          <label htmlFor="status">{t('protection.status')}</label>
          <select className="a-select" id="status" name="status" defaultValue={status ?? ''}>
            <option value="">{t('protection.all')}</option>
            {DEVICE_STATUSES.map((value) => (
              <option key={value} value={value}>
                {t(`protection.device_status_${value}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="a-actions">
          <button className="a-btn" type="submit">
            {t('protection.filter')}
          </button>
          <Link className="a-btn ghost" href={LIST}>
            {t('protection.reset')}
          </Link>
        </div>
      </form>

      {rows.length === 0 ? (
        <Empty>{t('protection.devices_empty')}</Empty>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>{t('protection.col_account')}</th>
              <th>{t('protection.col_device')}</th>
              <th>{t('protection.col_ip')}</th>
              <th>{t('protection.col_first_seen')}</th>
              <th>{t('protection.col_last_seen')}</th>
              <th>{t('protection.status')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <Link href={adminHref(`/customers/${row.userId}`)}>{row.email}</Link>
                </td>
                <td>
                  {row.browser ?? '—'} · {row.os ?? '—'}
                  {row.deviceType ? (
                    <div className="a-muted">
                      {labelOr(t, 'protection.device_type_', row.deviceType)}
                    </div>
                  ) : null}
                </td>
                <td className="a-mono">{row.ip ?? '—'}</td>
                <td>
                  <When value={row.firstSeenAt} />
                </td>
                <td>
                  <When value={row.lastSeenAt} />
                </td>
                <td>
                  <Pill
                    tone={
                      row.status === 'active'
                        ? 'good'
                        : row.status === 'pending'
                          ? 'warn'
                          : row.status === 'banned'
                            ? 'bad'
                            : 'neutral'
                    }
                  >
                    {labelOr(t, 'protection.device_status_', row.status)}
                  </Pill>
                  {row.revokedReason ? (
                    <div className="a-muted">
                      {labelOr(t, 'protection.revoked_', row.revokedReason)}
                    </div>
                  ) : null}
                </td>
                <td>
                  {mayWrite && row.status === 'pending' ? (
                    <div className="a-actions">
                      <form className="a-inline-form" action={decideDevice}>
                        <input type="hidden" name="deviceId" value={row.id} />
                        <input type="hidden" name="decision" value="approve" />
                        <button className="a-btn accent small" type="submit">
                          {t('protection.approve')}
                        </button>
                      </form>
                      <form className="a-inline-form" action={decideDevice}>
                        <input type="hidden" name="deviceId" value={row.id} />
                        <input type="hidden" name="decision" value="reject" />
                        <button className="a-btn danger small" type="submit">
                          {t('protection.reject')}
                        </button>
                      </form>
                    </div>
                  ) : mayWrite &&
                    row.status === 'revoked' &&
                    row.revokedReason === REJECTED_REASON ? (
                    <form className="a-inline-form" action={decideDevice}>
                      <input type="hidden" name="deviceId" value={row.id} />
                      <input type="hidden" name="decision" value="approve" />
                      <button className="a-btn small" type="submit">
                        {t('protection.approve_after_all')}
                      </button>
                    </form>
                  ) : null}
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
        total={total?.value ?? 0}
      />
    </>
  )
}
