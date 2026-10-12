import { test as base, expect } from '@playwright/test'

/**
 * Every test is a different customer, on a different network.
 *
 * ## Why this exists
 *
 * `src/lib/auth/server.ts` throttles credential endpoints hard and, unusually
 * and correctly, leaves the throttle **enabled outside production** so the
 * same code path runs everywhere:
 *
 *     '/sign-up/email':  5 per hour
 *     '/sign-in/email':  5 per 5 minutes
 *
 * The bucket key is the caller's IP. A test suite that registers a fresh
 * account per test — which is the only way to keep tests independent — runs
 * out of budget on the sixth test and stays locked out for an hour. Worse, the
 * failures would look like broken auth rather than a working rate limiter, and
 * the temptation would be to "fix" it by loosening the product's limits. That
 * would trade a real security control for a green report.
 *
 * So each test presents its own client address instead. Twelve tests are
 * twelve people in twelve places, which is a more faithful model of production
 * traffic than twelve sign-ups from one office NAT.
 *
 * ## What this depends on, and why it is worth knowing
 *
 * It works because `advanced.ipAddress.ipAddressHeaders` is `['x-forwarded-for']`
 * and Better Auth takes that header at face value. In the deployed topology
 * Caddy terminates TLS and overwrites the header, so a client cannot choose its
 * own bucket. Nothing enforces that here: the standalone server is spoken to
 * directly, so the header is whatever the client says.
 *
 * That is a real weakness of this deployment shape rather than a convenience —
 * see `throttling.spec.ts`, which pins a single address and asserts the limiter
 * genuinely engages. If the reverse proxy is ever bypassed (a directly exposed
 * container port, a health check that skips it, a second ingress), credential
 * stuffing gets an unlimited number of buckets for the price of one header.
 */

/** Deterministic per test, so a rerun of one test reuses its own bucket. */
function addressFor(seed: string): string {
  let hash = 2166136261
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  const unsigned = hash >>> 0
  // 10.0.0.0/8 — private space, unmistakably synthetic in any log.
  return `10.${(unsigned >> 16) & 0xff}.${(unsigned >> 8) & 0xff}.${unsigned & 0xff || 1}`
}

export const test = base.extend({
  /*
   * The second argument is Playwright's fixture callback. It is named `provide`
   * rather than the conventional `use` because eslint's react-hooks plugin
   * matches on the identifier and reports a bare `use(...)` as an illegally
   * placed React hook. Playwright passes it positionally, so the name is free.
   */
  extraHTTPHeaders: async ({ extraHTTPHeaders }, provide, testInfo) => {
    await provide({
      ...extraHTTPHeaders,
      'x-forwarded-for': addressFor(`${testInfo.project.name}:${testInfo.titlePath.join('>')}`),
    })
  },
})

export { expect }
