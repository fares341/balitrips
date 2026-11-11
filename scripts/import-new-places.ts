/**
 * CREATE new free map places (mosques, hospital, markets, malls) from a
 * researcher's folder. Run inside the production worker container:
 *
 *   node_modules/.bin/tsx scripts/import-new-places.ts --dir=/data \
 *     [--apply] [--only=slug,slug] [--limit=N] [--pause-ms=1500] [--overwrite] \
 *     [--suffix-conflicts] [--report=/tmp/import-report.csv]
 *
 * Folder: places.csv + images/<slug>/<slug>-N.webp (-1 = cover). Dry run by
 * default (reads the DB, validates every row and image, writes nothing).
 *
 * Per row:
 *   - invalid (category, name_en, lat/lon outside Bali …) → skipped with reason;
 *   - an existing place within 120 m with a similar name (any category) →
 *     "matched": only empty description locales and missing photos are
 *     filled (--overwrite replaces them);
 *   - slug taken by another place → "conflict", skipped unless
 *     --suffix-conflicts (then created under a suffixed slug);
 *   - otherwise → "new": inserted published like a Studio-created place,
 *     region from `area` or the region circle containing the point, then
 *     syncPlaceAccess() sets is_free from the category.
 * Images go through ingestImage() (the Studio uploader pipeline) with one
 * libvips thread and no cache; deterministic media ids, so re-runs reuse.
 */

import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'

import { and, eq, inArray, isNull, sql } from 'drizzle-orm'

import { inspectImage } from '@/app/(admin)/_lib/image/inspect'
import { ingestImage, MAX_UPLOAD_BYTES } from '@/app/(admin)/_lib/image/pipeline'
import { db } from '@/db'
import { auditLog, categories, mapPlaces, media, regions, type Localized } from '@/db/schema'
import { syncPlaceAccess } from '@/lib/content/map-access'
import {
  NEW_PLACE_CATEGORIES,
  csvCell,
  findExisting,
  internalNotesFor,
  mergeLocalized,
  parsePlacesCsv,
  pickPlaceImages,
  regionFor,
  suffixedSlug,
  type ExistingPlace,
  type FolderImage,
  type NewPlaceRow,
} from '@/lib/place-content/new-places'
import { attributionFor, importMediaId } from '@/lib/place-content/plan'

const argv = process.argv.slice(2)
const flag = (name: string) => argv.includes(`--${name}`)
const value = (name: string) => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)

const dir = value('dir')
const apply = flag('apply')
const overwrite = flag('overwrite')
const suffixConflicts = flag('suffix-conflicts')
const reportPath = value('report')
const only = value('only')
  ?.split(',')
  .map((s) => s.trim())
  .filter(Boolean)
const limit = Number(value('limit') ?? '0') || 0
const pauseMs = Math.max(0, Number(value('pause-ms') ?? '1500') || 0)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const MIN_WIDTH = 320
const MAX_MEGAPIXELS = 80

type Outcome = 'new' | 'matched' | 'filled' | 'skipped' | 'error'
interface ReportLine {
  slug: string
  category: string
  outcome: Outcome
  placeSlug: string
  detail: string
}

function validateFile(root: string, slug: string, file: string) {
  const path = resolve(root, 'images', slug, file)
  if (!path.startsWith(resolve(root, 'images') + '/')) throw new Error('path escapes images/')
  const size = statSync(path).size
  if (size === 0) throw new Error(`${file}: empty file`)
  if (size > MAX_UPLOAD_BYTES) throw new Error(`${file}: too large (${size} bytes)`)
  const bytes = new Uint8Array(readFileSync(path))
  const inspected = inspectImage(bytes, null)
  if (inspected.format !== 'webp' && inspected.format !== 'jpeg')
    throw new Error(`${file}: not webp/jpeg (${inspected.format})`)
  if (inspected.width < MIN_WIDTH) throw new Error(`${file}: only ${inspected.width}px wide`)
  if ((inspected.width * inspected.height) / 1e6 > MAX_MEGAPIXELS)
    throw new Error(`${file}: too many pixels`)
  return { bytes, mime: inspected.mimeType }
}

function listImages(root: string, slug: string): FolderImage[] {
  const d = join(root, 'images', slug)
  if (!existsSync(d)) return []
  return pickPlaceImages(slug, readdirSync(d))
}

