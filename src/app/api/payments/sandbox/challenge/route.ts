/**
 * Sandbox 3-D Secure stand-in.
 *
 * `SandboxPaymentProvider.createIntent` always returns `requires_action` with
 * a redirect here, deliberately: every rail this business will want requires a
 * step-up, so the code path that handles one is exercised in development
 * rather than discovered in production.
 *
 * This is the other half of that. It renders the bank's page, and on a
 * decision it signs a webhook with the same HMAC the adapter verifies and
 * POSTs it to `/api/payments/webhook` before sending the customer back — so
 * the whole flow (intent, challenge, webhook-driven confirmation, replay
 * protection, the confirmation page's poll) is exercisable end to end with no
 * real PSP and no card.
 *
 * Confirmation deliberately arrives only by webhook, never from the redirect,
 * because that is what real providers do. Approving and then closing the tab
 * before the redirect still confirms the order.
 *
 * NEVER available in production: `getPaymentProvider()` refuses to construct
 * the sandbox adapter there, and this route 404s on its own account so a
 * misconfiguration cannot leave a "click here to mark yourself paid" endpoint
 * on the internet.
 *
 * The copy here is developer-facing and intentionally untranslated — it is a
 * test harness standing in for a bank's own page, not part of the product.
 */

import { createHmac, randomUUID } from 'node:crypto'

import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { db } from '@/db'
import { payments } from '@/db/schema'
import { bookingsOpen } from '@/lib/bookings-open'
import { minorUnitExponent } from '@/lib/money'
import { sandboxPaymentsAllowed } from '@/lib/live-mode'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/+$/, '')
const WEBHOOK_SECRET = process.env.PAYMENT_WEBHOOK_SECRET ?? 'dev-webhook-secret'

