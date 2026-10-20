import { and, asc, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm'

import { STUDIO_ROLES } from '@/lib/auth/roles'
import { db } from '@/db'
import { entitlements, orders, users } from '@/db/schema'

import { computeStage, type CrmStage } from './stage'

/** Orders that count as bought. */
const PAID = ['paid', 'confirmed', 'partially_refunded']

/** The stage of each of these customers, from their paid orders and VIP access. */
export async function loadStages(
  people: readonly { id: string; crmStage: string | null }[],
  now: Date = new Date(),
): Promise<Map<string, CrmStage>> {
  const ids = people.map((person) => person.id)
  if (ids.length === 0) return new Map()
  const [paid, vip] = await Promise.all([
    db
      .select({
        userId: orders.userId,
        count: sql<number>`count(*)::int`,
        first: sql<Date>`min(coalesce(${orders.placedAt}, ${orders.createdAt}))`,
        last: sql<Date>`max(coalesce(${orders.placedAt}, ${orders.createdAt}))`,
      })
      .from(orders)
      .where(and(inArray(orders.userId, ids), inArray(orders.status, PAID)))
      .groupBy(orders.userId),
    db
      .select({ userId: entitlements.userId })
      .from(entitlements)
      .where(
        and(
          inArray(entitlements.userId, ids),
          eq(entitlements.kind, 'vip'),
          isNull(entitlements.revokedAt),
        ),
      ),
  ])
  const paidBy = new Map(paid.map((row) => [row.userId, row]))
  const vipSet = new Set(vip.map((row) => row.userId))
  return new Map(
    people.map((person) => {
      const row = paidBy.get(person.id)
      return [
        person.id,
        computeStage(
          {
            manual: person.crmStage,
            paidOrders: row?.count ?? 0,
            firstPaidAt: row ? new Date(row.first) : null,
            lastPaidAt: row ? new Date(row.last) : null,
            hasVip: vipSet.has(person.id),
          },
          now,
        ),
      ]
    }),
  )
}

/** Everyone who can open the Studio, for "assigned to" pickers. */
export async function loadStaff(): Promise<{ id: string; label: string }[]> {
  const rows = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(and(inArray(users.role, [...STUDIO_ROLES]), isNull(users.deletedAt)))
    .orderBy(asc(users.name), asc(users.email))
  return rows.map((row) => ({ id: row.id, label: row.name?.trim() || row.email }))
}

/**
 * Smart lists for the customer list (and its export):
 *   itinerary_no_activity — bought a trip plan, never an activity
 *   itinerary_no_vip      — bought a trip plan, has no VIP map access
 */
export const SMART_LISTS = ['itinerary_no_activity', 'itinerary_no_vip'] as const
export type SmartList = (typeof SMART_LISTS)[number]

export function isSmartList(value: unknown): value is SmartList {
  return typeof value === 'string' && (SMART_LISTS as readonly string[]).includes(value)
}

const BOUGHT = (kinds: readonly string[]) =>
  sql`exists (select 1 from order_items i join orders o on o.id = i.order_id
    where o.user_id = ${users.id} and o.status in ('paid', 'confirmed', 'partially_refunded')
    and i.kind in (${sql.join(
      kinds.map((kind) => sql`${kind}`),
      sql`, `,
    )}) and i.refunded_minor < i.line_total_minor)`

export function smartListWhere(list: SmartList): SQL {
  switch (list) {
    case 'itinerary_no_activity':
      return sql`${BOUGHT(['itinerary'])} and not ${BOUGHT(['activity', 'activity_tier'])}`
    case 'itinerary_no_vip':
      return sql`${BOUGHT(['itinerary'])} and not exists (select 1 from entitlements e
        where e.user_id = ${users.id} and e.kind = 'vip' and e.revoked_at is null)`
  }
}
