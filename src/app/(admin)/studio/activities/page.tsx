import { and, asc, count, desc, eq, ilike, isNull, or, sql, type SQL } from 'drizzle-orm'
import Link from 'next/link'

import { db } from '@/db'
import { activities, regions } from '@/db/schema'
import { can } from '@/lib/auth/roles'
import { pick } from '@/lib/content/localize'
import { formatMoney } from '@/lib/money'
import { ACTIVITY_STATUSES } from '@/lib/content/activity-status'

import { adminHref } from '../../_lib/admin-path'
import { pageParam, param } from '../../_lib/result'
import { requireCapability } from '../../_lib/session'
import { Flash } from '../../_ui/flash'
import { PageHead } from '../../_ui/shell'
import { SortableList } from '../../_ui/sortable'
import { Empty, Pager, Pill, PublishPill, Table, When } from '../../_ui/table'
import { getAdminI18n } from '../../_lib/i18n'
import { reorderActivities, setActivityStatus } from './actions'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 25

/** Reordering is an edit: shown to roles that may write content. */
function mayWriteOrder(role: Parameters<typeof can>[0]): boolean {
  return can(role, 'content.write')
}
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
  if (status !== null && (ACTIVITY_STATUSES as readonly string[]).includes(status)) {
    filters.push(eq(activities.status, status))
  }
  if (regionId) filters.push(eq(activities.regionId, regionId))

  const where = and(...filters)

  // The order card lists every activity (no filters): dragging reorders the site.
  const unfiltered = !q && !status && !regionId
  const [rows, [totalRow], regionRows, orderRows] = await Promise.all([
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
    unfiltered && mayWriteOrder(session.role)
      ? db
          .select({
            id: activities.id,
            slug: activities.slug,
            name: activities.name,
            status: activities.status,
            isFeatured: activities.isFeatured,
            isMostPopular: activities.isMostPopular,
            showOnHome: activities.showOnHome,
          })
          .from(activities)
          .where(isNull(activities.deletedAt))
          .orderBy(asc(activities.sortOrder), desc(activities.updatedAt))
          .limit(200)
      : Promise.resolve([]),
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
            <option value="hidden">{t('ae.status_pill_hidden')}</option>
            <option value="unavailable">{t('ae.status_pill_unavailable')}</option>
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

      {orderRows.length > 1 ? (
        <details className="a-card a-order-card">
          <summary>
            <h2>{t('ae.order_title')}</h2>
          </summary>
          <SortableList
            hint={t('ae.order_hint')}
            onSave={reorderActivities}
            rows={orderRows.map((row) => ({
              id: row.id,
              label: pick(row.name, locale, row.slug),
              content: (
                <span className="a-sort-line">
                  <b>{pick(row.name, locale, row.slug)}</b>
                  <PublishPill status={row.status} />
                  {row.isFeatured ? <Pill tone="info">{t('ae.flag_featured_pill')}</Pill> : null}
                  {row.showOnHome ? <Pill tone="good">{t('ae.flag_home_pill')}</Pill> : null}
                  {row.isMostPopular ? <Pill tone="warn">{t('ae.flag_popular_pill')}</Pill> : null}
                </span>
              ),
            }))}
          />
        </details>
      ) : null}

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
