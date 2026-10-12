/**
 * Promote an existing user to staff or admin.
 *
 * The FIRST elevated account must be created out of band. There is
 * deliberately no self-service path — no "become admin" page, no invite
 * token that grants elevation, no first-run wizard that hands the role to
 * whoever loads the site first. Every one of those is a privilege-escalation
 * vector that ships to production and stays there.
 *
 * This runs on the box, against DATABASE_URL, by someone who already has
 * shell access. Anyone who can run it could edit the database directly, so
 * it grants nothing they did not already have.
 *
 * Usage:
 *   node scripts/create-admin.mjs someone@example.com
 *   node scripts/create-admin.mjs someone@example.com --role staff
 *   node scripts/create-admin.mjs someone@example.com --demote
 *   node scripts/create-admin.mjs --list
 *
 * The account must already exist — sign up through the normal flow first.
 * Creating a credentialed account here would mean hashing a password with a
 * second implementation of whatever Better Auth is configured to use, and
 * two password paths that can drift apart is worse than one manual step.
 */

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import postgres from 'postgres'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const ROLES = ['customer', 'staff', 'admin']

function fail(message) {
  console.error(`\n  ${message}\n`)
  process.exit(1)
}

/**
 * Minimal .env reader.
 *
 * The script is run with plain `node`, not through Next, so nothing has
 * loaded .env.local yet. A real env var always wins over the file.
 */
function loadEnvFile(name) {
  try {
    const text = readFileSync(resolve(root, name), 'utf8')
    for (const line of text.split('\n')) {
      const trimmed = line.trim()
      if (trimmed === '' || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq === -1) continue
      const key = trimmed.slice(0, eq).trim()
      if (process.env[key] !== undefined) continue
      let value = trimmed.slice(eq + 1).trim()
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      process.env[key] = value
    }
  } catch {
    // Absent file is fine — the variable may come from the environment.
  }
}

function parseArgs(argv) {
  const options = { email: null, role: 'admin', list: false, demote: false, force: false }

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]
    if (arg === '--list') options.list = true
    else if (arg === '--demote') options.demote = true
    else if (arg === '--force') options.force = true
    else if (arg === '--role') {
      const value = argv[++index]
      if (!value) fail('--role needs a value: customer, staff or admin')
      options.role = value
    } else if (arg.startsWith('--role=')) {
      options.role = arg.slice('--role='.length)
    } else if (arg.startsWith('--')) {
      fail(`Unknown option "${arg}"`)
    } else if (options.email === null) {
      options.email = arg
    } else {
      fail(`Unexpected argument "${arg}"`)
    }
  }

  if (options.demote) options.role = 'customer'
  return options
}

async function main() {
  loadEnvFile('.env.local')
  loadEnvFile('.env')

  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    fail('DATABASE_URL is not set. Export it, or put it in .env.local.')
  }

  const options = parseArgs(process.argv.slice(2))

  if (!ROLES.includes(options.role)) {
    fail(`Role must be one of: ${ROLES.join(', ')}`)
  }

  // One connection, short timeouts: this is a CLI, not a server.
  const sql = postgres(connectionString, { max: 1, idle_timeout: 5, connect_timeout: 10 })

  try {
    if (options.list) {
      const rows = await sql`
        select email, role, two_factor_enabled, created_at
        from users
        where role <> 'customer' and deleted_at is null
        order by role desc, email asc
      `

      if (rows.length === 0) {
        console.log('\n  No elevated accounts exist yet.\n')
        return
      }

      console.log('\n  Elevated accounts\n')
      for (const row of rows) {
        const twoFactor = row.two_factor_enabled ? '2FA on' : '2FA OFF'
        console.log(`    ${row.role.padEnd(6)}  ${row.email.padEnd(40)}  ${twoFactor}`)
      }
      console.log('')
      return
    }

    if (!options.email) {
      fail('Usage: node scripts/create-admin.mjs <email> [--role admin|staff] [--demote] [--list]')
    }

    const email = options.email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      fail(`"${options.email}" is not an email address`)

    const [user] = await sql`
      select id, email, name, role, two_factor_enabled
      from users
      where lower(email) = ${email} and deleted_at is null
      limit 1
    `

    if (!user) {
      fail(
        `No account for ${email}.\n  Sign up through the normal flow first, then run this again.\n  This script deliberately cannot create credentials.`,
      )
    }

    if (user.role === options.role) {
      console.log(`\n  ${email} is already "${options.role}". Nothing to do.\n`)
      return
    }

    // Demoting the last admin locks everyone out of the tool that grants
    // roles, which is only recoverable by running this script again — but
    // only if someone still has shell access. Refuse unless forced.
    if (user.role === 'admin' && options.role !== 'admin') {
      const [{ count }] = await sql`
        select count(*)::int as count from users where role = 'admin' and deleted_at is null
      `
      if (count <= 1 && !options.force) {
        fail(
          `${email} is the only admin. Promote someone else first, or pass --force if you really mean it.`,
        )
      }
    }

    const before = user.role

    await sql.begin(async (tx) => {
      await tx`update users set role = ${options.role}, updated_at = now() where id = ${user.id}`

      // Sessions are rows, not stateless tokens, precisely so a role change
      // takes effect immediately. Dropping them forces a fresh sign-in —
      // which is also where two-factor is enforced for elevated roles.
      await tx`delete from sessions where user_id = ${user.id}`

      // The role change is itself an auditable event. actor_id is null:
      // this ran on the box, not through the admin, and inventing an actor
      // would be worse than recording that it was out of band.
      await tx`
        insert into audit_log (actor_id, action, entity_type, entity_id, "before", "after", ip_address)
        values (
          null,
          'user.role_change',
          'user',
          ${user.id},
          ${JSON.stringify({ role: before })}::jsonb,
          ${JSON.stringify({ role: options.role, via: 'scripts/create-admin.mjs' })}::jsonb,
          'cli'
        )
      `
    })

    console.log(`\n  ${email}: ${before} -> ${options.role}`)
    console.log('  Existing sessions were revoked; they must sign in again.')

    if (options.role !== 'customer' && !user.two_factor_enabled) {
      console.log(
        '\n  WARNING: two-factor is not enabled on this account.\n' +
          '  It is mandatory for staff and admin and is enforced at login.\n' +
          '  Enrol it at the next sign-in.',
      )
    }

    const basePath = process.env.ADMIN_BASE_PATH ?? '/studio-8f2a'
    if (options.role !== 'customer') {
      console.log(`\n  The admin is at ${basePath} (from ADMIN_BASE_PATH).\n`)
    } else {
      console.log('')
    }
  } finally {
    await sql.end({ timeout: 5 })
  }
}

main().catch((error) => {
  console.error(`\n  ${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
})
