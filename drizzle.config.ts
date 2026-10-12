import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    // 5433 matches docker-compose: the default 5432 commonly collides with
    // a developer's native Postgres, and a silent collision means running
    // migrations against the wrong database.
    url: process.env.DATABASE_URL ?? 'postgresql://bali:bali@localhost:5433/bali',
  },
  // Payload owns its own tables in a separate `cms` schema and manages them
  // with its own migrations. Restricting drizzle-kit to `public` stops the
  // two migration systems from fighting over each other's tables.
  schemaFilter: ['public'],
  verbose: true,
  strict: true,
})
