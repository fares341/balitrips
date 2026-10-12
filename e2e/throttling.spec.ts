import { expect, test } from '@playwright/test'

/**
 * The credential throttle, from one fixed address.
 *
 * This spec deliberately does NOT use the `support/fixtures` test object. Every
 * other spec gives each test its own `x-forwarded-for` so that twelve tests
 * model twelve customers rather than one machine hammering the sign-in form —
 * see the long comment in that file. The cost of that convenience is that
 * nothing would notice if the rate limiter stopped working, so this pays it
 * back: one pinned address, repeated bad passwords, and an assertion that the
 * limiter engages.
 *
 * `src/lib/auth/server.ts` sets `/sign-in/email` to 5 attempts per 5 minutes
 * and — unusually and correctly — leaves `rateLimit.enabled` true outside
 * production, so this is the same code path that runs on the droplet.
 */

/** Fixed, and used by nothing else, so the bucket is this test's alone. */
const CALLER = '10.99.99.7'

test('repeated sign-in attempts from one address are throttled', async ({ playwright }) => {
  const api = await playwright.request.newContext({
    baseURL: 'http://localhost:3200',
    extraHTTPHeaders: { 'x-forwarded-for': CALLER },
  })

  const statuses: number[] = []

  try {
    // The configured ceiling is 5 in 5 minutes; 8 attempts must cross it.
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const response = await api.post('/api/auth/sign-in/email', {
        headers: { origin: 'http://localhost:3200' },
        data: {
          email: 'nobody-here@balitrips.test',
          password: `wrong-password-${attempt}`,
        },
        failOnStatusCode: false,
      })
      statuses.push(response.status())
      if (response.status() === 429) break
    }
  } finally {
    await api.dispose()
  }

  expect(
    statuses,
    `eight bad sign-ins from ${CALLER} were never throttled (statuses: ${statuses.join(', ')}). ` +
      'Credential stuffing is unmetered.',
  ).toContain(429)
})

/**
 * The other half of the same question, and the reason the shared fixture works
 * at all: the address the limiter buckets on is taken from a request header.
 *
 * In the deployed topology Caddy overwrites `x-forwarded-for`, so a client
 * cannot pick its own bucket. Nothing in the application enforces that — there
 * is no trusted-proxy list — so this test documents the actual behaviour rather
 * than asserting it is safe. It passes today; if a future change starts
 * ignoring the header for untrusted peers, this test failing is the signal that
 * the shared fixture needs replacing, not that something broke.
 */
test('the rate-limit bucket follows the x-forwarded-for header', async ({ playwright }) => {
  const exhausted = await playwright.request.newContext({
    baseURL: 'http://localhost:3200',
    extraHTTPHeaders: { 'x-forwarded-for': '10.99.99.8' },
  })

  try {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const response = await exhausted.post('/api/auth/sign-in/email', {
        headers: { origin: 'http://localhost:3200' },
        data: { email: 'nobody-here@balitrips.test', password: `wrong-${attempt}` },
        failOnStatusCode: false,
      })
      if (response.status() === 429) break
    }
  } finally {
    await exhausted.dispose()
  }

  const fresh = await playwright.request.newContext({
    baseURL: 'http://localhost:3200',
    extraHTTPHeaders: { 'x-forwarded-for': '10.99.99.9' },
  })

  try {
    const response = await fresh.post('/api/auth/sign-in/email', {
      headers: { origin: 'http://localhost:3200' },
      data: { email: 'nobody-here@balitrips.test', password: 'wrong-again' },
      failOnStatusCode: false,
    })

    // 401 (bad credentials), not 429: a different declared address is a
    // different bucket. This is what the other specs rely on — and what an
    // attacker gets for free if the reverse proxy is ever bypassed.
    expect(
      response.status(),
      'a second declared address inherited the first one’s exhausted bucket',
    ).not.toBe(429)
  } finally {
    await fresh.dispose()
  }
})
