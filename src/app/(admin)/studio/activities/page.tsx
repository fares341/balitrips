import { and, asc, count, desc, eq, ilike, isNull, or, sql, type SQL } from 'drizzle-orm'
import Link from 'next/link'

import { db } from '@/db'
import { activities, regions } from '@/db/schema'
import { can } from '@/lib/auth/roles'
import { pick } from '@/lib/content/localize'
import { formatMoney } from '@/lib/money'

import { adminHref } from '../../_lib/admin-path'
import { pageParam, param } from '../../_lib/result'
import { requireCapability } from '../../_lib/session'
import { Flash } from '../../_ui/flash'
import { PageHead } from '../../_ui/shell'
import { Empty, Pager, PublishPill, Table, When } from '../../_ui/table'
import { getAdminI18n } from '../../_lib/i18n'
import { setActivityStatus } from './actions'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 25
const LIST = adminHref('/activities')

export default async function ActivitiesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requireCapability('content.read')
  const { t, intl, locale } = await getAdminI18n()
  const params = await searchParams

  const q = param(params, 'q')
  const status = param(params, 'status')
  const regionId = param(params, 'region')
  const page = pageParam(params)

  const filters: SQL[] = [isNull(activities.deletedAt)]

  if (q) {
    // Search the authoring locale and the slug. Matching every locale would
    // need a jsonb path per locale; English plus slug is what operators use.
    const like = `%${q}%`
    const match = or(
      ilike(activities.slug, like),
      sql`${activities.name} ->> 'en' ilike ${like}`,
      sql`${activities.area} ->> 'en' ilike ${like}`,
    )
    if (match) filters.push(match)
  }
  if (status === 'draft' || status === 'published') {
    filters.push(eq(activities.status, status))
  }
  if (regionId) filters.push(eq(activities.regionId, regionId))

  const where = and(...filters)

  const [rows, [totalRow], regionRows] = await Promise.all([
    db
      .select({
        id: activities.id,
        slug: activities.slug,
        name: activities.name,
        status: activities.status,
        priceMinor: activities.priceMinor,
        currency: activities.currency,
        maxGuests: activities.maxGuests,
        leadTimeHours: activities.leadTimeHours,
        updatedAt: activities.updatedAt,
        regionLabel: regions.label,
        regionKey: regions.key,
      })
      .from(activities)
      .leftJoin(regions, eq(regions.id, activities.regionId))
      .where(where)
      .orderBy(asc(activities.sortOrder), desc(activities.updatedAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ value: count() }).from(activities).where(where),
    db
      .select({ id: regions.id, key: regions.key, label: regions.label })
      .from(regions)
      .orderBy(asc(regions.sortOrder)),
  ])

  const total = totalRow?.value ?? 0
  const mayPublish = can(session.role, 'content.publish')
  const mayWrite = can(session.role, 'content.write')

  return (
    <>
      <PageHead
        title={t('activities.title')}
        description={t('activities.list_description')}
        actions={
          mayWrite ? (
            <Link className="a-btn" href={adminHref('/activities/new')}>
              {t('activities.new')}
            </Link>
          ) : null
        }
      />
      <Flash searchParams={params} />

      <form className="a-row a-card" method="get" action={LIST}>
        <div className="a-field">
          <label htmlFor="q">{t('common.search')}</label>
          <input
            className="a-input"
            id="q"
            name="q"
            defaultValue={q ?? ''}
            placeholder={t('activities.search_placeholder')}
          />
        </div>
        <div className="a-field">
          <label htmlFor="status">{t('common.status')}</label>
          <select className="a-select" id="status" name="status" defaultValue={status ?? ''}>
            <option value="">{t('common.all')}</option>
            <option value="draft">{t('common.draft')}</option>
            <option value="published">{t('common.published')}</option>
          </select>
        </div>
        <div className="a-field">
          <label htmlFor="region">{t('activities.region')}</label>
          <select className="a-select" id="region" name="region" defaultValue={regionId ?? ''}>
            <option value="">{t('common.all')}</option>
            {regionRows.map((region) => (
              <option key={region.id} value={region.id}>
                {pick(region.label, locale, region.key)}
              </option>
            ))}
          </select>
        </div>
        <div className="a-actions">
          <button className="a-btn" type="submit">
            {t('common.filter')}
          </button>
          <Link className="a-btn ghost" href={LIST}>
            {t('common.clear')}
          </Link>
        </div>
      </form>

      {rows.length === 0 ? (
        <Empty>{t('activities.empty')}</Empty>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>{t('common.name')}</th>
              <th>{t('activities.region')}</th>
              <th>{t('common.status')}</th>
              <th className="num">{t('common.price')}</th>
              <th className="num">{t('activities.max_guests')}</th>
              <th className="num">{t('activities.lead_time')}</th>
              <th>{t('common.updated')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <Link href={adminHref(`/activities/${row.id}`)}>
                    {pick(row.name, locale, row.slug)}
                  </Link>
                  <div className="a-mono a-muted">{row.slug}</div>
                </td>
                <td>
                  {row.regionKey ? (
                    pick(row.regionLabel, locale, row.regionKey)
                  ) : (
                    <span className="a-muted">—</span>
                  )}
                </td>
                <td>
                  <PublishPill status={row.status} />
                </td>
                <td className="num">{formatMoney(row.priceMinor, row.currency, intl)}</td>
                <td className="num">{row.maxGuests}</td>
                <td className="num">{t('activities.hours_short', { hours: row.leadTimeHours })}</td>
                <td>
                  <When value={row.updatedAt} />
                </td>
                <td>
                  {mayPublish ? (
                    <form
                      className="a-inline-form"
                      action={setActivityStatus.bind(
                        null,
                        row.id,
                        row.status === 'published' ? 'draft' : 'published',
                      )}
                    >
                      <button className="a-btn ghost small" type="submit">
                        {row.status === 'published'
                          ? t('activities.unpublish')
                          : t('activities.publish')}
                      </button>
                    </form>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      <Pager basePath={LIST} searchParams={params} page={page} pageSize={PAGE_SIZE} total={total} />
    </>
  )
}