/** Ingest (or reuse) the folder's images; returns media ids in order (cover first). */
async function ingestAll(
  root: string,
  row: NewPlaceRow,
  images: FolderImage[],
  files: Map<string, { bytes: Uint8Array; mime: string }>,
): Promise<{ ids: string[]; ingested: number }> {
  const ids = images.map((img) => importMediaId(row.slug, img.file))
  const existing = await db
    .select({ id: media.id, deletedAt: media.deletedAt })
    .from(media)
    .where(inArray(media.id, ids))
  const have = new Map(existing.map((e) => [e.id, e.deletedAt]))
  let ingested = 0
  const out: string[] = []
  for (const [i, img] of images.entries()) {
    const id = ids[i]!
    if (have.has(id)) {
      if (have.get(id) === null) out.push(id) // deleted in Studio: leave it out
      continue
    }
    const file = files.get(img.file)!
    const result = await ingestImage({
      mediaId: id,
      bytes: file.bytes,
      declaredMime: file.mime,
      declaredName: img.file,
    })
    const sourceUrl =
      row.imageSources.length === images.length ? (row.imageSources[i] ?? null) : null
    const attr = attributionFor({ credit: '', sourceUrl })
    await db.insert(media).values({
      id,
      objectKey: result.objectKey,
      mimeType: result.mimeType,
      width: result.width,
      height: result.height,
      bytes: result.bytes,
      name: `${row.slug}-${img.position}`.slice(0, 120),
      alt: { en: row.name.en, ar: row.name.ar || row.name.en, id: row.name.id || row.name.en },
      credit: attr.credit,
      source: attr.source,
      author: attr.author,
      license: attr.license,
      sourceUrl: attr.sourceUrl,
      sha256: createHash('sha256').update(file.bytes).digest('hex'),
    })
    ingested++
    out.push(id)
    console.log(
      `        + ${row.slug}-${img.position} ${result.width}x${result.height} ${result.driver}`,
    )
    if (pauseMs > 0) await sleep(pauseMs)
  }
  return { ids: out, ingested }
}

