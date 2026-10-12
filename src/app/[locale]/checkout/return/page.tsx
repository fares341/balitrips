/**
 * Where the payment provider sends the customer back to.
 *
 * The return URL has to be built *before* `checkout()` allocates an order
 * number, so it cannot name the order. It carries the idempotency key
 * instead — the one identifier this side already knows — and this page trades
 * it for the order it created and forwards to the real confirmation URL.
 *
 * That indirection is what makes the confirmation page addressable: the
 * handoff's "done" screen was a boolean in component state with no order
 * identity at all, so it vanished on any navigation and could never be
 * reopened, bookmarked or sent to support.
 *
 * The customer arriving here proves nothing about the payment — providers
 * deliver the success event before the browser returns, and sometimes the
 * browser never returns at all. Status comes from the webhook; this page only
 * routes.
 */

import { eq } from 'drizzle-orm'
import { notFound, redirect } from 'next/navigation'

import { db } from '@/db'
import { orders, payments } from '@/db/schema'
import { getPathname } from '@/i18n/routing'

import { toLocale } from '../../_seo-hreflang'
import { CART_RETURN_HREF, CONFIRMATION_HREF } from '../constants'

export const dynamic = 'force-dynamic'

type PageParams = Promise<{ locale: string }>
type PageSearch = Promise<Record<string, string | string[] | undefined>>

function firstParam(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value
  return raw === undefined || raw === '' ? null : raw
}

export default async function CheckoutReturnPage({
  params,
  searchParams,
}: {
  params: PageParams
  searchParams: PageSearch
}) {
  const { locale: raw } = await params
  const locale = toLocale(raw)
  const key = firstParam((await searchParams).k)

  if (key === null) redirect(getPathname({ href: CART_RETURN_HREF, locale }))

  const rows = await db
    .select({ orderNumber: orders.orderNumber })
    .from(payments)
    .innerJoin(orders, eq(orders.id, payments.orderId))
    .where(eq(payments.idempotencyKey, key))
    .limit(1)

  const order = rows[0]
  // A key that names no payment is a malformed or replayed return; there is
  // no order to show and inventing one would be worse than a 404.
  if (!order) notFound()

  redirect(getPathname({ href: `${CONFIRMATION_HREF}/${order.orderNumber}`, locale }))
}
