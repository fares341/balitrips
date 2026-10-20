/**
 * Database facts for the assistant end-to-end check (CI only). Prints JSON.
 *
 *   tsx scripts/assistant-check-db.ts locked   → names/slugs of places an anonymous
 *                                                visitor must never see
 *   tsx scripts/assistant-check-db.ts audit    → assistant.execute audit rows
 *   tsx scripts/assistant-check-db.ts actions  → proposed actions by kind and status
 *   tsx scripts/assistant-check-db.ts water    → the water check on a land and a sea point
 */

import { desc, eq, or } from 'drizzle-orm'

import { db } from '@/db'
import { assistantActions, auditLog, mapPlaces } from '@/db/schema'
import { isInWater } from '@/lib/geo/water'

async function main() {
  const what = process.argv[2]
  if (what === 'locked') {
    const rows = await db
      .select({
        slug: mapPlaces.slug,
        name: mapPlaces.name,
        isFree: mapPlaces.isFree,
        gem: mapPlaces.isHiddenGem,
      })
      .from(mapPlaces)
      .where(or(eq(mapPlaces.isFree, false), eq(mapPlaces.isHiddenGem, true)))
    console.log(
      JSON.stringify(rows.map((row) => ({ slug: row.slug, names: Object.values(row.name ?? {}) }))),
    )
  } else if (what === 'audit') {
    const rows = await db
      .select({
        action: auditLog.action,
        entityType: auditLog.entityType,
        after: auditLog.after,
        at: auditLog.createdAt,
      })
      .from(auditLog)
      .orderBy(desc(auditLog.createdAt))
      .limit(20)
    console.log(JSON.stringify(rows))
  } else if (what === 'actions') {
    const rows = await db
      .select({
        kind: assistantActions.kind,
        status: assistantActions.status,
        result: assistantActions.result,
      })
      .from(assistantActions)
      .orderBy(desc(assistantActions.createdAt))
      .limit(20)
    console.log(JSON.stringify(rows))
  } else if (what === 'water') {
    // The server-side water check against the real map data: Ubud (land), Badung Strait (sea).
    const land = await isInWater(-8.5069, 115.2625)
    const sea = await isInWater(-8.75, 115.4)
    console.log(JSON.stringify({ land, sea }))
  } else {
    console.error('usage: locked | audit | actions | water')
    process.exitCode = 2
  }
  process.exit()
}

void main()
