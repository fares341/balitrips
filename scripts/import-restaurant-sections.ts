/**
 * Import the contractor «restaurant sections» CSV (owner, Nov 2026): which
 * map places belong to which of the 11 restaurant sections (migration 0054).
 * Run inside the production worker container:
 *
 *   node_modules/.bin/tsx scripts/import-restaurant-sections.ts --file=/data/restaurant-categories.csv \
 *     [--apply] [--include-unsure] [--replace]
 *
 * Dry run by default (reads the DB, writes nothing). Adds memberships for
 * matched slugs; `--replace` also removes section memberships the CSV does
 * not list, for the places it lists. `NEW` rows (places to add to the map
 * first) and unknown slugs are only reported. Idempotent: a re-run adds
 * nothing. The public map cache refreshes within 60 s.
 */

import { readFileSync } from 'node:fs'

import { and, eq, inArray, isNotNull, isNull } from 'drizzle-orm'

import { db } from '@/db'
import { auditLog, categories, mapPlaces, mapPlaceSubcategories } from '@/db/schema'
import { planSections, readSectionCsv } from '@/lib/map/section-import'
import { RESTAURANTS_KEY } from '@/lib/map/sections'

const argv = process.argv.slice(2)
const flag = (name: string) => argv.includes(`--${name}`)
const value = (name: string) => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)

async function main(): Promise<number> {
  const file = value('file')
  if (!file) {
    console.error(
      'usage: --file=/data/restaurant-categories.csv [--apply] [--include-unsure] [--replace]',
    )
    return 2
  }
  const apply = flag('apply')
  const { rows, problems } = readSectionCsv(readFileSync(file, 'utf8'))
  for (const p of problems) console.warn(`line ${p.line}: ${p.message}`)

  const [parent] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.key, RESTAURANTS_KEY))
    .limit(1)
  const sectionRows = parent
    ? await db
        .select({ id: categories.id, key: categories.key })
        .from(categories)
        .where(and(eq(categories.parentId, parent.id), isNotNull(categories.parentId)))
    : []
  const placeRows = await db
    .select({ id: mapPlaces.id, slug: mapPlaces.slug })
    .from(mapPlaces)
    .where(isNull(mapPlaces.deletedAt))
  const sectionIds = sectionRows.map((one) => one.id)
  const existingRows =
    sectionIds.length === 0
      ? []
      : await db
          .select()
          .from(mapPlaceSubcategories)
          .where(inArray(mapPlaceSubcategories.categoryId, sectionIds))

  const plan = planSections({
    rows,
    places: new Map(placeRows.map((one) => [one.slug, one.id])),
    sections: new Map(sectionRows.map((one) => [one.key, one.id])),
    existing: new Set(existingRows.map((one) => `${one.placeId}|${one.categoryId}`)),
    includeUnsure: flag('include-unsure'),
    replace: flag('replace'),
  })

  console.log(`rows: ${rows.length} read, ${problems.length} invalid`)
  console.log(
    `memberships: +${plan.add.length} to add, -${plan.remove.length} to remove, ${plan.kept} already there`,
  )
  for (const one of plan.add) console.log(`  + ${one.slug} → ${one.sectionKey}`)
  for (const one of plan.remove) console.log(`  - ${one.slug} → ${one.sectionKey}`)
  if (plan.missingSections.length > 0)
    console.log(`missing sections (run migration 0054): ${plan.missingSections.join(', ')}`)
  console.log(`NEW places to add first: ${plan.newPlaces.length}`)
  for (const r of plan.newPlaces)
    console.log(`  line ${r.line}: [${r.section}] ${r.placeName} ${r.mapsLink}`)
  console.log(`unknown slugs: ${plan.unknownSlugs.length}`)
  for (const r of plan.unknownSlugs) console.log(`  line ${r.line}: «${r.slug}» (${r.placeName})`)
  console.log(`unsure skipped (use --include-unsure): ${plan.skippedUnsure.length}`)
  for (const r of plan.skippedUnsure) console.log(`  line ${r.line}: ${r.placeName} → ${r.slug}`)

  if (!apply) {
    console.log('dry run — nothing written (add --apply)')
    return 0
  }
  await db.transaction(async (tx) => {
    if (plan.add.length > 0) {
      await tx
        .insert(mapPlaceSubcategories)
        .values(plan.add.map(({ placeId, categoryId }) => ({ placeId, categoryId })))
        .onConflictDoNothing()
    }
    for (const one of plan.remove) {
      await tx
        .delete(mapPlaceSubcategories)
        .where(
          and(
            eq(mapPlaceSubcategories.placeId, one.placeId),
            eq(mapPlaceSubcategories.categoryId, one.categoryId),
          ),
        )
    }
    if (plan.add.length + plan.remove.length > 0) {
      await tx.insert(auditLog).values({
        actorId: null,
        action: 'place.sections_import',
        entityType: 'map_place',
        entityId: null,
        before: null,
        after: {
          added: plan.add.map((one) => `${one.slug}:${one.sectionKey}`),
          removed: plan.remove.map((one) => `${one.slug}:${one.sectionKey}`),
        },
      })
    }
  })
  console.log('applied')
  return 0
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
