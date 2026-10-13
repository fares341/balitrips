import { and, asc, count, isNull, sql } from 'drizzle-orm'
import Link from 'next/link'

import { db } from '@/db'
import { entitlements, plans } from '@/db/schema'
import { pick } from '@/lib/content/localize'
import { formatMoney } from '@/lib/money'

import { adminHref } from '../../_lib/admin-path'
import { getAdminI18n } from '../../_lib/i18n'
import { requireCapability } from '../../_lib/session'
import { Flash } from '../../_ui/flash'
import { PageHead } from '../../_ui/shell'
import { Empty, PublishPill, Table } from '../../_ui/table'

export const dynamic = 'force-dynamic'

export default async function PlansPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireCapability('content.read')
  const { t, intl, locale } = await getAdminI18n()
  const params = await searchParams

  const rows = await db
    .select({
      plan: plans,
      active: sql<number>`(
        select count(*) from ${entitlements} e
        where e.plan_id = ${plans.id} and e.revoked_at is null
          and (e.expires_at is null or e.expires_at > now())
      )::int`,
    })
    .from(plans)
    .where(isNull(plans.deletedAt))
    .orderBy(asc(plans.sortOrder))

  const [legacy] = await db
    .select({ value: count() })
    .from(entitlements)
    .where(and(isNull(entitlements.planId), isNull(entitlements.revokedAt)))

  return (
    <>
      <PageHead
        title={t('plans.title')}
        description={t('plans.description')}
        actions={
          <Link className="a-btn" href={adminHref('/plans/new')}>
            {t('plans.new')}
          </Link>
        }
      />
      <Flash searchParams={params} />

      {rows.length === 0 ? (
        <Empty>{t('plans.empty')}</Empty>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>{t('plans.col_plan')}</th>
              <th>{t('common.price')}</th>
              <th>{t('plans.map_access')}</th>
              <th>{t('plans.col_duration')}</th>
              <th>{t('plans.col_devices')}</th>
              <th>{t('plans.col_active')}</th>
              <th>{t('common.status')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ plan, active }) => (
              <tr key={plan.id}>
                <td>
                  <Link href={adminHref(`/plans/${plan.id}`)}>
                    {pick(plan.name, locale, plan.slug)}
                  </Link>
                  <div className="a-mono a-muted">{plan.slug}</div>
                </td>
                <td>{formatMoney(plan.priceMinor, plan.currency, intl)}</td>
                <td className="a-mono">
                  {plan.entitlementKind === 'basic'
                    ? t('plans.kind_none_short')
                    : plan.entitlementKind}
                </td>
                <td>
                  {plan.durationDays === null
                    ? t('plans.lifetime')
                    : t('plans.days', { count: plan.durationDays })}
                </td>
                <td>{plan.deviceLimit}</td>
                <td>{active}</td>
                <td>
                  <PublishPill status={plan.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <p className="a-hint">{t('plans.legacy_hint', { count: legacy?.value ?? 0 })}</p>
    </>
  )
}
