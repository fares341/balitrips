/**
 * Worker configuration, and the startup check that refuses a bad one.
 *
 * IMPORT ORDER MATTERS, for the same reason it matters in `./env` — and the
 * ordering here is not a style preference, it is the whole point of the file
 * existing separately from `index.ts`.
 *
 * `@/db` throws at MODULE SCOPE when `DATABASE_URL` is unset. Anything that
 * reaches it — `@/lib/pdf`, every handler — therefore throws while its import
 * is being evaluated, before a single statement in the entry file runs. A
 * check written inside `main()` is dead code: the process has already died
 * with `Error: DATABASE_URL is not set` and a stack trace pointing at a
 * postgres client, which tells an operator nothing about which variable to
 * set or which queue just stopped working.
 *
 * So the check runs as an import side effect, from a module that imports
 * nothing but `./queues` (pg-boss and zod, no database), and `index.ts`
 * imports it SECOND — after `./env`, which supplies the values, and before
 * everything else, which consumes them.
 */

import { QUEUES } from './queues'

/* --------------------------------------------------------------------------
   Typed environment readers
   -------------------------------------------------------------------------- */

export function intFromEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name]
  if (raw === undefined || raw.trim() === '') return fallback

  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    console.warn(`[worker] ignoring ${name}="${raw}"; expected an integer in [${min}, ${max}]`)
    return fallback
  }
  return parsed
}

export function boolFromEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase()
  if (raw === undefined || raw === '') return fallback
  return raw === '1' || raw === 'true' || raw === 'yes'
}

/**
 * How long in-flight jobs get to finish after a signal.
 *
 * Thirty seconds by default. A container runtime allows ten before SIGKILL
 * unless the operator raises it, so docker-compose and the systemd unit both
 * declare a matching grace period. A cold PDF render can legitimately outlive
 * this; it is failed back to the queue and retried rather than waited for
 * indefinitely, because a deploy that hangs for a quarter of an hour is its
 * own outage.
 */
export const SHUTDOWN_TIMEOUT_MS = intFromEnv('WORKER_SHUTDOWN_TIMEOUT_MS', 30_000, 1_000, 900_000)

/** Mail is small and network-bound, so a few at a time costs nothing. */
export const EMAIL_CONCURRENCY = intFromEnv('WORKER_EMAIL_CONCURRENCY', 4, 1, 32)

export const RUN_SCHEDULES = boolFromEnv('WORKER_SCHEDULES', true)

/**
 * Treat a missing deploy-time variable as fatal rather than a warning.
 *
 * Always on in production. Off in development, because a contributor should
 * be able to run `pnpm worker` against the local database without Spaces
 * credentials or a Gotenberg sidecar — and be told exactly which queues will
 * fail if they try to use them.
 */
export const STRICT_ENV =
  process.env.NODE_ENV === 'production' || boolFromEnv('WORKER_STRICT_ENV', false)

/* --------------------------------------------------------------------------
   Requirements
   -------------------------------------------------------------------------- */

interface Requirement {
  /** All of these must be set for the requirement to be satisfied. */
  vars: readonly string[]
  /** What breaks without it, in the operator's language. */
  purpose: string
  affects: string
}

/** Without these there is no worker at all. Fatal in every environment. */
const CORE_REQUIREMENTS: readonly Requirement[] = [
  {
    vars: ['DATABASE_URL'],
    purpose: 'the job queue and every handler read and write Postgres',
    affects: 'the whole worker',
  },
]

/**
 * Needed by a real deployment, not by a laptop.
 *
 * Every one of these is a SILENT failure when it is missing in production,
 * which is why they are listed rather than left to the first job to discover.
 * `RESEND_API_KEY` is the sharpest: without it `sendEmail` falls back to the
 * console transport and reports `delivered: true`, so every confirmation
 * "sends" successfully and none of them arrive.
 */
const DEPLOY_REQUIREMENTS: readonly Requirement[] = [
  {
    vars: ['NEXT_PUBLIC_SITE_URL'],
    purpose: 'absolute, locale-correct links in mail and PDFs',
    affects: `${QUEUES.email}, ${QUEUES.pdf}`,
  },
  {
    vars: ['RESEND_API_KEY', 'EMAIL_FROM'],
    purpose: 'actually delivering mail — without it messages are only printed',
    affects: QUEUES.email,
  },
  {
    vars: ['GOTENBERG_URL'],
    purpose: 'the Chromium sidecar that renders every PDF',
    affects: QUEUES.pdf,
  },
  {
    vars: [
      'SPACES_REGION',
      'SPACES_ENDPOINT',
      'SPACES_KEY',
      'SPACES_SECRET',
      'SPACES_PRIVATE_BUCKET',
      'SPACES_PUBLIC_BUCKET',
    ],
    purpose: 'storing rendered PDFs; a render with nowhere to put the bytes is wasted',
    affects: QUEUES.pdf,
  },
  {
    vars: ['PAYMENT_PROVIDER'],
    purpose: 'asking the PSP what actually settled',
    affects: QUEUES.reconcile,
  },
]

function missingVars(requirement: Requirement): string[] {
  return requirement.vars.filter((name) => {
    const value = process.env[name]
    return value === undefined || value.trim() === ''
  })
}

function describe(requirement: Requirement, missing: readonly string[]): string {
  return [
    `  ${missing.join(', ')}`,
    `      needed for: ${requirement.purpose}`,
    `      affects:    ${requirement.affects}`,
  ].join('\n')
}

/**
 * Exit before touching the database, or say what will be degraded.
 * Returns the queues known to be non-functional, for the startup diagnostics.
 */
function checkEnvironment(): ReadonlySet<string> {
  const fatal: string[] = []
  const degraded: string[] = []
  const brokenQueues = new Set<string>()

  for (const requirement of CORE_REQUIREMENTS) {
    const missing = missingVars(requirement)
    if (missing.length > 0) fatal.push(describe(requirement, missing))
  }

  for (const requirement of DEPLOY_REQUIREMENTS) {
    const missing = missingVars(requirement)
    if (missing.length === 0) continue

    if (STRICT_ENV) {
      fatal.push(describe(requirement, missing))
    } else {
      degraded.push(describe(requirement, missing))
      brokenQueues.add(requirement.affects)
    }
  }

  if (fatal.length > 0) {
    console.error(
      `[worker] refusing to start: ${fatal.length} required setting(s) missing.\n\n` +
        `${fatal.join('\n\n')}\n\n` +
        "Set them in .env.local (see .env.example) or in the droplet's environment file." +
        (STRICT_ENV
          ? '\nStrict checking is on because NODE_ENV=production or WORKER_STRICT_ENV=true.'
          : ''),
    )
    process.exit(1)
  }

  if (degraded.length > 0) {
    console.warn(
      `[worker] starting with ${degraded.length} unset setting(s). Jobs on the affected ` +
        `queues will fail when they run:\n\n${degraded.join('\n\n')}`,
    )
  }

  return brokenQueues
}

/** Evaluated on import — see the note at the top of this file. */
export const DEGRADED_QUEUES = checkEnvironment()
