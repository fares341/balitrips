/**
 * Sending the invoice PDF to the customer after payment — the WhatsApp
 * «payment» message (as a DOCUMENT header) and the `order_confirmation`
 * e-mail (as an attachment).
 *
 * TIMING. The invoice number is issued in the payment transaction, but the
 * PDF is rendered afterwards by the worker (`pdf.invoice`, one Chromium at a
 * time — see `src/worker/queues.ts`). So at payment time the PDF usually does
 * not exist yet. Both senders therefore WAIT for it: each check that finds it
 * missing re-queues itself `INVOICE_POLL_SECONDS` later (and makes sure the
 * render is queued), up to `INVOICE_WAIT_MS` after the payment. After that
 * they give up on the file and send without it — a customer must never wait
 * on Chromium for their payment confirmation.
 *
 * `invoiceStep` is the pure decision; the rest reads the database/storage.
 */

import { and, eq } from 'drizzle-orm'

import { db } from '@/db'
import { auditLog, orders } from '@/db/schema'
import { fallbackLocale, isLocale, type Locale } from '@/i18n/config'
import { readPrivateObject } from '@/lib/storage'

/** How long a sender waits for the PDF after the payment. */
export const INVOICE_WAIT_MS = 10 * 60 * 1000
/** Gap between two checks while waiting. */
export const INVOICE_POLL_SECONDS = 15
/** WhatsApp (Mazbot) header document limit: 5 MB. Meta allows more; one limit for both. */
export const WHATSAPP_DOCUMENT_MAX_BYTES = 5 * 1024 * 1024
/** E-mail attachment cap (Resend allows 40 MB per message after base64). */
export const EMAIL_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024

/** Same window and key as the reconcile sweep and the paid-order paperwork. */
export { INVOICE_THROTTLE_SECONDS, invoiceKey as invoiceJobKey } from '@/lib/orders/paid-paperwork'

/** The file name the customer sees: `Bali-Trips-Invoice-BT-INV-2026-00042.pdf`. */
export function invoiceFilename(invoiceNumber: string): string {
  const safe = invoiceNumber.replace(/[^A-Za-z0-9-]/g, '-')
  return `Bali-Trips-Invoice-${safe}.pdf`
}

/** An invoice exists for an order once it has been paid (mirrors `./invoice.ts`). */
const INVOICEABLE = new Set(['paid', 'confirmed', 'partially_refunded', 'refunded'])

export interface InvoiceState {
  /** The order has (or will have) an invoice: a number and a paid status. */
  expected: boolean
  invoiceNumber: string | null
  /** The worker has rendered it (`pdf.invoice` audit row). */
  rendered: boolean
  /** Size recorded at render time, when known. */
  bytes: number | null
}

export type InvoiceStep =
  /** Load the file and send it. */
  | { action: 'attach' }
  /** Not rendered yet: check again later. */
  | { action: 'wait'; afterSeconds: number }
  /** Send without the file (`reason` is logged). */
  | { action: 'without'; reason: 'no_invoice' | 'timeout' | 'too_large' }

/**
 * What a sender does now. `since` is when the wait started (the payment
 * message row's creation, or the order's `invoiced_at`).
 */
export function invoiceStep(
  state: InvoiceState,
  since: Date,
  now: Date,
  maxBytes: number,
): InvoiceStep {
  if (!state.expected) return { action: 'without', reason: 'no_invoice' }
  if (state.rendered) {
    if (state.bytes !== null && state.bytes > maxBytes) {
      return { action: 'without', reason: 'too_large' }
    }
    return { action: 'attach' }
  }
  if (now.getTime() - since.getTime() < INVOICE_WAIT_MS) {
    return { action: 'wait', afterSeconds: INVOICE_POLL_SECONDS }
  }
  return { action: 'without', reason: 'timeout' }
}

export async function readInvoiceState(
  orderId: string,
): Promise<InvoiceState & { invoicedAt: Date | null }> {
  const [order] = await db
    .select({
      status: orders.status,
      invoiceNumber: orders.invoiceNumber,
      invoicedAt: orders.invoicedAt,
    })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1)
  if (!order || order.invoiceNumber === null || !INVOICEABLE.has(order.status)) {
    return { expected: false, invoiceNumber: null, rendered: false, bytes: null, invoicedAt: null }
  }
  const [audit] = await db
    .select({ after: auditLog.after })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.action, 'pdf.invoice'),
        eq(auditLog.entityType, 'order'),
        eq(auditLog.entityId, orderId),
      ),
    )
    .limit(1)
  const recorded = (audit?.after as { bytes?: unknown } | null | undefined)?.bytes
  return {
    expected: true,
    invoiceNumber: order.invoiceNumber,
    rendered: audit !== undefined,
    bytes: typeof recorded === 'number' ? recorded : null,
    invoicedAt: order.invoicedAt,
  }
}

export interface InvoiceFile {
  bytes: Uint8Array
  filename: string
  invoiceNumber: string
}

/** Where an order's invoice PDF is stored (`./invoice.ts` re-exports it). */
export function invoiceObjectKey(orderId: string, locale: Locale): string {
  return `invoices/${orderId}/${locale}.pdf`
}

/**
 * The rendered PDF, or null (missing in storage, or over `maxBytes`). Reads
 * storage directly rather than through `./invoice.ts`, which drags the PDF
 * templates and the mail catalogue into every importer of the dispatcher.
 */
export async function loadInvoiceFile(
  orderId: string,
  maxBytes: number,
): Promise<InvoiceFile | null> {
  const [order] = await db
    .select({ invoiceNumber: orders.invoiceNumber, customer: orders.customerSnapshot })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1)
  if (!order?.invoiceNumber) return null
  const raw = order.customer?.locale
  const locale: Locale = typeof raw === 'string' && isLocale(raw) ? raw : fallbackLocale
  const bytes = await readPrivateObject(invoiceObjectKey(orderId, locale))
  if (bytes === null || bytes.byteLength === 0 || bytes.byteLength > maxBytes) return null
  return {
    bytes,
    filename: invoiceFilename(order.invoiceNumber),
    invoiceNumber: order.invoiceNumber,
  }
}

/**
 * Make sure the render is queued (throttled with the sweep's key; the handler
 * skips a done one). The web producer; the worker passes its own enqueuer.
 */
export async function ensureInvoiceRender(
  orderId: string,
  enqueue?: (orderId: string) => Promise<unknown>,
): Promise<void> {
  try {
    if (enqueue) {
      await enqueue(orderId)
      return
    }
    const { enqueueInvoicePdf } = await import('@/worker/queues')
    await enqueueInvoicePdf(orderId, { throttled: true })
  } catch (error) {
    console.error('[invoice] could not queue the render', { orderId, error })
  }
}
