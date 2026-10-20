import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import Link from 'next/link'

import { db } from '@/db'
import { orders, users } from '@/db/schema'
import { contactLabel } from '@/lib/auth/phone'
import { can } from '@/lib/auth/roles'
import { findDuplicateGroups } from '@/lib/crm/duplicates'

import { adminHref } from '../../_lib/admin-path'
import { getAdminI18n } from '../../_lib/i18n'
import { requireCapability } from '../../_lib/session'
import { Flash } from '../../_ui/flash'
import { PageHead } from '../../_ui/shell'
import { Empty, Pill, Table, When } from '../../_ui/table'
import { mergeCustomers } from './actions'

export const dynamic = 'force-dynamic'

/** How many recent customer accounts are compared. */
const SCAN = 5_000

/**
 * عملاء مكررون محتملون — accounts that are probably the same person. Staff
 * see the list; only an admin can merge, and a merge moves everything to the
 * account kept without deleting any order.
 */
export default async function DuplicatesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requireCapability('customers.read')
  const { t } = await getAdminI18n()
  const params = await searchParams
  const mayMerge = can(session.role, 'customers.merge')

  const people = await db
    .select({
      id: users.id,
      email: users.email,
      phone: users.phone,
      name: users.name,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(and(eq(users.role, 'customer'), isNull(users.deletedAt), isNull(users.mergedIntoUserId)))
    .orderBy(desc(users.createdAt))
    .limit(SCAN)

  const groups = findDuplicateGroups(people).slice(0, 100)
  const ids = [...new Set(groups.flatMap((group) => group.ids))]
  const orderCounts =
    ids.length === 0
      ? []
      : await db
          .select({ userId: orders.userId, n: sql<number>`count(*)::int` })
          .from(orders)
          .where(inArray(orders.userId, ids))
          .groupBy(orders.userId)
  const ordersOf = new Map(orderCounts.map((row) => [row.userId, row.n]))
  const byId = new Map(people.map((person) => [person.id, person]))

  return (
    <>
      <PageHead title={t('dup.title')} description={t('dup.description')} />
      <Flash searchParams={params} />
      {!mayMerge ? <p className="a-hint">{t('dup.admin_only')}</p> : null}

      {groups.length === 0 ? (
        <Empty>{t('dup.empty')}</Empty>
      ) : (
        groups.map((group) => {
          const members = group.ids
            .map((id) => byId.get(id))
            .filter((person): person is NonNullable<typeof person> => person !== undefined)
          // Suggest keeping the account with the most orders, then the oldest.
          const keep = [...members].sort(
            (a, b) =>
              (ordersOf.get(b.id) ?? 0) - (ordersOf.get(a.id) ?? 0) ||
              a.createdAt.getTime() - b.createdAt.getTime(),
          )[0]
          return (
            <div className="a-card" key={`${group.reason}-${group.ids.join('-')}`}>
              <h2>
                <Pill tone="warn">{t(`dup.reason_${group.reason}`)}</Pill>
              </h2>
              <Table>
                <thead>
                  <tr>
                    <th>{t('dup.account')}</th>
                    <th>{t('common.name')}</th>
                    <th className="num">{t('dup.orders')}</th>
                    <th>{t('dup.created')}</th>
                    {mayMerge ? <th>{t('dup.merge')}</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {members.map((person) => (
                    <tr key={person.id}>
                      <td>
                        <Link href={adminHref(`/customers/${person.id}`)}>
                          {contactLabel(person)}
                        </Link>
                        {keep?.id === person.id ? (
                          <div>
                            <Pill tone="good">{t('dup.suggested_keep')}</Pill>
                          </div>
                        ) : null}
                      </td>
                      <td>{person.name ?? '—'}</td>
                      <td className="num">{ordersOf.get(person.id) ?? 0}</td>
                      <td>
                        <When value={person.createdAt} />
                      </td>
                      {mayMerge ? (
                        <td>
                          {keep && keep.id !== person.id ? (
                            <form action={mergeCustomers}>
                              <input type="hidden" name="keepId" value={keep.id} />
                              <input type="hidden" name="dropId" value={person.id} />
                              <button className="a-btn danger small" type="submit">
                                {t('dup.merge_into', { name: contactLabel(keep) })}
                              </button>
                            </form>
                          ) : (
                            <span className="a-muted">—</span>
                          )}
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </Table>
              {mayMerge ? <p className="a-hint">{t('dup.merge_hint')}</p> : null}
            </div>
          )
        })
      )}
    </>
  )
}
