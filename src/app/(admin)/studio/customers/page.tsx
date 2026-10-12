import { and, count, desc, eq, gt, ilike, isNotNull, isNull, or, type SQL } from 'drizzle-orm'
import Link from 'next/link'

import { db } from '@/db'
import { orders, sessions, users } from '@/db/schema'
import { ROLES } from '@/lib/auth/roles'

import { adminHref } from '../../_lib/admin-path'
import { pageParam, param } from '../../_lib/result'
import { requireCapability } from '../../_lib/session'
import { Flash } from '../../_ui/flash'
import { PageHead } from '../../_ui/shell'
import { Empty, Pager, Pill, Table, When } from '../../_ui/table'

export const dynamic = 'force-dynamic'

/**
 * Everyone with an account: customers, staff and admins in one list.
 *
 * Not split by role, because the question an operator actually arrives with
 * is "what is going on with this e-mail address" — and the answer is the same
 * screen whether that address belongs to a traveller or to a colleague.
 *
 * Live session count is computed here rather than on the detail page so the
 * list answers "who is currently signed in somewhere" at a glance; an
 * expired-but-not-yet-collected row is not a live session and is excluded by
 * the `expires_at > now()` predicate.
 */

const PAGE_SIZE = 30
const LIST = adminHref('/customers')

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireCapability('customers.read')
  const params = await searchParams

  const q = param(params, 'q')
  const role = param(params, 'role')
  const state = param(params, 'state')
  const page = pageParam(params)

  const now = new Date()
  const filters: SQL[] = []

  if (q) {
    const like = `%${q}%`
    const match = or(ilike(users.email, like), ilike(users.name, like), ilike(users.phone, like))
    if (match) filters.push(match)
  }
  if (role && ROLES.includes(role as (typeof ROLES)[number])) filters.push(eq(users.role, role))
  filters.push(state === 'deleted' ? isNotNull(users.deletedAt) : isNull(users.deletedAt))

  const where = and(...filters)

  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        locale: users.locale,
        country: users.country,
        twoFactorEnabled: users.twoFactorEnabled,
        emailVerifiedAt: users.emailVerifiedAt,
        createdAt: users.createdAt,
        deletedAt: users.deletedAt,
        liveSessions: db.$count(
          sessions,
          and(eq(sessions.userId, users.id), gt(sessions.expiresAt, now)),
        ),
        orderCount: db.$count(orders, eq(orders.userId, users.id)),
      })
      .from(users)
      .where(where)
      .orderBy(desc(users.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ value: count() }).from(users).where(where),
  ])

  return (
    <>
      <PageHead
        title="Customers"
        description="Accounts, their live sessions and their role. Role changes and erasure requests are handled on the account page and every one of them is audited."
      />
      <Flash searchParams={params} />

      <form className="a-row a-card" method="get" action={LIST}>
        <div className="a-field">
          <label htmlFor="q">Search</label>
          <input
            className="a-input"
            id="q"
            name="q"
            defaultValue={q ?? ''}
            placeholder="E-mail, name or phone"
          />
        </div>
        <div className="a-field">
          <label htmlFor="role">Role</label>
          <select className="a-select" id="role" name="role" defaultValue={role ?? ''}>
            <option value="">Any</option>
            {ROLES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
        <div className="a-field">
          <label htmlFor="state">State</label>
          <select className="a-select" id="state" name="state" defaultValue={state ?? ''}>
            <option value="">Active</option>
            <option value="deleted">Deleted</option>
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
        <Empty>No accounts match those filters.</Empty>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>Account</th>
              <th>Role</th>
              <th>Two-factor</th>
              <th className="num">Sessions</th>
              <th className="num">Orders</th>
              <th>Locale</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <Link href={adminHref(`/customers/${row.id}`)}>{row.email}</Link>
                  <div className="a-muted">
                    {row.name ?? '—'}
                    {row.deletedAt ? ' · deleted' : ''}
                    {row.emailVerifiedAt === null && row.deletedAt === null ? ' · unverified' : ''}
                  </div>
                </td>
                <td>
                  <Pill tone={row.role === 'customer' ? 'neutral' : 'info'}>{row.role}</Pill>
                </td>
                <td>
                  {row.role === 'customer' ? (
                    <span className="a-muted">n/a</span>
                  ) : row.twoFactorEnabled ? (
                    <Pill tone="good">enrolled</Pill>
                  ) : (
                    <Pill tone="bad">missing</Pill>
                  )}
                </td>
                <td className="num">{row.liveSessions}</td>
                <td className="num">{row.orderCount}</td>
                <td className="a-mono">
                  {row.locale}
                  {row.country ? ` · ${row.country}` : ''}
                </td>
                <td>
                  <When value={row.createdAt} />
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
