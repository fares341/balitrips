import { and, count, desc, eq, ilike, isNull, type SQL } from 'drizzle-orm'
import Link from 'next/link'

import { db } from '@/db'
import { activities, reviews } from '@/db/schema'
import { can } from '@/lib/auth/roles'
import { pick } from '@/lib/content/localize'

import { adminHref } from '../../_lib/admin-path'
import { pageParam, param } from '../../_lib/result'
import { requireCapability } from '../../_lib/session'
import { Flash } from '../../_ui/flash'
import { PageHead } from '../../_ui/shell'
import { Empty, Pager, Pill, Table, When } from '../../_ui/table'
import { setReviewPublished } from './actions'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 25
const LIST = adminHref('/reviews')

export default async function ReviewsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requireCapability('content.read')
  const params = await searchParams

  const q = param(params, 'q')
  const state = param(params, 'state')
  const page = pageParam(params)

  const filters: SQL[] = [isNull(reviews.deletedAt)]
  if (q) filters.push(ilike(reviews.authorName, `%${q}%`))
  if (state === 'published') filters.push(eq(reviews.isPublished, true))
  if (state === 'hidden') filters.push(eq(reviews.isPublished, false))

  const where = and(...filters)

  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        id: reviews.id,
        authorName: reviews.authorName,
        stars: reviews.stars,
        body: reviews.body,
        isPublished: reviews.isPublished,
        orderId: reviews.orderId,
        createdAt: reviews.createdAt,
        activitySlug: activities.slug,
        activityName: activities.name,
      })
      .from(reviews)
      .leftJoin(activities, eq(activities.id, reviews.activityId))
      .where(where)
      .orderBy(desc(reviews.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ value: count() }).from(reviews).where(where),
  ])

  return (
    <>
      <PageHead
        title="Reviews"
        description="Every review belongs to an activity. One tied to a real order shows as verified."
        actions={
          can(session.role, 'content.write') ? (
            <Link className="a-btn" href={adminHref('/reviews/new')}>
              New review
            </Link>
          ) : null
        }
      />
      <Flash searchParams={params} />

      <form className="a-row a-card" method="get" action={LIST}>
        <div className="a-field">
          <label htmlFor="q">Author</label>
          <input className="a-input" id="q" name="q" defaultValue={q ?? ''} />
        </div>
        <div className="a-field">
          <label htmlFor="state">State</label>
          <select className="a-select" id="state" name="state" defaultValue={state ?? ''}>
            <option value="">Any</option>
            <option value="published">Published</option>
            <option value="hidden">Hidden</option>
          </select>
        </div>
        <div className="a-actions">
          <button className="a-btn" type="submit">
            Filter
          </button>
          <Link className="a-btn ghost" href={LIST}>
            Reset
          </Link>
        </div>
      </form>

      {rows.length === 0 ? (
        <Empty>No reviews match those filters.</Empty>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>Author</th>
              <th className="num">Stars</th>
              <th>Activity</th>
              <th>Body</th>
              <th>State</th>
              <th>Received</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <Link href={adminHref(`/reviews/${row.id}`)}>{row.authorName}</Link>
                  {row.orderId ? (
                    <>
                      {' '}
                      <Pill tone="good">verified</Pill>
                    </>
                  ) : null}
                </td>
                <td className="num">{row.stars}</td>
                <td>
                  {row.activitySlug ? (
                    pick(row.activityName, 'en', row.activitySlug)
                  ) : (
                    <Pill tone="bad">unattached</Pill>
                  )}
                </td>
                <td className="a-json">{pick(row.body, 'en').slice(0, 140)}</td>
                <td>
                  <Pill tone={row.isPublished ? 'good' : 'neutral'}>
                    {row.isPublished ? 'published' : 'hidden'}
                  </Pill>
                </td>
                <td>
                  <When value={row.createdAt} />
                </td>
                <td>
                  {can(session.role, 'content.publish') ? (
                    <form
                      className="a-inline-form"
                      action={setReviewPublished.bind(null, row.id, !row.isPublished)}
                    >
                      <button className="a-btn ghost small" type="submit">
                        {row.isPublished ? 'Hide' : 'Publish'}
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
        total={totalRow?.value ?? 0}
      />
    </>
  )
}
