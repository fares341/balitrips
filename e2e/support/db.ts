import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import postgres, { type Sql } from 'postgres'

/**
 * Direct database access, for fixture setup and for facts the UI cannot show.
 *
 * Used sparingly and never to *substitute* for a browser assertion. Two jobs
 * only:
 *
 *  1. **Resetting state a test mutates.** Two-factor enrolment is per-account,
 *     and the seeded administrator is shared by every test in `admin.spec.ts`.
 *     A test that mints a pending secret changes which pane the enrolment page
 *     renders, so the next run would assert against a different screen. Reset
 *     makes the suite re-runnable, which is the difference between a test and
 *     a one-shot demo.
 *  2. **Confirming an order really reached `paid`.** The confirmation page is
 *     the customer's evidence and is asserted in the browser; this is the
 *     bank's. Only a signature-verified webhook can move the row, so reading
 *     it proves the whole chain ran rather than that a headline rendered.
 */

const ROOT = resolve(__dirname, '..', '..')

/**
 * The app reads `.env.local` through Next; a plain Node process does not, so
 * the same file is parsed here. A real environment variable always wins, which
 * is how CI points the suite at its own database.
 */
function databaseUrl(): string {
  const fromEnv = process.env.DATABASE_URL
  if (fromEnv !== undefined && fromEnv !== '') return fromEnv

  try {
    const text = readFileSync(resolve(ROOT, '.env.local'), 'utf8')
    for (const line of text.split(/\r?\n/)) {
      if (!line.startsWith('DATABASE_URL=')) continue
      return line.slice('DATABASE_URL='.length).trim()
    }
  } catch {
    // Fall through to the error below — a missing file and a file without the
    // key are the same problem from here.
  }

  throw new Error(
    'DATABASE_URL is not set and .env.local does not define it. The e2e suite ' +
      'needs the same database the application is running against.',
  )
}

let client: Sql | null = null

export function db(): Sql {
  client ??= postgres(databaseUrl(), { max: 2, onnotice: () => {} })
  return client
}

export async function closeDb(): Promise<void> {
  if (client === null) return
  await client.end()
  client = null
}

/**
 * Put an account back to "elevated, but has never enrolled TOTP".
 *
 * That is the state the seeded administrator ships in and the state
 * `admin.spec.ts` asserts against. The verification rows carry the pending
 * challenge markers and recovery codes; the columns carry the enrolment
 * itself. Both have to go.
 */
export async function resetTwoFactor(email: string): Promise<void> {
  const sql = db()

  const rows = await sql<{ id: string }[]>`select id from users where email = ${email}`
  const user = rows[0]
  if (user === undefined) {
    throw new Error(
      `No account for ${email}. The suite expects the seeded administrator to exist — ` +
        'create it with `node scripts/create-admin.mjs` after signing the account up.',
    )
  }

  await sql`
    update users
       set two_factor_enabled = false, two_factor_secret = null
     where id = ${user.id}`

  await sql`
    delete from verifications
     where identifier like ${'two-factor:%' + user.id}
        or identifier like ${'two-factor:recovery:' + user.id}
        or identifier like ${'two-factor:last-step:' + user.id}`
}

/** The order's status, straight from the row a webhook is the only writer of. */
export async function orderStatus(orderNumber: string): Promise<string | null> {
  const sql = db()
  const rows = await sql<
    { status: string }[]
  >`select status from orders where order_number = ${orderNumber}`
  return rows[0]?.status ?? null
}
