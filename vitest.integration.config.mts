import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

/**
 * Integration suite — runs against a LIVE Postgres.
 *
 * Deliberately a separate config rather than a second project inside
 * `vitest.config.mts`. The default suite is the one that runs on every save
 * and in every pre-commit hook: it must stay pure, fast and runnable with no
 * services at all. These tests need a migrated, seeded database, take
 * seconds rather than milliseconds, and commit real rows — folding them into
 * the fast suite would make "the tests pass" mean something different
 * depending on whether Docker happened to be up.
 *
 *   Fast unit suite:  node vitest.mjs run
 *   This suite:       node vitest.mjs run --config vitest.integration.config.mts
 *
 * `vitest.config.mts` excludes `*.integration.test.ts` so the two never
 * overlap.
 */

/**
 * Environment.
 *
 * The tests exercise modules that read `process.env` at import time — `@/db`
 * throws without `DATABASE_URL`, and the payment provider is chosen from
 * `PAYMENT_PROVIDER` — so the values have to exist before the first import,
 * which is what `test.env` guarantees. `.env.local` is the same file the dev
 * server reads, so the suite cannot drift from a working local setup.
 *
 * Only the keys below are lifted. `NODE_ENV` in particular is NOT copied:
 * Vitest sets it to `test`, and the sandbox payment provider refuses to
 * construct under `production`.
 */
const ENV_KEYS = [
  'DATABASE_URL',
  'PAYMENT_PROVIDER',
  'PAYMENT_WEBHOOK_SECRET',
  'NEXT_PUBLIC_SITE_URL',
  'BETTER_AUTH_SECRET',
  'BETTER_AUTH_URL',
] as const

const FALLBACKS: Record<string, string> = {
  DATABASE_URL: 'postgresql://bali:bali@localhost:5433/bali',
  PAYMENT_PROVIDER: 'sandbox',
  PAYMENT_WEBHOOK_SECRET: 'dev-webhook-secret',
  NEXT_PUBLIC_SITE_URL: 'http://localhost:3000',
  BETTER_AUTH_SECRET: 'integration-test-secret',
  BETTER_AUTH_URL: 'http://localhost:3000',
}

function readEnvFile(path: string): Record<string, string> {
  let text: string
  try {
    text = readFileSync(new URL(path, import.meta.url), 'utf8')
  } catch {
    // No .env.local (CI). The real environment or the fallbacks answer.
    return {}
  }

  const out: Record<string, string> = {}
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (trimmed === '' || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    const value = trimmed.slice(eq + 1).trim()
    out[key] = value.replace(/^(['"])(.*)\1$/, '$2')
  }
  return out
}

function integrationEnv(): Record<string, string> {
  const fromFile = readEnvFile('./.env.local')
  const env: Record<string, string> = {}
  for (const key of ENV_KEYS) {
    // A real environment variable wins, so CI can point the suite at its own
    // database without editing a file.
    const value = process.env[key] ?? fromFile[key] ?? FALLBACKS[key]
    if (value !== undefined) env[key] = value
  }
  return env
}

export default defineConfig({
  test: {
    name: 'integration',
    environment: 'node',
    include: ['src/**/*.integration.test.ts'],
    env: {
      // Same reasoning as the unit suite: a zone that is neither UTC nor Bali,
      // so anything that quietly depends on the host zone fails here. It
      // matters more with a database in the loop, because `date` and `time`
      // columns round-trip through the driver.
      TZ: 'America/New_York',
      ...integrationEnv(),
    },

    /**
     * One process, one file at a time.
     *
     * Every test here shares one Postgres database and several of them assert
     * on absolute row counts and on a vehicle's fleet size. Running files in
     * parallel would let one suite's fixtures change another's answer, and the
     * resulting flake would be blamed on the code under test. The capacity
     * race gets its own connection pool instead, so serial files do not cost
     * it any concurrency.
     */
    pool: 'forks',
    maxForks: 1,
    minForks: 1,
    fileParallelism: false,
    sequence: { concurrent: false },

    /**
     * next-intl's navigation entry has to be transformed rather than handed
     * to Node.
     *
     * It imports `next/navigation` without an extension, and Next ships that
     * as a bare `navigation.js` at its package root with no `exports` map,
     * which Node's strict ESM resolver refuses. Next's own bundler papers over
     * it; outside Next, only Vite can. Inlining puts the module inside Vite's
     * graph, where the alias below applies.
     *
     * The chain that reaches it is production code, not scaffolding:
     * `@/lib/cart` imports `@/lib/auth/session`, which imports the
     * locale-aware `redirect` from `@/i18n/routing`. Scoped to the navigation
     * entry rather than all of next-intl, which is large and mostly
     * irrelevant here.
     */
    server: { deps: { inline: [/next-intl[\\/]dist[\\/].*navigation/] } },

    // A blocked row lock and a cold connection are both slow the first time.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: [
      { find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
      /**
       * next-intl's ESM build imports `next/navigation` without an extension,
       * and Next ships that as a bare `navigation.js` at its package root with
       * no `exports` map — which Node's strict ESM resolver refuses. Next's own
       * bundler papers over it; outside Next, nothing does. The chain that
       * reaches it is real code, not test scaffolding: `@/lib/cart` imports
       * `@/lib/auth/session`, which imports the locale-aware `redirect` from
       * `@/i18n/routing`.
       *
       * An alias rather than `deps.inline`: inlining pulls the whole of
       * next-intl through the transform pipeline and costs seconds per file
       * for one unresolved specifier.
       */
      { find: /^next\/navigation$/, replacement: 'next/navigation.js' },
    ],
  },
})