async function main(): Promise<number> {
  if (!dir) {
    console.error(
      'usage: import-new-places.ts --dir=<folder> [--apply] [--only=a,b] [--limit=N] ...',
    )
    return 2
  }
  try {
    const require_ = createRequire(import.meta.url)
    const sharpMod: unknown = require_('sharp')
    const sh = (
      typeof sharpMod === 'function' ? sharpMod : (sharpMod as { default?: unknown }).default
    ) as { concurrency?: (n: number) => void; cache?: (v: boolean) => void }
    sh.concurrency?.(1)
    sh.cache?.(false)
  } catch {
    // no sharp: the pipeline reports it per image
  }

  const root = resolve(dir)
  const csvPath = join(root, 'places.csv')
  if (!existsSync(csvPath)) {
    console.error(`no places.csv in ${root}`)
    return 2
  }
  const parsed = parsePlacesCsv(readFileSync(csvPath, 'utf8'))
  if (parsed.headerProblem) {
    console.error(`places.csv: ${parsed.headerProblem}`)
    return 2
  }
  let rows = parsed.rows
  let invalid = parsed.invalid
  if (only) {
    rows = rows.filter((r) => only.includes(r.slug))
    invalid = invalid.filter((r) => only.includes(r.slug))
  }
  if (limit > 0) rows = rows.slice(0, limit)

  console.log(
    `\n  ${apply ? 'APPLY' : 'DRY RUN'} — ${root}\n  ${rows.length} valid rows in scope, ${invalid.length} invalid` +
      `${overwrite ? ', --overwrite' : ''}${suffixConflicts ? ', --suffix-conflicts' : ''}\n`,
  )

  const cats = await db
    .select({
      id: categories.id,
      key: categories.key,
      label: categories.label,
      mapTier: categories.mapTier,
    })
    .from(categories)
    .where(inArray(categories.key, [...NEW_PLACE_CATEGORIES]))
  const catByKey = new Map(cats.map((c) => [c.key, c]))
  for (const k of NEW_PLACE_CATEGORIES) {
    if (!catByKey.has(k)) {
      console.error(`category "${k}" missing in the database (migrations 0031/0035)`)
      return 2
    }
  }
  const allCats = await db.select({ id: categories.id, key: categories.key }).from(categories)
  const catKeyById = new Map(allCats.map((c) => [c.id, c.key]))

  const regionRows = await db
    .select({
      id: regions.id,
      key: regions.key,
      label: regions.label,
      centerLat: regions.centerLat,
      centerLon: regions.centerLon,
      radiusKm: regions.radiusKm,
      status: regions.status,
    })
    .from(regions)
  const activeRegions = regionRows.filter((r) => r.status === 'active')

  const placeRows = await db
    .select({
      id: mapPlaces.id,
      slug: mapPlaces.slug,
      name: mapPlaces.name,
      lat: mapPlaces.lat,
      lon: mapPlaces.lon,
      categoryId: mapPlaces.categoryId,
      heroId: mapPlaces.heroImageId,
      galleryIds: mapPlaces.galleryImageIds,
      description: mapPlaces.description,
      detailedDescription: mapPlaces.detailedDescription,
    })
    .from(mapPlaces)
    .where(isNull(mapPlaces.deletedAt))
  const existing: ExistingPlace[] = placeRows.map((p) => ({
    id: p.id,
    slug: p.slug,
    categoryKey: p.categoryId ? (catKeyById.get(p.categoryId) ?? null) : null,
    name: p.name ?? {},
    lat: p.lat,
    lon: p.lon,
  }))
  const byId = new Map(placeRows.map((p) => [p.id, p]))
  const takenSlugs = new Set(placeRows.map((p) => p.slug))

  // Which hero ids are still live media (a deleted hero counts as missing).
  const heroIds = placeRows.map((p) => p.heroId).filter((x): x is string => !!x)
  const liveHero = new Set<string>()
  for (let i = 0; i < heroIds.length; i += 1000) {
    const r = await db
      .select({ id: media.id })
      .from(media)
      .where(and(inArray(media.id, heroIds.slice(i, i + 1000)), isNull(media.deletedAt)))
    for (const x of r) liveHero.add(x.id)
  }

  const report: ReportLine[] = invalid.map((r) => ({
    slug: r.slug,
    category: r.categoryKey,
    outcome: 'skipped',
    placeSlug: '',
    detail: `line ${r.line}: ${r.reason}`,
  }))
  for (const r of report) console.log(`  ! skipped ${r.slug || '(no slug)'} — ${r.detail}`)
  const createdIds: string[] = []
  let ingestedTotal = 0

  for (const [n, row] of rows.entries()) {
    const prefix = `  [${String(n + 1).padStart(3)}/${rows.length}] ${row.slug.padEnd(48)}`
    const line = (outcome: Outcome, placeSlug: string, detail: string) => {
      report.push({ slug: row.slug, category: row.categoryKey, outcome, placeSlug, detail })
      console.log(`${prefix} ${outcome.toUpperCase()} ${detail}`)
    }
    try {
      const images = listImages(root, row.slug)
      const files = new Map<string, { bytes: Uint8Array; mime: string }>()
      for (const img of images) files.set(img.file, validateFile(root, row.slug, img.file))
      const imgNote = `${images.length} image(s)`

      const found = findExisting(row, existing)
      let slug = row.slug

      if (found.kind === 'matched') {
        const place = byId.get(found.place.id)!
        const where = `${found.distanceM} m, ${found.sameCategory ? 'same category' : `category ${found.place.categoryKey ?? 'none'}`}`
        const desc = mergeLocalized(place.description, row.short, overwrite)
        const det = mergeLocalized(place.detailedDescription, row.long, overwrite)
        const needPhotos =
          images.length > 0 && (overwrite || !place.heroId || !liveHero.has(place.heroId))
        const changes = [
          desc.changed && 'description',
          det.changed && 'detailed description',
          needPhotos && `photos (${images.length})`,
        ].filter(Boolean)
        if (changes.length === 0) {
          line('matched', place.slug, `= ${place.slug} (${where}); nothing to fill`)
          continue
        }
        if (!apply) {
          line('filled', place.slug, `= ${place.slug} (${where}); would fill ${changes.join(', ')}`)
          continue
        }
        const set: Partial<typeof mapPlaces.$inferInsert> = {}
        if (desc.changed) set.description = desc.next as Localized
        if (det.changed) set.detailedDescription = det.next as Localized
        if (needPhotos) {
          const { ids, ingested } = await ingestAll(root, row, images, files)
          ingestedTotal += ingested
          if (ids.length > 0) {
            set.heroImageId = ids[0]!
            set.galleryImageIds = ids.slice(1)
          }
        }
        await db.transaction(async (tx) => {
          await tx
            .update(mapPlaces)
            .set({ ...set, updatedAt: new Date() })
            .where(eq(mapPlaces.id, place.id))
          await tx.insert(auditLog).values({
            actorId: null,
            action: 'place.content_import',
            entityType: 'map_place',
            entityId: place.id,
            before: {
              heroImageId: place.heroId,
              galleryImageIds: place.galleryIds,
              description: place.description,
              detailedDescription: place.detailedDescription,
            },
            after: { ...set, source: 'scripts/import-new-places.ts' },
          })
        })
        if (set.heroImageId) liveHero.add(set.heroImageId)
        line('filled', place.slug, `= ${place.slug} (${where}); filled ${changes.join(', ')}`)
        continue
      }

      if (found.kind === 'conflict') {
        if (!suffixConflicts) {
          line(
            'skipped',
            found.place.slug,
            `slug conflict: "${row.slug}" is another place ${found.distanceM} m away (use --suffix-conflicts)`,
          )
          continue
        }
        slug = suffixedSlug(row.slug, row.area, takenSlugs)
      }

      const cat = catByKey.get(row.categoryKey)!
      const region = regionFor(row, row.area, activeRegions)
      const detail = `${slug !== row.slug ? `as ${slug}, ` : ''}${row.categoryKey}, region ${region?.key ?? 'none'}, ${imgNote}`
      if (!apply) {
        line('new', slug, `would create (${detail})`)
        takenSlugs.add(slug)
        continue
      }

      // Insert first (no photos), then ingest, then set photos: a failed
      // image leaves a valid place the next run fills as "matched".
      const loc = (t: Record<string, string | undefined>) => ({
        ar: t.ar ?? '',
        en: t.en ?? '',
        id: t.id ?? '',
      })
      const hasText = (t: Record<string, string | undefined>) =>
        Object.values(t).some((v) => (v ?? '') !== '')
      const [created] = await db.transaction(async (tx) => {
        const inserted = await tx
          .insert(mapPlaces)
          .values({
            slug,
            name: {
              en: row.name.en,
              ar: row.name.ar || row.name.en,
              id: row.name.id || row.name.en,
            },
            category: cat.label,
            description: hasText(row.short) ? loc(row.short) : null,
            detailedDescription: hasText(row.long) ? loc(row.long) : null,
            lat: row.lat,
            lon: row.lon,
            regionId: region?.id ?? null,
            categoryId: cat.id,
            requiredEntitlement: 'map_access',
            openingHours: row.openingHours === '' ? null : row.openingHours.slice(0, 64),
            internalNotes: internalNotesFor(row),
            status: 'published',
            publishedAt: new Date(),
          })
          .returning()
        const r = inserted[0]!
        await tx.insert(auditLog).values({
          actorId: null,
          action: 'map_place.create',
          entityType: 'map_place',
          entityId: r.id,
          before: null,
          after: { ...r, source: 'scripts/import-new-places.ts' },
        })
        await syncPlaceAccess(tx, sql`mp.id = ${r.id}`)
        return inserted
      })
      createdIds.push(created!.id)
      takenSlugs.add(slug)
      existing.push({
        id: created!.id,
        slug,
        categoryKey: row.categoryKey,
        name: created!.name,
        lat: row.lat,
        lon: row.lon,
      })
      if (images.length > 0) {
        const { ids, ingested } = await ingestAll(root, row, images, files)
        ingestedTotal += ingested
        if (ids.length > 0) {
          await db
            .update(mapPlaces)
            .set({ heroImageId: ids[0]!, galleryImageIds: ids.slice(1), updatedAt: new Date() })
            .where(eq(mapPlaces.id, created!.id))
        }
      }
      line('new', slug, `created (${detail})`)
    } catch (error) {
      line('error', '', error instanceof Error ? error.message : String(error))
    }
  }

  if (apply && createdIds.length > 0)
    await syncPlaceAccess(
      db,
      sql`mp.id in (${sql.join(
        createdIds.map((id) => sql`${id}::uuid`),
        sql`, `,
      )})`,
    )

  // Summary per category.
  const outcomes: Outcome[] = ['new', 'matched', 'filled', 'skipped', 'error']
  console.log(`\n  ${'category'.padEnd(10)} ${outcomes.map((o) => o.padStart(8)).join('')}`)
  for (const c of [...NEW_PLACE_CATEGORIES, 'other']) {
    const mine = report.filter((r) =>
      c === 'other'
        ? !(NEW_PLACE_CATEGORIES as readonly string[]).includes(r.category)
        : r.category === c,
    )
    if (mine.length === 0 && c === 'other') continue
    console.log(
      `  ${c.padEnd(10)} ${outcomes.map((o) => String(mine.filter((r) => r.outcome === o).length).padStart(8)).join('')}`,
    )
  }
  const skipped = report.filter((r) => r.outcome === 'skipped' || r.outcome === 'error')
  if (skipped.length > 0)
    console.log(
      `\n  Skipped / errors:\n    ${skipped.map((r) => `${r.slug}: ${r.detail}`).join('\n    ')}`,
    )
  if (apply)
    console.log(`\n  Media ingested: ${ingestedTotal}. Public map cache refreshes within 60 s.`)
  else console.log('\n  Dry run: nothing written. Re-run with --apply.')

  if (reportPath) {
    const out = [
      'slug,category_key,outcome,place_slug,detail',
      ...report.map((r) =>
        [r.slug, r.category, r.outcome, r.placeSlug, r.detail].map(csvCell).join(','),
      ),
    ].join('\n')
    writeFileSync(reportPath, out + '\n', 'utf8')
    console.log(`  Report: ${reportPath}`)
  }
  return report.some((r) => r.outcome === 'error') ? 1 : 0
}

main()
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    console.error(error)
    process.exit(1)
  })
