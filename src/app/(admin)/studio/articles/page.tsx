import { and, count, desc, eq, ilike, isNull, or, sql, type SQL } from 'drizzle-orm'
import Link from 'next/link'

import { db } from '@/db'
import { articleCategories, articles } from '@/db/schema'
import { can } from '@/lib/auth/roles'
import { pick } from '@/lib/content/localize'

import { adminHref } from '../../_lib/admin-path'
import { pageParam, param } from '../../_lib/result'
import { requireCapability } from '../../_lib/session'
import { Flash } from '../../_ui/flash'
import { PageHead } from '../../_ui/shell'
import { Empty, Pager, Pill, PublishPill, Table, When } from '../../_ui/table'
import { setArticleStatus } from './actions'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 25
const LIST = adminHref('/articles')

export default async function ArticlesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requireCapability('content.read')
  const params = await searchParams

  const q = param(params, 'q')
  const status = param(params, 'status')
  const page = pageParam(params)

  const filters: SQL[] = [isNull(articles.deletedAt)]
  if (q) {
    const like = `%${q}%`
    const match = or(ilike(articles.slug, like), sql`${articles.title} ->> 'en' ilike ${like}`)
    if (match) filters.push(match)
  }
  if (status === 'draft' || status === 'published') filters.push(eq(articles.status, status))

  const where = and(...filters)

  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        id: articles.id,
        slug: articles.slug,
        title: articles.title,
        status: articles.status,
        bridge: articles.bridge,
        requiredEntitlement: articles.requiredEntitlement,
        body: articles.body,
        publishedAt: articles.publishedAt,
        updatedAt: articles.updatedAt,
        categoryKey: articleCategories.key,
        categoryLabel: articleCategories.label,
      })
      .from(articles)
      .leftJoin(articleCategories, eq(articleCategories.id, articles.categoryId))
      .where(where)
      .orderBy(desc(articles.updatedAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ value: count() }).from(articles).where(where),
  ])

  return (
    <>
      <PageHead
        title="Articles"
        description="Each article has its own body in all three locales — the prototype reused three lorem paragraphs everywhere."
        actions={
          can(session.role, 'content.write') ? (
            <Link className="a-btn" href={adminHref('/articles/new')}>
              New article
            </Link>
          ) : null
        }
      />
      <Flash searchParams={params} />

      <form className="a-row a-card" method="get" action={LIST}>
        <div className="a-field">
          <label htmlFor="q">Search</label>
          <input className="a-input" id="q" name="q" defaultValue={q ?? ''} />
        </div>
        <div className="a-field">
          <label htmlFor="status">Status</label>
          <select className="a-select" id="status" name="status" defaultValue={status ?? ''}>
            <option value="">Any</option>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
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
        <Empty>No articles match those filters.</Empty>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>Title</th>
              <th>Category</th>
              <th>Status</th>
              <th>Body</th>
              <th>CTA</th>
              <th>Updated</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const hasBody = (row.body?.en ?? '').trim() !== ''
              return (
                <tr key={row.id}>
                  <td>
                    <Link href={adminHref(`/articles/${row.id}`)}>
                      {pick(row.title, 'en', row.slug)}
                    </Link>{' '}
                    {row.requiredEntitlement ? (
                      <Pill tone="warn">
                        🔒 {row.requiredEntitlement === 'map_access' ? 'Map plan' : 'VIP'}
                      </Pill>
                    ) : null}
                    <div className="a-mono a-muted">{row.slug}</div>
                  </td>
                  <td>
                    {row.categoryKey ? (
                      pick(row.categoryLabel, 'en', row.categoryKey)
                    ) : (
                      <span className="a-muted">—</span>
                    )}
                  </td>
                  <td>
                    <PublishPill status={row.status} />
                  </td>
                  <td>
                    <Pill tone={hasBody ? 'good' : 'bad'}>{hasBody ? 'written' : 'empty'}</Pill>
                  </td>
                  <td>{row.bridge ?? <span className="a-muted">—</span>}</td>
                  <td>
                    <When value={row.updatedAt} />
                  </td>
                  <td>
                    {can(session.role, 'content.publish') ? (
                      <form
                        className="a-inline-form"
                        action={setArticleStatus.bind(
                          null,
                          row.id,
                          row.status === 'published' ? 'draft' : 'published',
                        )}
                      >
                        <button className="a-btn ghost small" type="submit">
                          {row.status === 'published' ? 'Unpublish' : 'Publish'}
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
