import { asc, count, isNull } from 'drizzle-orm'
import Link from 'next/link'

import { db } from '@/db'
import { activityAddonLinks, addonsLibrary } from '@/db/schema'
import { can } from '@/lib/auth/roles'
import { pick } from '@/lib/content/localize'
import { formatMoney } from '@/lib/money'

import { adminHref } from '../../_lib/admin-path'
import { getAdminI18n } from '../../_lib/i18n'
import { requireCapability } from '../../_lib/session'
import { Flash } from '../../_ui/flash'
import { PageHead } from '../../_ui/shell'
import { Empty, Pill, Table } from '../../_ui/table'

export const dynamic = 'force-dynamic'

/** The shared extras library ("الخدمات الإضافية"). Each row opens its own page. */
export default async function AddonsLibraryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requireCapability('content.read')
  const { t, intl, locale } = await getAdminI18n()
  const params = await searchParams

  const [rows, usage] = await Promise.all([
    db
      .select()
      .from(addonsLibrary)
      .where(isNull(addonsLibrary.deletedAt))
      .orderBy(asc(addonsLibrary.sortOrder), asc(addonsLibrary.createdAt)),
    db
      .select({ addonId: activityAddonLinks.addonId, value: count() })
      .from(activityAddonLinks)
      .groupBy(activityAddonLinks.addonId),
  ])
  const used = new Map(usage.map((row) => [row.addonId, row.value]))
  const pricing = (value: string) =>
    value === 'per_person'
      ? t('activities.addon_per_person')
      : value === 'per_qty'
        ? t('activities.addon_per_qty')
        : t('activities.addon_per_booking')

  return (
    <>
      <PageHead
        title={t('addons.title')}
        description={t('addons.description')}
        actions={
          can(session.role, 'content.write') ? (
            <Link className="a-btn" href={adminHref('/addons/new')}>
              {t('addons.new')}
            </Link>
          ) : null
        }
      />
      <Flash searchParams={params} />
      {rows.length === 0 ? (
        <Empty>{t('addons.empty')}</Empty>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>{t('addons.name')}</th>
              <th className="num">{t('common.price')}</th>
              <th>{t('addons.pricing')}</th>
              <th>{t('addons.used_by')}</th>
              <th>{t('common.status')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <Link href={adminHref(`/addons/${row.id}`)}>{pick(row.name, locale)}</Link>
                </td>
                <td className="num">{formatMoney(row.priceMinor, row.currency, intl)}</td>
                <td>{pricing(row.pricing)}</td>
                <td>
                  {used.get(row.id) ? (
                    t('addons.used_count', { count: used.get(row.id) ?? 0 })
                  ) : (
                    <span className="a-muted">{t('addons.used_none')}</span>
                  )}
                </td>
                <td>
                  {row.available ? (
                    <Pill tone="good">{t('addons.available')}</Pill>
                  ) : (
                    <Pill tone="bad">{t('addons.off_pill')}</Pill>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  )
}