/** Never in production, whatever the environment thinks it is configured as. */
function forbiddenInProduction(): Response | null {
  // Runtime gate, not NODE_ENV: Next inlines NODE_ENV at build time, so this
  // constant-folded into an unconditional 404 and the 3-D Secure stand-in did
  // not exist in any standalone build, including local ones.
  if (!sandboxPaymentsAllowed()) {
    return new NextResponse('Not found', { status: 404 })
  }

  // Second, independent gate. This route signs a webhook with the same HMAC
  // the adapter verifies, so while it is reachable it is a public "mark my own
  // booking as paid" endpoint. The sandbox flag alone was not enough: the
  // public site runs with it on so that the checkout code path exists at all.
  if (!bookingsOpen()) {
    return new NextResponse('Not found', { status: 404 })
  }

  return null
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Only ever send the customer back to our own origin.
 *
 * A `return` parameter taken on trust is an open redirect, and an open
 * redirect on a payment return URL is a phishing primitive — the victim
 * arrives from a genuine bank page.
 */
function safeReturnUrl(raw: string | null): string {
  if (raw === null || raw === '') return `${SITE_URL}/cart`
  try {
    const candidate = new URL(raw, SITE_URL)
    const site = new URL(SITE_URL)
    if (candidate.origin !== site.origin) return `${SITE_URL}/cart`
    return candidate.toString()
  } catch {
    return `${SITE_URL}/cart`
  }
}

export async function GET(request: Request): Promise<Response> {
  const blocked = forbiddenInProduction()
  if (blocked) return blocked

  const url = new URL(request.url)
  const intent = url.searchParams.get('intent') ?? ''
  const returnUrl = safeReturnUrl(url.searchParams.get('return'))

  if (intent === '') {
    return new NextResponse('Missing intent', { status: 400 })
  }

  const rows = await db
    .select({ amountMinor: payments.amountMinor, currency: payments.currency })
    .from(payments)
    .where(eq(payments.providerPaymentId, intent))
    .limit(1)

  const payment = rows[0]
  // Even in a test harness the exponent comes from the currency: dividing by
  // 100 is how a Kuwaiti dinar gets shown ten times too small.
  const amountLabel =
    payment === undefined
      ? 'unknown amount'
      : `${payment.currency} ${(
          payment.amountMinor /
          10 ** minorUnitExponent(payment.currency)
        ).toFixed(minorUnitExponent(payment.currency))} (minor: ${payment.amountMinor})`

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Sandbox 3-D Secure</title>
<style>
  :root { color-scheme: light; }
  body { margin:0; min-height:100vh; display:grid; place-items:center;
         font-family: ui-sans-serif, system-ui, sans-serif; background:#f4f1ec; color:#1d2a24; }
  .card { background:#fff; border:1px solid #e2ddd4; border-radius:20px; padding:28px;
          max-width:420px; width:calc(100% - 32px); box-shadow:0 8px 30px rgba(0,0,0,.06); }
  h1 { font-size:20px; margin:0 0 6px; }
  p { font-size:14px; line-height:1.6; color:#5d6b63; margin:0 0 8px; }
  dl { display:grid; grid-template-columns:auto 1fr; gap:4px 12px; font-size:13px; margin:16px 0 22px; }
  dt { color:#5d6b63; } dd { margin:0; font-weight:700; overflow-wrap:anywhere; }
  .row { display:flex; gap:10px; flex-wrap:wrap; }
  button { flex:1; min-height:46px; border-radius:12px; border:0; font-size:15px; font-weight:700;
           cursor:pointer; font-family:inherit; }
  .ok { background:#1f6f4f; color:#fff; }
  .no { background:#fff; color:#1d2a24; border:1px solid #e2ddd4; }
  .warn { font-size:12px; color:#a2571f; margin-top:18px; }
</style>
</head>
<body>
  <main class="card">
    <h1>Sandbox 3-D Secure</h1>
    <p>This stands in for the bank's step-up page. Choosing an outcome signs a webhook
       and delivers it to the application, exactly as a real provider would.</p>
    <dl>
      <dt>Payment</dt><dd>${escapeHtml(intent)}</dd>
      <dt>Amount</dt><dd>${escapeHtml(amountLabel)}</dd>
    </dl>
    <form method="post" class="row">
      <input type="hidden" name="intent" value="${escapeHtml(intent)}">
      <input type="hidden" name="return" value="${escapeHtml(returnUrl)}">
      <button class="ok" type="submit" name="decision" value="approve">Approve</button>
      <button class="no" type="submit" name="decision" value="decline">Decline</button>
    </form>
    <p class="warn">Development only. This route does not exist in production.</p>
  </main>
</body>
</html>`

  return new NextResponse(html, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  })
}

export async function POST(request: Request): Promise<Response> {
  const blocked = forbiddenInProduction()
  if (blocked) return blocked

  const form = await request.formData()
  const intent = String(form.get('intent') ?? '')
  const decision = String(form.get('decision') ?? 'decline')
  const returnUrl = safeReturnUrl(String(form.get('return') ?? ''))

  if (intent === '') return new NextResponse('Missing intent', { status: 400 })

  const rows = await db
    .select({ amountMinor: payments.amountMinor, currency: payments.currency })
    .from(payments)
    .where(eq(payments.providerPaymentId, intent))
    .limit(1)

  const payment = rows[0]

  const body = JSON.stringify({
    // A fresh event id every time, so re-approving the same intent exercises
    // the duplicate path only when the provider genuinely replays — which is
    // what `webhook_events` is indexed for.
    id: `evt_${randomUUID()}`,
    type: decision === 'approve' ? 'payment.succeeded' : 'payment.failed',
    paymentId: intent,
    amountMinor: payment?.amountMinor ?? null,
    currency: payment?.currency ?? null,
  })

  const signature = createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex')

  try {
    // A real HTTP round trip rather than calling the handler directly: the
    // point is to exercise signature verification and the route itself.
    const response = await fetch(`${SITE_URL}/api/payments/webhook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-sandbox-signature': signature },
      body,
      cache: 'no-store',
    })
    if (!response.ok) {
      console.error('[sandbox/challenge] webhook rejected the event', {
        status: response.status,
        intent,
      })
    }
  } catch (error) {
    // The customer is still sent back; the order simply stays `pending` and
    // the confirmation page keeps polling, which is exactly what happens when
    // a real provider's delivery is delayed.
    console.error('[sandbox/challenge] could not deliver the webhook', { intent, error })
  }

  // 303 so the browser follows with GET and the POST is not re-submitted on
  // a back navigation.
  return NextResponse.redirect(returnUrl, 303)
}
