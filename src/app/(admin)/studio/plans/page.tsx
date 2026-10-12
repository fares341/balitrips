import { and, asc, count, isNull, sql } from 'drizzle-orm'
import Link from 'next/link'

import { db } from '@/db'
import { entitlements, plans } from '@/db/schema'
import { pick } from '@/lib/content/localize'
import { formatMoney } from '@/lib/money'

import { adminHref } from '../../_lib/admin-path'
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
        title="Plans"
        description="What /plans sells. Buying a plan grants an entitlement with this plan's access, duration and device limit, copied at purchase time."
        actions={
          <Link className="a-btn" href={adminHref('/plans/new')}>
            New plan
          </Link>
        }
      />
      <Flash searchParams={params} />

      {rows.length === 0 ? (
        <Empty>No plans yet.</Empty>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>Plan</th>
              <th>Price</th>
              <th>Unlocks</th>
              <th>Duration</th>
              <th>Devices</th>
              <th>Active customers</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ plan, active }) => (
              <tr key={plan.id}>
                <td>
                  <Link href={adminHref(`/plans/${plan.id}`)}>
                    {pick(plan.name, 'en', plan.slug)}
                  </Link>
                  <div className="a-mono a-muted">{plan.slug}</div>
                </td>
                <td>{formatMoney(plan.priceMinor, plan.currency, 'en')}</td>
                <td className="a-mono">{plan.entitlementKind}</td>
                <td>{plan.durationDays === null ? 'Lifetime' : `${plan.durationDays} days`}</td>
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
      <p className="a-hint">
        {legacy?.value ?? 0} live entitlement(s) were granted without a plan (manual grants or
        before plans existed). They use the default device limit and allow My Trip.
      </p>
    </>
  )
}
