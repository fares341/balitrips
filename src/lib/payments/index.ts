import { SandboxPaymentProvider } from './sandbox'
import { StripePaymentProvider } from './stripe'
import type { PaymentProvider } from './types'
import { sandboxPaymentsAllowed } from '@/lib/live-mode'

export * from './types'
export { SandboxPaymentProvider } from './sandbox'
export { StripePaymentProvider } from './stripe'

let cached: PaymentProvider | null = null

/**
 * Resolve the configured provider.
 *
 * Adding a real PSP means writing one adapter and adding one case here.
 * Nothing in checkout, orders, refunds or the admin needs to change.
 */
export function getPaymentProvider(): PaymentProvider {
  if (cached) return cached

  const name = process.env.PAYMENT_PROVIDER ?? 'none'

  switch (name) {
    case 'sandbox':
    case 'none': {
      /**
       * Gated on an explicit opt-in, NOT on NODE_ENV.
       *
       * Next inlines `process.env.NODE_ENV` at build time, so a check against
       * it constant-folds: in a standalone production build this branch
       * became an UNCONDITIONAL throw, and the sandbox could not run even
       * locally, because `.next/standalone/server.js` sets NODE_ENV=production
       * before the first line of app code.
       *
       * ALLOW_SANDBOX_PAYMENTS is an ordinary server variable, so it is read
       * at runtime. It also states the intent more honestly: the sandbox runs
       * only where someone deliberately allowed it. Absent, it refuses —
       * which is the behaviour that actually matters on a real server.
       */
      if (!sandboxPaymentsAllowed()) {
        throw new Error(
          'PAYMENT_PROVIDER is not configured for real payments. Set ' +
            'ALLOW_SANDBOX_PAYMENTS=true to use the sandbox, or configure a real ' +
            'provider — otherwise this would take orders that can never be charged.',
        )
      }
      cached = new SandboxPaymentProvider(
        process.env.PAYMENT_WEBHOOK_SECRET ?? 'dev-webhook-secret',
        process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
      )
      return cached
    }

    case 'stripe': {
      const key = process.env.STRIPE_SECRET_KEY
      const secret = process.env.STRIPE_WEBHOOK_SECRET
      if (!key || !secret) {
        throw new Error('PAYMENT_PROVIDER=stripe needs STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET')
      }
      cached = new StripePaymentProvider(key, secret)
      return cached
    }

    default:
      throw new Error(
        `Unknown PAYMENT_PROVIDER "${name}". Implement an adapter in src/lib/payments/ and register it here.`,
      )
  }
}

/** Test seam. */
export function __setPaymentProvider(provider: PaymentProvider | null): void {
  cached = provider
}
