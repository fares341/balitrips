import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

/**
 * Migration runner.
 *
 * Uses its own single connection with max: 1 rather than the app pool:
 * migrations must run strictly in order on one session, and the pool would
 * happily spread them across backends.
 */
async function main() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set')
  }

  const client = postgres(connectionString, { max: 1 })
  const db = drizzle(client)

  console.log('Running migrations…')
  await migrate(db, { migrationsFolder: './drizzle' })
  console.log('Migrations complete.')

  await client.end()
}

main().catch((error) => {
  console.error('Migration failed:', error)
  process.exit(1)
})
