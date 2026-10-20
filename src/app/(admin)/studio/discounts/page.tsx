import { desc, sql } from 'drizzle-orm'
import Link from 'next/link'

import { db } from '@/db'
import { couponRedemptions, coupons } from '@/db/schema'
import { formatMoney } from '@/lib/money'

import { adminHref } from '../../_lib/admin-path'
import { getAdminI18n } from '../../_lib/i18n'
import { requireCapability } from '../../_lib/session'
import { Flash } from '../../_ui/flash'
import { PageHead } from '../../_ui/shell'
import { Empty, Pill, Table, When } from '../../_ui/table'
import { couponStateOf, couponValueLabel } from './labels'

export const dynamic = 'force-dynamic'

/** الخصومات والقسائم — discount codes and how much each one has been used. */
export default async function DiscountsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireCapability('discounts.write')
  const { t, intl } = await getAdminI18n()
  const params = await searchParams

  const [rows, usage] = await Promise.all([
    db.select().from(coupons).orderBy(desc(coupons.createdAt)).limit(500),
    db
      .select({
        couponId: couponRedemptions.couponId,
        currency: couponRedemptions.currency,
        uses: sql<number>`count(*)::int`,
        discountMinor: sql<string>`coalesce(sum(${couponRedemptions.discountMinor}), 0)::text`,
        lastUsedAt: sql<Date | null>`max(${couponRedemptions.createdAt})`,
      })
      .from(couponRedemptions)
      .groupBy(couponRedemptions.couponId, couponRedemptions.currency),
  ])
  const usageOf = new Map<string, typeof usage>()
  for (const row of usage) usageOf.set(row.couponId, [...(usageOf.get(row.couponId) ?? []), row])
  const now = new Date()
  const totalUses = usage.reduce((sum, row) => sum + row.uses, 0)

  return (
    <>
      <PageHead
        title={t('disc.title')}
        description={t('disc.description')}
        actions={
          <Link className="a-btn" href={adminHref('/discounts/new')}>
            {t('disc.new')}
          </Link>
        }
      />
      <Flash searchParams={params} />

      <div className="a-grid">
        <div className="a-stat">
          <b>{rows.filter((row) => couponStateOf(row, now) === 'live').length}</b>
          <span>{t('disc.stat_live')}</span>
        </div>
        <div className="a-stat">
          <b>{totalUses}</b>
          <span>{t('disc.stat_uses')}</span>
        </div>
      </div>

      {rows.length === 0 ? (
        <Empty>{t('disc.empty')}</Empty>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>{t('disc.code')}</th>
              <th>{t('disc.value')}</th>
              <th>{t('common.status')}</th>
              <th>{t('disc.valid')}</th>
              <th className="num">{t('disc.uses')}</th>
              <th className="num">{t('disc.given')}</th>
              <th>{t('disc.last_used')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const state = couponStateOf(row, now)
              const used = usageOf.get(row.id) ?? []
              const uses = used.reduce((sum, entry) => sum + entry.uses, 0)
              const last = used
                .map((entry) => (entry.lastUsedAt ? new Date(entry.lastUsedAt) : null))
                .filter((value): value is Date => value !== null)
                .sort((a, b) => b.getTime() - a.getTime())[0]
              return (
                <tr key={row.id}>
                  <td>
                    <Link className="a-mono" href={adminHref(`/discounts/${row.id}`)}>
                      {row.code}
                    </Link>
                    {row.internalNote ? <div className="a-muted">{row.internalNote}</div> : null}
                  </td>
                  <td>{couponValueLabel(row, intl)}</td>
                  <td>
                    <Pill tone={state === 'live' ? 'good' : state === 'off' ? 'neutral' : 'warn'}>
                      {t(`disc.state_${state}`)}
                    </Pill>
                  </td>
                  <td className="a-muted">
                    {row.validFrom ? <When value={row.validFrom} /> : t('disc.any_time')}
                    {' – '}
                    {row.validTo ? <When value={row.validTo} /> : t('disc.no_end')}
                  </td>
                  <td className="num">
                    {uses}
                    {row.maxUses !== null ? ` / ${row.maxUses}` : ''}
                  </td>
                  <td className="num">
                    {used.length === 0
                      ? '—'
                      : used
                          .map((entry) =>
                            formatMoney(Number(entry.discountMinor), entry.currency, intl),
                          )
                          .join(' · ')}
                  </td>
                  <td>{last ? <When value={last} /> : <span className="a-muted">—</span>}</td>
                </tr>
              )
            })}
          </tbody>
        </Table>
      )}
    </>
  )
}
