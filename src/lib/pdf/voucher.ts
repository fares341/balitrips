/**
 * Booking vouchers.
 *
 * One PDF per order, in the language the customer bought in — the locale
 * frozen into `orders.customer_snapshot`, not whatever the staff member
 * looking at the order happens to be using.
 *
 * Like itinerary documents, this runs in the worker. It shares the
 * `pdf.itinerary` queue rather than getting its own, and that is deliberate:
 * two queues each capped at one concurrent job still allow two Chromium
 * renders at the same time, which is exactly the 3 GiB spike the cap exists
 * to prevent.
 *
 * There is no `order_documents` table, and adding one is not this slice's to
 * do. The object key is therefore derived deterministically from the order id
 * and locale — the key IS the record. Regenerating overwrites in place, which
 * is correct here: unlike an itinerary version, a voucher has no history to
 * preserve, only a current truth.
 */

import { asc, eq } from 'drizzle-orm'

import { db } from '@/db'
import { orderItems, orders } from '@/db/schema'
import type { Locale } from '@/i18n/config'
import { formatInstant, formatPlainDate, toMailLocale, translator } from '@/lib/email/catalogue'
import { pick } from '@/lib/content/localize'
import { formatMoney } from '@/lib/money'
import { presignedGet, uploadPrivate, type PresignedGetOptions } from '@/lib/storage'

import { renderPdf } from './gotenberg'
import { voucherPdfHtml, type VoucherPdfLine } from './templates'
import { BRAND } from './itinerary'

export function voucherObjectKey(orderId: string, locale: Locale): string {
  return `vouchers/${orderId}/${locale}.pdf`
}

export class VoucherError extends Error {
  constructor(
    message: string,
    readonly orderId: string,
  ) {
    super(message)
    this.name = 'VoucherError'
  }
}

export interface GeneratedVoucher {
  orderId: string
  orderNumber: string
  locale: Locale
  objectKey: string
  bytes: number
}

/**
 * Statuses a voucher may be issued for.
 *
 * A `pending` order has not been paid and must never produce a document that
 * looks like proof of purchase — that is a free trip for anyone who can start
 * a checkout.
 */
const VOUCHERABLE = new Set(['paid', 'confirmed', 'partially_refunded'])

export async function generateOrderVoucher(orderId: string): Promise<GeneratedVoucher> {
  const [order] = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      status: orders.status,
      currency: orders.presentmentCurrency,
      totalMinor: orders.totalMinor,
      placedAt: orders.placedAt,
      createdAt: orders.createdAt,
      customer: orders.customerSnapshot,
    })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1)

  if (!order) throw new VoucherError('Order does not exist', orderId)
  if (!VOUCHERABLE.has(order.status)) {
    throw new VoucherError(`Refusing to issue a voucher for a "${order.status}" order`, orderId)
  }

  const lines = await db
    .select({
      nameSnapshot: orderItems.nameSnapshot,
      quantity: orderItems.quantity,
      lineTotalMinor: orderItems.lineTotalMinor,
      travelDate: orderItems.travelDate,
      endDate: orderItems.endDate,
      guests: orderItems.guests,
      vehicleClass: orderItems.vehicleClass,
      fulfilmentStatus: orderItems.fulfilmentStatus,
    })
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId))
    .orderBy(asc(orderItems.createdAt))

  if (lines.length === 0) throw new VoucherError('Order has no lines', orderId)

  const locale = toMailLocale(order.customer?.locale)
  const t = translator(locale)
  const number = new Intl.NumberFormat(locale)
  const placedAt = order.placedAt ?? order.createdAt

  const rows: VoucherPdfLine[] = lines
    // A refunded or cancelled line is no longer redeemable, so it does not
    // belong on a document a driver is asked to honour.
    .filter((line) => line.fulfilmentStatus !== 'refunded' && line.fulfilmentStatus !== 'cancelled')
    .map((line) => {
      const details: string[] = []
      if (line.travelDate !== null) {
        const range =
          line.endDate !== null && line.endDate !== line.travelDate
            ? `${formatPlainDate(line.travelDate, locale)} – ${formatPlainDate(line.endDate, locale)}`
            : formatPlainDate(line.travelDate, locale)
        details.push(`${t('mail_order_travel')}: ${range}`)
      }
      if (line.guests !== null) {
        details.push(`${t('c_guests')}: ${number.format(line.guests)}`)
      }
      if (line.vehicleClass !== null) details.push(line.vehicleClass)

      return {
        name: pick(line.nameSnapshot, locale, order.orderNumber),
        detail: details.length > 0 ? details.join(' · ') : null,
        quantity: number.format(line.quantity),
        amount: formatMoney(line.lineTotalMinor, order.currency, locale),
      }
    })

  if (rows.length === 0) {
    throw new VoucherError('Every line on this order is refunded or cancelled', orderId)
  }

  const html = voucherPdfHtml({
    locale,
    orderNumber: order.orderNumber,
    travellerName: order.customer?.name?.trim() || order.customer?.email || order.orderNumber,
    lines: rows,
    totalLabel: t('c_total'),
    totalAmount: formatMoney(order.totalMinor, order.currency, locale),
    labels: {
      brand: BRAND,
      title: t('pdf_voucher_t'),
      intro: t('pdf_voucher_b'),
      orderNumber: t('cf_order'),
      traveller: t('pdf_traveller'),
      placed: t('mail_order_placed'),
      placedValue: formatInstant(placedAt, locale),
      columnItem: t('mail_col_item'),
      columnQuantity: t('cart_qty'),
      columnAmount: t('cart_total'),
      confidential: t('pdf_confidential'),
    },
  })

  const pdf = await renderPdf({
    html,
    metadata: {
      Title: `${t('pdf_voucher_t')} ${order.orderNumber}`,
      Author: BRAND,
      Creator: BRAND,
    },
  })

  const objectKey = voucherObjectKey(orderId, locale)
  const upload = await uploadPrivate({ key: objectKey, body: pdf, contentType: 'application/pdf' })

  return {
    orderId,
    orderNumber: order.orderNumber,
    locale,
    objectKey,
    bytes: upload.bytes,
  }
}

/**
 * A short-lived download URL for an order's voucher, for the caller that has
 * already established the order belongs to this user.
 *
 * The ownership check is a parameter, not an assumption: pass the signed-in
 * user's id and this refuses to sign anything for an order that is not theirs.
 * `null` is reserved for the admin receipt route, which checks `orders.read`.
 */
export async function presignOrderVoucher(
  orderId: string,
  userId: string | null,
  options: PresignedGetOptions = {},
): Promise<string | null> {
  const [order] = await db
    .select({
      orderNumber: orders.orderNumber,
      userId: orders.userId,
      status: orders.status,
      customer: orders.customerSnapshot,
    })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1)

  // `userId = null` = الإدارة (تُفحص صلاحيتها في المسار نفسه)؛ غير ذلك يجب أن يملك الطلب.
  if (!order || (userId !== null && order.userId !== userId) || !VOUCHERABLE.has(order.status)) {
    return null
  }

  const locale = toMailLocale(order.customer?.locale)

  return presignedGet(voucherObjectKey(orderId, locale), {
    downloadFilename: `${order.orderNumber}.pdf`,
    contentType: 'application/pdf',
    ...options,
  })
}
