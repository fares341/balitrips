/**
 * One-time data job (owner, Nov 2026): barber and laundry places were filed
 * under «malls» on the live map (romat, karisma-barber-keluarga,
 * easy-day-laundry-pererenan, bliss-barber-jimbaran, hq-cuts-ink-barber-tattoo,
 * laundry-projects-seminyak…), all showing one laundry photo.
 *
 * Moves map_places whose category is `malls` and whose en/ar/id name — or,
 * when the name says nothing, description — clearly says barber/barbershop/
 * «cuts» or laundry/«dry clean»/«binatu» (`@/lib/map/service-keywords`):
 *   barber  → `barbers`
 *   laundry → a laundry category when one exists (laundry/laundries/
 *             laundromat), else `barbers` (the owner's service category).
 * Only `category_id` changes; one `map_place.recategorize` audit row and one
 * log line per slug. Nothing else is touched.
 *
 * SAFETY (same pattern as replace-activities.ts)
 *  - Runs once: a `site_settings` marker row; afterwards a logged no-op.
 *  - Advisory lock: one runner at a time.
 *  - Never fails the deploy (exit 0; `--strict` exits 1 for tests).
 *  - Runs before `next build` in start-production.sh, so the map place cache
 *    (tag `map-places`) starts empty in the new build; it also expires within
 *    60 s on any running server.
 *
 *   tsx --conditions=react-server scripts/data-jobs/recategorize-services.ts [--dry-run] [--strict]
 */

import { and, eq, inArray, isNull } from 'drizzle-orm'
import postgres from 'postgres'

import { writeAudit } from '@/app/(admin)/_lib/audit'
import type { AdminSession } from '@/app/(admin)/_lib/session'
import { db } from '@/db'
import { categories, mapPlaces, siteSettings } from '@/db/schema'
import { serviceKind } from '@/lib/map/service-keywords'

export const MARKER = 'datajob.recategorize-services-2026-11'
const LOCK_KEY = 2026110502
const LAUNDRY_KEYS = ['laundry', 'laundries', 'laundromat']

const dryRun = process.argv.includes('--dry-run')
const strict = process.argv.includes('--strict')
const log = (...parts: unknown[]) => console.log('[recategorize-services]', ...parts)

const SYSTEM: AdminSession = {
  userId: null as unknown as string,
  email: 'system@data-job',
  name: 'data job: recategorize services',
  role: 'admin',
  sessionId: 'data-job',
  ipAddress: null,
}

async function markerExists(): Promise<boolean> {
  const rows = await db
    .select({ key: siteSettings.key })
    .from(siteSettings)
    .where(eq(siteSettings.key, MARKER))
  return rows.length > 0
}

async function run(): Promise<{ slug: string; to: string }[]> {
  const cats = await db
    .select({ id: categories.id, key: categories.key })
    .from(categories)
    .where(inArray(categories.key, ['malls', 'barbers', ...LAUNDRY_KEYS]))
  const byKey = new Map(cats.map((c) => [c.key, c.id]))
  const malls = byKey.get('malls')
  const barbers = byKey.get('barbers')
  if (!malls || !barbers) {
    log('no `malls` or `barbers` category — nothing to do')
    return []
  }
  const laundryKey = LAUNDRY_KEYS.find((k) => byKey.has(k)) ?? null
  const target = {
    barber: { key: 'barbers', id: barbers },
    laundry: laundryKey
      ? { key: laundryKey, id: byKey.get(laundryKey)! }
      : { key: 'barbers', id: barbers },
  }

  const places = await db
    .select({
      id: mapPlaces.id,
      slug: mapPlaces.slug,
      name: mapPlaces.name,
      description: mapPlaces.description,
    })
    .from(mapPlaces)
    .where(and(eq(mapPlaces.categoryId, malls), isNull(mapPlaces.deletedAt)))

  const moved: { slug: string; to: string }[] = []
  for (const place of places) {
    const kind = serviceKind(place.name, place.description)
    if (!kind) continue
    const to = target[kind]
    log(`${dryRun ? 'would move' : 'move'} ${place.slug}: malls → ${to.key} (${kind})`)
    moved.push({ slug: place.slug, to: to.key })
    if (dryRun) continue
    await db.transaction(async (tx) => {
      await tx
        .update(mapPlaces)
        .set({ categoryId: to.id, updatedAt: new Date() })
        .where(and(eq(mapPlaces.id, place.id), eq(mapPlaces.categoryId, malls)))
      await writeAudit(
        {
          actor: SYSTEM,
          action: 'map_place.recategorize',
          entityType: 'map_place',
          entityId: place.id,
          before: { category: 'malls' },
          after: { category: to.key },
        },
        tx,
      )
    })
  }
  return moved
}

async function main(): Promise<number> {
  if (await markerExists()) {
    log(`already done (${MARKER}) — nothing to do`)
    return 0
  }
  const lockConn = postgres(process.env.DATABASE_URL ?? '', { max: 1 })
  const [lock] = await lockConn<{ ok: boolean }[]>`select pg_try_advisory_lock(${LOCK_KEY}) as ok`
  if (!lock?.ok) {
    log('another run holds the lock — skipping')
    await lockConn.end()
    return 0
  }
  try {
    if (await markerExists()) return 0
    log(dryRun ? 'DRY RUN — nothing is written' : 'starting')
    const moved = await run()
    if (dryRun) return 0
    await db
      .insert(siteSettings)
      .values({ key: MARKER, value: { doneAt: new Date().toISOString(), moved } })
    log(`done: moved ${moved.length}`)
    return 0
  } finally {
    await lockConn`select pg_advisory_unlock(${LOCK_KEY})`
    await lockConn.end()
  }
}

main()
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    console.error('[recategorize-services] FAILED:', error instanceof Error ? error.message : error)
    process.exit(strict ? 1 : 0)
  })
