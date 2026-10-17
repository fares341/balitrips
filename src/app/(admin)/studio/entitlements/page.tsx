import { and, count, desc, eq, gt, ilike, isNotNull, isNull, or, type SQL } from 'drizzle-orm'
import Link from 'next/link'

import { db } from '@/db'
import { entitlements, orders, users } from '@/db/schema'
import { can } from '@/lib/auth/roles'

import { adminHref } from '../../_lib/admin-path'
import { getAdminI18n } from '../../_lib/i18n'
import { pageParam, param } from '../../_lib/result'
import { requireCapability } from '../../_lib/session'
import { Flash } from '../../_ui/flash'
import { PageHead } from '../../_ui/shell'
import { Empty, Pager, Pill, Table, When } from '../../_ui/table'
import { accessKindLabel } from '../orders/labels'
import { grantEntitlement, revokeEntitlement } from './actions'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 30
const LIST = adminHref('/entitlements')

export default async function EntitlementsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requireCapability('customers.read')
  const { t } = await getAdminI18n()
  const params = await searchParams

  const q = param(params, 'q')
  const state = param(params, 'state')
  const kind = param(params, 'kind')
  const page = pageParam(params)

  // Captured once so the filter and the per-row "expired" badge agree, and
  // so the render itself does not read the clock.
  const now = new Date()

  const filters: SQL[] = []
  if (q) filters.push(ilike(users.email, `%${q}%`))
  if (kind === 'basic' || kind === 'map_access' || kind === 'vip') {
    filters.push(eq(entitlements.kind, kind))
  }
  if (state === 'active') {
    const live = and(
      isNull(entitlements.revokedAt),
      or(isNull(entitlements.expiresAt), gt(entitlements.expiresAt, now)),
    )
    if (live) filters.push(live)
  }
  if (state === 'revoked') filters.push(isNotNull(entitlements.revokedAt))

  const where = filters.length > 0 ? and(...filters) : undefined

  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        id: entitlements.id,
        kind: entitlements.kind,
        startsAt: entitlements.startsAt,
        expiresAt: entitlements.expiresAt,
        revokedAt: entitlements.revokedAt,
        revokedReason: entitlements.revokedReason,
        email: users.email,
        userId: users.id,
        orderId: entitlements.grantedByOrderId,
        orderNumber: orders.orderNumber,
        actorId: entitlements.grantedByActorId,
      })
      .from(entitlements)
      .innerJoin(users, eq(users.id, entitlements.userId))
      .leftJoin(orders, eq(orders.id, entitlements.grantedByOrderId))
      .where(where)
      .orderBy(desc(entitlements.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db
      .select({ value: count() })
      .from(entitlements)
      .innerJoin(users, eq(users.id, entitlements.userId))
      .where(where),
  ])

  const mayGrant = can(session.role, 'entitlements.grant')

  return (
    <>
      <PageHead title={t('entitlements.title')} description={t('entitlements.description')} />
      <Flash searchParams={params} />

      {mayGrant ? (
        <form className="a-card a-row" action={grantEntitlement}>
          <div className="a-field">
            <label htmlFor="email">{t('entitlements.customer_email')}</label>
            <input className="a-input" id="email" name="email" type="email" required />
          </div>
          <div className="a-field">
            <label htmlFor="kind">{t('entitlements.kind')}</label>
            <select className="a-select" id="kind" name="kind" defaultValue="map_access">
              <option value="map_access">{t('entitlements.kind_map_access')}</option>
              <option value="vip">{t('entitlements.kind_vip')}</option>
            </select>
          </div>
          <div className="a-field">
            <label htmlFor="expiresAt">{t('entitlements.expires')}</label>
            <input className="a-input" id="expiresAt" name="expiresAt" type="date" />
            <span className="a-hint">{t('entitlements.expires_hint')}</span>
          </div>
          <div className="a-field">
            <label htmlFor="reason">{t('entitlements.reason')}</label>
            <input
              className="a-input"
              id="reason"
              name="reason"
              placeholder={t('entitlements.reason_placeholder')}
            />
          </div>
          <div className="a-actions">
            <button className="a-btn accent" type="submit">
              {t('entitlements.grant')}
            </button>
          </div>
        </form>
      ) : null}

      <form className="a-row a-card" method="get" action={LIST}>
        <div className="a-field">
          <label htmlFor="q">{t('common.email')}</label>
          <input className="a-input" id="q" name="q" defaultValue={q ?? ''} />
        </div>
        <div className="a-field">
          <label htmlFor="kind-filter">{t('entitlements.kind')}</label>
          <select className="a-select" id="kind-filter" name="kind" defaultValue={kind ?? ''}>
            <option value="">{t('entitlements.any')}</option>
            <option value="basic">{t('entitlements.kind_basic')}</option>
            <option value="map_access">{t('entitlements.kind_map_access')}</option>
            <option value="vip">{t('entitlements.kind_vip')}</option>
          </select>
        </div>
        <div className="a-field">
          <label htmlFor="state">{t('entitlements.state')}</label>
          <select className="a-select" id="state" name="state" defaultValue={state ?? ''}>
            <option value="">{t('entitlements.any')}</option>
            <option value="active">{t('entitlements.state_active')}</option>
            <option value="revoked">{t('entitlements.state_revoked')}</option>
          </select>
        </div>
        <div className="a-actions">
          <button className="a-btn" type="submit">
            {t('common.filter')}
          </button>
          <Link className="a-btn ghost" href={LIST}>
            {t('entitlements.reset')}
          </Link>
        </div>
      </form>

      {rows.length === 0 ? (
        <Empty>{t('entitlements.empty')}</Empty>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>{t('entitlements.col_customer')}</th>
              <th>{t('entitlements.kind')}</th>
              <th>{t('entitlements.col_source')}</th>
              <th>{t('entitlements.col_starts')}</th>
              <th>{t('entitlements.expires')}</th>
              <th>{t('entitlements.state')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const expired = row.expiresAt !== null && row.expiresAt <= now
              return (
                <tr key={row.id}>
                  <td>{row.email}</td>
                  <td>{accessKindLabel(t, row.kind)}</td>
                  <td>
                    {row.orderId ? (
                      <Link href={adminHref(`/orders/${row.orderId}`)} className="a-mono">
                        {row.orderNumber ?? t('entitlements.order_fallback')}
                      </Link>
                    ) : row.actorId ? (
                      <Pill tone="info">{t('entitlements.by_staff')}</Pill>
                    ) : (
                      <span className="a-muted">—</span>
                    )}
                  </td>
                  <td>
                    <When value={row.startsAt} />
                  </td>
                  <td>
                    {row.expiresAt ? (
                      <When value={row.expiresAt} />
                    ) : (
                      <Pill tone="good">{t('entitlements.lifetime')}</Pill>
                    )}
                  </td>
                  <td>
                    {row.revokedAt ? (
                      <>
                        <Pill tone="bad">{t('entitlements.state_revoked')}</Pill>
                        <div className="a-muted">{row.revokedReason ?? ''}</div>
                      </>
                    ) : expired ? (
                      <Pill tone="warn">{t('entitlements.expired')}</Pill>
                    ) : (
                      <Pill tone="good">{t('entitlements.state_active')}</Pill>
                    )}
                  </td>
                  <td>
                    {mayGrant && !row.revokedAt ? (
                      <form className="a-inline-form" action={revokeEntitlement}>
                        <input type="hidden" name="entitlementId" value={row.id} />
                        <button className="a-btn danger small" type="submit">
                          {t('entitlements.revoke')}
                        </button>
                      </form>
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
        total={totalRow?.value ?? 0}
      />
    </>
  )
}
