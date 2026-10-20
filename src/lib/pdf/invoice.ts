/**
 * Invoices (phase 4).
 *
 * One PDF per paid order, numbered BT-INV-YYYY-NNNNN (`orders.invoice_number`,
 * issued in the payment transaction — see `src/lib/finance/paid.ts`). Built
 * like the voucher: the worker renders it through the same single-Chromium
 * queue, the object key is derived from the order and locale, and the seller
 * block comes from Studio → Configuration (empty fields are left off).
 *
 * Unlike a voucher an invoice does not change: it is rendered once and kept.
 * A refund does not rewrite it — the refund has its own notice.
 */

import { and, asc, eq } from 'drizzle-orm'

import { db } from '@/db'
import { auditLog, orderItems, orders } from '@/db/schema'
import type { Locale } from '@/i18n/config'
import { readSetting } from '@/app/(admin)/_lib/settings'
import { formatInstant, formatPlainDate, toMailLocale, translator } from '@/lib/email/catalogue'
import { pick } from '@/lib/content/localize'
import { adjustmentLabel, adjustmentSign } from '@/lib/finance/labels'
import { formatMoney } from '@/lib/money'
import {
  presignedGet,
  readPrivateObject,
  uploadPrivate,
  type PresignedGetOptions,
} from '@/lib/storage'

import { renderPdf } from './gotenberg'
import { BRAND } from './itinerary'
import { invoicePdfHtml, type VoucherPdfLine } from './templates'
import { adjustmentWords } from './voucher'

export function invoiceObjectKey(orderId: string, locale: Locale): string {
  return `invoices/${orderId}/${locale}.pdf`
}

export class InvoiceError extends Error {
  constructor(
    message: string,
    readonly orderId: string,
  ) {
    super(message)
    this.name = 'InvoiceError'
  }
}

/** An invoice exists for an order once it has been paid — whatever happened after. */
const INVOICEABLE = new Set(['paid', 'confirmed', 'partially_refunded', 'refunded'])

export interface GeneratedInvoice {
  orderId: string
  invoiceNumber: string
  locale: Locale
  objectKey: string
  bytes: number
}

export async function generateOrderInvoice(orderId: string): Promise<GeneratedInvoice> {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1)
  if (!order) throw new InvoiceError('Order does not exist', orderId)
  if (order.invoiceNumber === null || !INVOICEABLE.has(order.status)) {
    throw new InvoiceError(`No invoice for a "${order.status}" order without a number`, orderId)
  }

  const lines = await db
    .select({
      nameSnapshot: orderItems.nameSnapshot,
      quantity: orderItems.quantity,
      lineTotalMinor: orderItems.lineTotalMinor,
      travelDate: orderItems.travelDate,
      endDate: orderItems.endDate,
      guests: orderItems.guests,
    })
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId))
    .orderBy(asc(orderItems.createdAt))

  const locale = toMailLocale(order.customerSnapshot?.locale)
  const t = translator(locale)
  const number = new Intl.NumberFormat(locale)
  const currency = order.presentmentCurrency
  const money = (minor: number) => formatMoney(minor, currency, locale)
  const seller = await readSetting('seller')

  const rows: VoucherPdfLine[] = lines
    // Free lines (saved places, included activities) add nothing to an invoice.
    .filter((line) => line.lineTotalMinor > 0)
    .map((line) => {
      const details: string[] = []
      if (line.travelDate !== null) {
        const range =
          line.endDate !== null && line.endDate !== line.travelDate
            ? `${formatPlainDate(line.travelDate, locale)} – ${formatPlainDate(line.endDate, locale)}`
            : formatPlainDate(line.travelDate, locale)
        details.push(`${t('mail_order_travel')}: ${range}`)
      }
      if (line.guests !== null) details.push(`${t('c_guests')}: ${number.format(line.guests)}`)
      return {
        name: pick(line.nameSnapshot, locale, order.orderNumber),
        detail: details.length > 0 ? details.join(' · ') : null,
        quantity: number.format(line.quantity),
        amount: money(line.lineTotalMinor),
      }
    })

  const customer = order.customerSnapshot
  const html = invoicePdfHtml({
    locale,
    invoiceNumber: order.invoiceNumber,
    orderNumber: order.orderNumber,
    issuedValue: formatInstant(order.invoicedAt ?? order.updatedAt, locale),
    seller: [
      seller.businessName || BRAND,
      seller.address,
      seller.taxId === '' ? '' : `${t('pdf_tax_id')}: ${seller.taxId}`,
      seller.email,
      seller.phone,
    ].filter((line) => line.trim() !== ''),
    buyer: [
      customer?.name ?? '',
      customer?.email ?? '',
      customer?.phone ?? '',
      customer?.country ?? '',
    ]
      .map((line) => line.trim())
      .filter((line) => line !== ''),
    lines: rows,
    subtotal: { label: t('pdf_subtotal'), amount: money(order.subtotalMinor) },
    adjustments: (order.adjustments ?? []).map((line) => ({
      label: adjustmentLabel(line, locale, adjustmentWords(t)),
      amount: `${adjustmentSign(line)}${money(line.amountMinor)}`,
    })),
    total: { label: t('c_total'), amount: money(order.totalMinor) },
    labels: {
      brand: seller.businessName || BRAND,
      title: t('pdf_invoice_t'),
      invoiceNumber: t('pdf_invoice_no'),
      orderNumber: t('cf_order'),
      issued: t('pdf_invoice_date'),
      seller: t('pdf_seller'),
      buyer: t('pdf_bill_to'),
      columnItem: t('mail_col_item'),
      columnQuantity: t('cart_qty'),
      columnAmount: t('cart_total'),
      paidNote: t('pdf_invoice_paid'),
    },
  })

  const pdf = await renderPdf({
    html,
    metadata: {
      Title: `${t('pdf_invoice_t')} ${order.invoiceNumber}`,
      Author: seller.businessName || BRAND,
      Creator: BRAND,
    },
  })
  const objectKey = invoiceObjectKey(orderId, locale)
  const upload = await uploadPrivate({ key: objectKey, body: pdf, contentType: 'application/pdf' })
  return { orderId, invoiceNumber: order.invoiceNumber, locale, objectKey, bytes: upload.bytes }
}

