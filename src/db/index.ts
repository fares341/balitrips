import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import * as schema from './schema'

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  throw new Error('DATABASE_URL is not set')
}

/**
 * Connection pool.
 *
 * Kept small deliberately: Postgres shares 4 GiB with Next and the worker,
 * and each backend costs memory. A large pool buys nothing on 2 vCPU and
 * makes an OOM more likely.
 */
const client = postgres(connectionString, {
  max: process.env.NODE_ENV === 'production' ? 10 : 5,
  idle_timeout: 20,
  connect_timeout: 10,
})

export const db = drizzle(client, { schema })

export type Database = typeof db
export * as schema from './schema'
