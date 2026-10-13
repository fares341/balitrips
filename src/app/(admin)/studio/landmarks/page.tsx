import { and, asc, count, eq, ilike, isNull, or, sql, type SQL } from 'drizzle-orm'
import Link from 'next/link'

import { db } from '@/db'
import { activities, landmarks, regions } from '@/db/schema'
import { can } from '@/lib/auth/roles'
import { pick } from '@/lib/content/localize'

import { adminHref } from '../../_lib/admin-path'
import { getAdminI18n } from '../../_lib/i18n'
import { pageParam, param } from '../../_lib/result'
import { requireCapability } from '../../_lib/session'
import { Flash } from '../../_ui/flash'
import { PageHead } from '../../_ui/shell'
import { Empty, Pager, PublishPill, Table, When } from '../../_ui/table'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 30
const LIST = adminHref('/landmarks')

export default async function LandmarksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requireCapability('content.read')
  const { t } = await getAdminI18n()
  const params = await searchParams

  const q = param(params, 'q')
  const page = pageParam(params)

  const filters: SQL[] = [isNull(landmarks.deletedAt)]
  if (q) {
    const like = `%${q}%`
    const match = or(ilike(landmarks.slug, like), sql`${landmarks.name} ->> 'en' ilike ${like}`)
    if (match) filters.push(match)
  }

  const where = and(...filters)

  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        id: landmarks.id,
        slug: landmarks.slug,
        name: landmarks.name,
        type: landmarks.type,
        status: landmarks.status,
        sortOrder: landmarks.sortOrder,
        updatedAt: landmarks.updatedAt,
        regionKey: regions.key,
        regionLabel: regions.label,
        activitySlug: activities.slug,
      })
      .from(landmarks)
      .leftJoin(regions, eq(regions.id, landmarks.regionId))
      .leftJoin(activities, eq(activities.id, landmarks.activityId))
      .where(where)
      .orderBy(asc(landmarks.sortOrder), asc(landmarks.slug))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ value: count() }).from(landmarks).where(where),
  ])

  return (
    <>
      <PageHead
        title={t('landmarks.title')}
        description={t('landmarks.description')}
        actions={
          can(session.role, 'content.write') ? (
            <Link className="a-btn" href={adminHref('/landmarks/new')}>
              {t('landmarks.new')}
            </Link>
          ) : null
        }
      />
      <Flash searchParams={params} />

      <form className="a-row a-card" method="get" action={LIST}>
        <div className="a-field">
          <label htmlFor="q">{t('common.search')}</label>
          <input className="a-input" id="q" name="q" defaultValue={q ?? ''} />
        </div>
        <div className="a-actions">
          <button className="a-btn" type="submit">
            {t('common.filter')}
          </button>
          <Link className="a-btn ghost" href={LIST}>
            {t('landmarks.reset')}
          </Link>
        </div>
      </form>

      {rows.length === 0 ? (
        <Empty>{t('landmarks.empty')}</Empty>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>{t('common.name')}</th>
              <th>{t('common.type')}</th>
              <th>{t('landmarks.col_region')}</th>
              <th>{t('landmarks.col_linked_activity')}</th>
              <th>{t('common.status')}</th>
              <th className="num">{t('landmarks.col_order')}</th>
              <th>{t('common.updated')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <Link href={adminHref(`/landmarks/${row.id}`)}>
                    {pick(row.name, 'en', row.slug)}
                  </Link>
                  <div className="a-mono a-muted">{row.slug}</div>
                </td>
                <td>{pick(row.type, 'en') || <span className="a-muted">—</span>}</td>
                <td>
                  {row.regionKey ? (
                    pick(row.regionLabel, 'en', row.regionKey)
                  ) : (
                    <span className="a-muted">—</span>
                  )}
                </td>
                <td className="a-mono">{row.activitySlug ?? <span className="a-muted">—</span>}</td>
                <td>
                  <PublishPill status={row.status} />
                </td>
                <td className="num">{row.sortOrder}</td>
                <td>
                  <When value={row.updatedAt} />
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
