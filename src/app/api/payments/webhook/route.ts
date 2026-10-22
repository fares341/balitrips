/**
 * Payment webhook.
 *
 * This endpoint is what actually confirms an order. Not the customer's
 * redirect — providers deliver the success event before the browser returns,
 * out of order, and repeatedly, and some customers close the tab and never
 * come back at all.
 *
 * Three rules, and each one has a cost attached to getting it wrong:
 *
 *  1. **Verify first, parse second.** `parseWebhook` throws on a bad
 *     signature. An unverified webhook is an unauthenticated request to change
 *     order state, which is as sensitive as this system gets — so the body is
 *     read as raw text and handed to the adapter untouched. `request.json()`
 *     would re-serialise it and break the HMAC over the exact bytes.
 *
 *  2. **A duplicate is a 200.** Replay is the *normal* case, not an error:
 *     `processWebhookEvent` claims the event on a unique index and reports
 *     `duplicate`. Answering anything outside 2xx tells the provider to retry,
 *     and it will — with exponential patience that still adds up to being
 *     hammered for a delivery that already succeeded. The same goes for an
 *     event that names no order of ours, an informational event, and a late
 *     event the state machine refuses: all handled, all 200.
 *
 *  3. **A genuine fault IS a 500.** Retries exist for exactly this: the
 *     database was unreachable for a moment. Swallowing that into a 200 would
 *     lose a payment confirmation permanently and leave a paid order sitting
 *     in `pending` forever. So unexpected exceptions — and only those — return
 *     500, deliberately.
 *
 * The cart is emptied here rather than at order creation. A declined card
 * would otherwise leave the traveller with a failed order and an empty trip
 * and nothing to retry; the cart is spent only once money has arrived.
 */

import { eq } from 'drizzle-orm'
import { after, NextResponse } from 'next/server'

import { db } from '@/db'
import { cartItems, orders } from '@/db/schema'
import { clearCartForUser } from '@/lib/cart'
import { recordPaymentMethod } from '@/lib/orders/payment-method'
import { processWebhookEvent } from '@/lib/orders/webhook'
import { recordError } from '@/lib/monitoring/errors'
import { getPaymentProvider } from '@/lib/payments'
import { notifyOrderAuthorized, notifyOrderPaid, notifyPaymentFailed } from '@/lib/notify/orders'

export const dynamic = 'force-dynamic'
/** node:crypto and Postgres: this cannot run on the edge. */
export const runtime = 'nodejs'

export async function POST(request: Request): Promise<Response> {
  const provider = getPaymentProvider()

  // Raw bytes, exactly as sent. The signature covers these and nothing else.
  const rawBody = await request.text()

  const headers: Record<string, string> = {}
  request.headers.forEach((value, key) => {
    headers[key] = value
  })

  let event
  try {
    event = await provider.parseWebhook(rawBody, headers)
  } catch {
    // 401, not 500: the provider must not retry a request we will never
    // accept, and the reason is never echoed back to an unauthenticated
    // caller probing for one.
    return NextResponse.json({ error: 'invalid_signature' }, { status: 401 })
  }

  try {
    const outcome = await processWebhookEvent(provider.name, event)

    // `from !== to`: دفعة ثانية على طلب مدفوع (دُفع بتحويل ثم بالبطاقة) تُسجَّل
    // لكن لا تُفرغ سلة العميل الحالية ولا تعيد إشعار "تم الدفع".
    if (outcome.handled && outcome.to === 'paid' && outcome.from !== outcome.to) {
      // Best effort, and deliberately outside the state transaction: a cart
      // that fails to empty must never roll back a confirmed payment.
      await releaseCartFor(outcome.orderId)
      await notifyOrderPaid(outcome.orderId)
    }
    // Manual capture (client, Oct 2026): the card is held, the checkout is
    // done — empty the cart and ask staff to confirm with the supplier.
    if (outcome.handled && outcome.to === 'authorized' && outcome.from !== outcome.to) {
      await releaseCartFor(outcome.orderId)
      await notifyOrderAuthorized(outcome.orderId)
    }
    // A failed attempt leaves the order open for a retry on the same order
    // number (see processWebhookEvent); staff still hear about it.
    if (
      outcome.handled &&
      (outcome.paymentFailed === true || (outcome.to === 'cancelled' && outcome.from === 'pending'))
    ) {
      await notifyPaymentFailed(outcome.orderId)
    }

    // الوثيقة 22.7: طريقة الدفع (بطاقة / Apple Pay / Google Pay…). بعد إرسال الرد،
    // بأفضل جهد — لا يؤخّر الـ webhook ولا يفشله. يشمل دفعة ثانية على طلب مدفوع.
    // A replayed delivery (`duplicate`) already scheduled this once.
    const fresh = outcome.handled || outcome.reason === 'no_transition'
    if (fresh && event.type === 'payment.succeeded' && event.providerPaymentId !== null) {
      const providerPaymentId = event.providerPaymentId
      after(() => recordPaymentMethod(provider, providerPaymentId))
    }

    return NextResponse.json(
      outcome.handled
        ? { received: true, orderId: outcome.orderId, status: outcome.to }
        : { received: true, ignored: outcome.reason },
      { status: 200 },
    )
  } catch (error) {
    console.error('[payments/webhook] processing failed', {
      provider: provider.name,
      eventId: event.providerEventId,
      type: event.type,
      error,
    })
    // Phase 6: counted for the payment alert (src/worker/handlers/monitor.ts).
    await recordError(error, {
      source: 'route',
      path: '/api/payments/webhook',
      details: { area: 'payment_webhook', provider: provider.name, type: event.type },
    })
    // Retry, please. See rule 3 above.
    return NextResponse.json({ error: 'processing_failed' }, { status: 500 })
  }
}

async function releaseCartFor(orderId: string): Promise<void> {
  try {
    const rows = await db
      .select({ userId: orders.userId, sourceCartId: orders.sourceCartId })
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1)

    const userId = rows[0]?.userId
    const sourceCartId = rows[0]?.sourceCartId ?? null
    if (userId) await clearCartForUser(userId)
    // Guest checkout: no account to find the cart by, so the order carries it.
    else if (sourceCartId !== null) {
      await db.delete(cartItems).where(eq(cartItems.cartId, sourceCartId))
    }
  } catch (error) {
    console.error('[payments/webhook] could not empty the cart', { orderId, error })
  }
}

/**
 * Some providers verify an endpoint with a GET before sending to it. A 405
 * on that probe reads as a broken endpoint, so answer plainly.
 */
export function GET(): Response {
  return NextResponse.json({ status: 'ok' }, { status: 200 })
}
