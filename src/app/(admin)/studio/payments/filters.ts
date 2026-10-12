import { and, eq, gte, ilike, lt, or, type SQL } from 'drizzle-orm'

import { orders, payments, users } from '@/db/schema'

import { param } from '../../_lib/result'

/** الطرق المعروضة في فلتر الصفحة (الوثيقة 22.7). */
export const PAYMENT_METHOD_FILTERS = [
  'card',
  'apple_pay',
  'google_pay',
  'bank_transfer',
  'manual',
  'link',
] as const

export const PAYMENT_STATUSES = [
  'requires_action',
  'processing',
  'succeeded',
  'failed',
  'cancelled',
  'refunded',
] as const

type Params = Record<string, string | string[] | undefined>

const DAY = /^\d{4}-\d{2}-\d{2}$/

/** فلاتر صفحة المدفوعات — مشتركة بين الجدول وتصدير CSV كي يطابق الملف ما يُرى. */
export function paymentFilters(params: Params) {
  const q = param(params, 'q')
  const rawStatus = param(params, 'status')
  const status = (PAYMENT_STATUSES as readonly string[]).includes(rawStatus ?? '')
    ? rawStatus
    : null
  const provider = param(params, 'provider')
  const rawMethod = param(params, 'method')
  const method = rawMethod && /^[a-z0-9_]{1,32}$/.test(rawMethod) ? rawMethod : null
  const from = param(params, 'from')
  const to = param(params, 'to')

  const filters: SQL[] = []
  if (status) filters.push(eq(payments.status, status))
  if (provider) filters.push(eq(payments.provider, provider.slice(0, 32)))
  if (method) filters.push(eq(payments.method, method))
  if (from && DAY.test(from)) filters.push(gte(payments.createdAt, new Date(`${from}T00:00:00Z`)))
  if (to && DAY.test(to)) {
    const end = new Date(`${to}T00:00:00Z`)
    end.setUTCDate(end.getUTCDate() + 1)
    filters.push(lt(payments.createdAt, end))
  }
  if (q) {
    const like = `%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`
    const match = or(
      ilike(orders.orderNumber, like),
      ilike(users.email, like),
      ilike(payments.providerPaymentId, like),
    )
    if (match) filters.push(match)
  }
  return {
    q,
    status,
    provider,
    method,
    from: from && DAY.test(from) ? from : null,
    to: to && DAY.test(to) ? to : null,
    where: filters.length > 0 ? and(...filters) : undefined,
  }
}
