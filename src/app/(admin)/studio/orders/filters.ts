import { and, eq, gte, ilike, lte, or, sql, type SQL } from 'drizzle-orm'

import { orders, users } from '@/db/schema'

import { param } from '../../_lib/result'
import { ORDER_STATUSES } from '@/lib/orders/state'

type Params = Record<string, string | string[] | undefined>

/**
 * Order list filters — shared by the page and its CSV export so the file
 * holds exactly what the list shows. The query joins `users` (left) for the
 * account e-mail.
 */
export function orderFilters(params: Params) {
  const q = param(params, 'q')
  const status = param(params, 'status')
  const from = param(params, 'from')
  const to = param(params, 'to')

  const filters: SQL[] = []

  if (q) {
    const like = `%${q}%`
    const match = or(
      ilike(orders.orderNumber, like),
      ilike(users.email, like),
      sql`${orders.customerSnapshot} ->> 'email' ilike ${like}`,
      sql`${orders.customerSnapshot} ->> 'name' ilike ${like}`,
    )
    if (match) filters.push(match)
  }
  if (status && (ORDER_STATUSES as readonly string[]).includes(status)) {
    filters.push(eq(orders.status, status))
  }
  if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) {
    filters.push(gte(orders.createdAt, new Date(`${from}T00:00:00Z`)))
  }
  if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) {
    filters.push(lte(orders.createdAt, new Date(`${to}T23:59:59Z`)))
  }

  const where = filters.length > 0 ? and(...filters) : undefined
  return { q, status, from, to, where }
}
