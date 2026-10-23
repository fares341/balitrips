import { and, asc, count, desc, eq, ilike, isNull, or, sql, type SQL } from 'drizzle-orm'
import Link from 'next/link'

import { db } from '@/db'
import { activities, categories, media, regions } from '@/db/schema'
import { mediaUrl } from '@/lib/content/queries'
import { activityVisibility } from '@/lib/content/activity-status'
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
import { duplicateActivity } from './v2-actions'
import { isUuid } from '../../_lib/form'

/** v2 list filters: what is missing or waiting. */
const FLAGS = ['review', 'noimg', 'nopkg', 'missing'] as const

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
  const categoryId = param(params, 'category')
  const flag = param(params, 'flag')
  const page = pageParam(params)

  const filters: SQL[] = [isNull(activities.deletedAt)]

  if (q) {
    // Search the authoring locale and the slug. Matching every locale would
    // need a jsonb path per locale; English plus slug is what operators use.
    const like = `%${q}%`
    const match = isUuid(q)
      ? eq(activities.id, q)
      : or(
          ilike(activities.slug, like),
          sql`${activities.name} ->> 'en' ilike ${like}`,
          sql`${activities.name} ->> 'ar' ilike ${like}`,
          sql`${activities.area} ->> 'en' ilike ${like}`,
          sql`${activities.legacyId} ilike ${like}`,
        )
    if (match) filters.push(match)
  }
  if (categoryId && isUuid(categoryId)) {
    filters.push(
      sql`(${activities.primaryCategoryId} = ${categoryId} or exists (select 1 from activity_categories ac where ac.activity_id = ${activities.id} and ac.category_id = ${categoryId}))`,
    )
  }
  const livePackages = sql`(select count(*)::int from activity_tiers tr where tr.activity_id = ${activities.id} and tr.deleted_at is null and tr.status = 'published')`
  if (flag === 'review') filters.push(eq(activities.needsReview, true))
  if (flag === 'noimg') filters.push(isNull(activities.heroImageId))
  if (flag === 'nopkg') filters.push(sql`${livePackages} = 0`)
  if (flag === 'missing') {
    const gap = or(
      isNull(activities.heroImageId),
      isNull(activities.regionId),
      sql`coalesce(${activities.name} ->> 'ar', '') = ''`,
      sql`coalesce(${activities.description} ->> 'ar', '') = '' and coalesce(${activities.description} ->> 'en', '') = ''`,
      sql`(${activities.priceMinor} = 0 and ${livePackages} = 0)`,
    )
    if (gap) filters.push(gap)
  }
  if (status !== null && (ACTIVITY_STATUSES as readonly string[]).includes(status)) {
    filters.push(eq(activities.status, status))
  }
  if (regionId) filters.push(eq(activities.regionId, regionId))

  const where = and(...filters)

  // The order card lists every activity (no filters): dragging reorders the site.
  const unfiltered = !q && !status && !regionId && !categoryId && !flag
  const [rows, [totalRow], regionRows, categoryRows, orderRows] = await Promise.all([
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
        categoryLabel: categories.label,
        categoryKey: categories.key,
        heroKey: media.objectKey,
        needsReview: activities.needsReview,
        packageCount: livePackages.mapWith(Number),
        fromMinor: sql<
          number | null
        >`(select min(tr.price_minor) from activity_tiers tr where tr.activity_id = ${activities.id} and tr.deleted_at is null and tr.status = 'published')`.mapWith(
          (value) => (value === null ? null : Number(value)),
        ),
      })
      .from(activities)
      .leftJoin(regions, eq(regions.id, activities.regionId))
      .leftJoin(categories, eq(categories.id, activities.primaryCategoryId))
      .leftJoin(media, eq(media.id, activities.heroImageId))
      .where(where)
      .orderBy(asc(activities.sortOrder), desc(activities.updatedAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ value: count() }).from(activities).where(where),
    db
      .select({ id: regions.id, key: regions.key, label: regions.label })
      .from(regions)
      .orderBy(asc(regions.sortOrder)),
    db
      .select({ id: categories.id, key: categories.key, label: categories.label })
      .from(categories)
      .orderBy(asc(categories.key)),
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
            <>
              <Link className="a-btn ghost" href={adminHref('/activities/images')}>
                {t('sr.img_title')}
              </Link>
              <Link className="a-btn ghost" href={adminHref('/activity-import')}>
                {t('av2.import')}
              </Link>
              <Link className="a-btn" href={adminHref('/activities/new')}>
                {t('activities.new')}
              </Link>
            </>
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
            <option value="in_review">{t('av2.status_pill_in_review')}</option>
            <option value="archived">{t('common.archived')}</option>
          </select>
        </div>
        <div className="a-field">
          <label htmlFor="category">{t('av2.category')}</label>
          <select
            className="a-select"
            id="category"
            name="category"
            defaultValue={categoryId ?? ''}
          >
            <option value="">{t('common.all')}</option>
            {categoryRows.map((category) => (
              <option key={category.id} value={category.id}>
                {pick(category.label, locale, category.key)}
              </option>
            ))}
          </select>
        </div>
        <div className="a-field">
          <label htmlFor="flag">{t('av2.flag')}</label>
          <select className="a-select" id="flag" name="flag" defaultValue={flag ?? ''}>
            <option value="">{t('common.all')}</option>
            {FLAGS.map((value) => (
              <option key={value} value={value}>
                {t(`av2.flag_${value}`)}
              </option>
            ))}
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
              <th aria-label={t('av2.thumb')} />
              <th>{t('common.name')}</th>
              <th>{t('activities.region')}</th>
              <th>{t('av2.category')}</th>
              <th className="num">{t('av2.packages')}</th>
              <th className="num">{t('av2.from_price')}</th>
              <th>{t('common.status')}</th>
              <th>{t('av2.bookable')}</th>
              <th>{t('common.updated')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  {row.heroKey ? (
                    // eslint-disable-next-line @next/next/no-img-element -- small CMS thumbnail
                    <img className="a-thumb" src={mediaUrl(row.heroKey)} alt="" loading="lazy" />
                  ) : (
                    <span className="a-thumb" aria-hidden="true" />
                  )}
                </td>
                <td>
                  <Link href={adminHref(`/activities/${row.id}`)}>
                    {pick(row.name, locale, row.slug)}
                  </Link>
                  {row.needsReview ? (
                    <>
                      {' '}
                      <Pill tone="warn">{t('av2.flag_review')}</Pill>
                    </>
                  ) : null}
                </td>
                <td>
                  {row.regionKey ? (
                    pick(row.regionLabel, locale, row.regionKey)
                  ) : (
                    <span className="a-muted">—</span>
                  )}
                </td>
                <td>
                  {row.categoryKey ? (
                    pick(row.categoryLabel, locale, row.categoryKey)
                  ) : (
                    <span className="a-muted">—</span>
                  )}
                </td>
                <td className="num">{row.packageCount}</td>
                <td className="num">
                  {formatMoney(row.fromMinor ?? row.priceMinor, row.currency, intl)}
                </td>
                <td>
                  <PublishPill status={row.status} />
                </td>
                <td>
                  {activityVisibility(row.status).bookable ? (
                    <Pill tone="good">{t('av2.yes')}</Pill>
                  ) : (
                    <Pill tone="neutral">{t('av2.no')}</Pill>
                  )}
                </td>
                <td>
                  <When value={row.updatedAt} />
                </td>
                <td className="a-actions">
                  <a
                    className="a-btn ghost small"
                    href={`/ar/activities/${row.slug}/preview`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {t('av2.preview')}
                  </a>
                  {mayWrite ? (
                    <form className="a-inline-form" action={duplicateActivity.bind(null, row.id)}>
                      <button className="a-btn ghost small" type="submit">
                        {t('av2.duplicate')}
                      </button>
                    </form>
                  ) : null}
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