/**
 * Where an order's invoice lives, for a caller entitled to it: pass the
 * signed-in customer's id (must own the order) or null from the Studio
 * (which checks `orders.read` itself).
 */
async function invoiceTarget(
  orderId: string,
  userId: string | null,
): Promise<{ key: string; filename: string } | null> {
  const [order] = await db
    .select({
      userId: orders.userId,
      status: orders.status,
      invoiceNumber: orders.invoiceNumber,
      customer: orders.customerSnapshot,
    })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1)
  if (
    !order ||
    order.invoiceNumber === null ||
    (userId !== null && order.userId !== userId) ||
    !INVOICEABLE.has(order.status)
  ) {
    return null
  }
  const locale = toMailLocale(order.customer?.locale)
  return { key: invoiceObjectKey(orderId, locale), filename: `${order.invoiceNumber}.pdf` }
}

/** Whether the worker has rendered this order's invoice (`pdf.invoice` in the audit log). */
export async function invoiceRendered(orderId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: auditLog.id })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.action, 'pdf.invoice'),
        eq(auditLog.entityType, 'order'),
        eq(auditLog.entityId, orderId),
      ),
    )
    .limit(1)
  return row !== undefined
}

/** Whether the order has an invoice number this caller may download (rendered or not). */
export async function invoiceAvailable(orderId: string, userId: string | null): Promise<boolean> {
  return (await invoiceTarget(orderId, userId)) !== null
}

export async function presignOrderInvoice(
  orderId: string,
  userId: string | null,
  options: PresignedGetOptions = {},
): Promise<string | null> {
  const target = await invoiceTarget(orderId, userId)
  if (target === null) return null
  return presignedGet(target.key, {
    downloadFilename: target.filename,
    contentType: 'application/pdf',
    ...options,
  })
}

export async function loadOrderInvoice(
  orderId: string,
  userId: string | null,
): Promise<{ bytes: Uint8Array; filename: string } | null> {
  const target = await invoiceTarget(orderId, userId)
  if (target === null) return null
  const bytes = await readPrivateObject(target.key)
  return bytes === null ? null : { bytes, filename: target.filename }
}
