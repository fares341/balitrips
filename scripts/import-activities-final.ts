/**
 * Import the owner's final activities workbook (Nov 2026, 29 activities)
 * and put every activity on the map. Run inside the production worker:
 *
 *   node_modules/.bin/tsx scripts/import-activities-final.ts \
 *     --file=/data/activities-final-mapped.xlsx --images=/data/activities-images \
 *     [--apply] [--only=slug,slug] [--pause-ms=1000]
 *
 * Dry run by default: reads the database and the files, prints what would
 * change, writes nothing. `--apply` writes. Re-running is safe: every step
 * compares with what is stored and only writes differences.
 *
 * Per activity, in order:
 *   1. The Studio spreadsheet import (`readUpload` → `planRows` →
 *      `previewPlan` → `applyPlan`, the same code as Studio → Import), upsert
 *      by slug. Activities, Packages (price → available, no price →
 *      unavailable: as the file says), AddOns and FAQ. The activity's
 *      meeting map link and lat/lng come from the Map_Locations sheet (the
 *      master for pins). Nothing is deleted; activities on the site that are
 *      not in the file are only listed.
 *   2. Indonesian texts («ID reference»: headline, short text, duration,
 *      cancellation, package names) and SEO title/description per language
 *      («SEO reference») into the activity's own columns.
 *   3. Photos from `--images=<dir>/<slug>/01-hero.jpg, 02-gallery.jpg…`
 *      through `ingestImage()` (the Studio uploader pipeline), one libvips
 *      thread, cache off, `--pause-ms` between images. 01 = cover; all files,
 *      in order, = gallery. Media ids are derived from slug + file + bytes,
 *      so an unchanged file is never processed twice.
 *   4. Publish (the import itself creates drafts: the cover is attached
 *      after it). The Studio checklist must pass, except that an activity
 *      the file lists without any package or price (Rice Farm) is published
 *      without a price, as the owner asked.
 *   5. One map place per activity (category `activities`, free tier) at the
 *      Map_Locations lat/lon, linked by `activity_id`: the map card shows
 *      the activity's price, «Details» opens /activities/<slug> and
 *      «Directions» opens the activity's map link. Region and categories
 *      come from the activity (map filters). Shared pins (Tanjung Benoa
 *      water sports + jet ski, Taman Safari + Marine Safari) stay shared.
 *
 * Sub-activities (SubActivities_Review) have no table: they are not stored.
 */

// The shim must load before any module that imports 'server-only'.
import './data-jobs/server-only-shim.cjs'

import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, posix, resolve } from 'node:path'

import ExcelJS from 'exceljs'

const argv = process.argv.slice(2)
const flag = (name: string) => argv.includes(`--${name}`)
const value = (name: string) => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)

const filePath = value('file')
const imagesDir = value('images')
const apply = flag('apply')
const only = new Set(
  (value('only') ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
)
const pauseMs = Math.max(0, Number(value('pause-ms') ?? '1000') || 0)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const log = (...parts: unknown[]) => console.log(...parts)

/** pg_advisory_lock key: one runner at a time. */
const LOCK_KEY = 2026111201
/** Bali (with Nusa Penida and the Gilis' ferry side excluded): a sanity box. */
const BALI = { latMin: -8.95, latMax: -8.03, lonMin: 114.4, lonMax: 115.75 }
/** Activities the owner wants published even without a price or package. */
const PUBLISH_WITHOUT_PRICE = new Set(['rice-farm-adventure'])
const IMAGE_RE = /\.(jpe?g|png|webp)$/i

type Loc = { ar: string; en: string; id: string }

interface MapLocation {
  slug: string
  mapType: string
  nameEn: string
  nameAr: string
  lat: number
  lon: number
  mapsUrl: string
  confidence: string
  sourceType: string
  notes: string
}

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (typeof value === 'object') {
    if ('richText' in value) return value.richText.map((part) => part.text).join('')
    if ('text' in value && typeof value.text === 'string') return value.text
    if ('result' in value) return cellText(value.result as ExcelJS.CellValue)
    if ('hyperlink' in value && typeof value.hyperlink === 'string') return value.hyperlink
    return ''
  }
  return String(value)
}

/** A sheet whose first row is the header → records keyed by that header. */
function sheetRecords(wb: ExcelJS.Workbook, name: string): Record<string, string>[] {
  const ws = wb.worksheets.find((w) => w.name.trim().toLowerCase() === name.toLowerCase())
  if (!ws) return []
  const header: string[] = []
  const out: Record<string, string>[] = []
  ws.eachRow({ includeEmpty: false }, (row, n) => {
    const cells = (row.values as ExcelJS.CellValue[]).slice(1).map((c) => cellText(c).trim())
    if (n === 1) {
      header.push(...cells)
      return
    }
    const rec: Record<string, string> = {}
    header.forEach((key, i) => (rec[key] = cells[i] ?? ''))
    out.push(rec)
  })
  return out
}

/** UUIDv5-shaped id from a name. */
function stableId(name: string): string {
  const hex = createHash('sha1').update(`bali-trips/import-activities-final/${name}`).digest('hex')
  const variant = ((parseInt(hex.slice(16, 18), 16) & 0x3f) | 0x80).toString(16)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(18, 20)}-${hex.slice(20, 32)}`
}

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
const inBali = (lat: number, lon: number) =>
  lat >= BALI.latMin && lat <= BALI.latMax && lon >= BALI.lonMin && lon <= BALI.lonMax

/**
 * Workbooks saved by the OpenXML SDK (Google/online exports) use `x:`-prefixed
 * elements, absolute part paths, a BOM and comment parts that ExcelJS cannot
 * read. Rewrite them into the plain form ExcelJS expects; cell values are
 * untouched. JSZip is ExcelJS's own dependency, resolved from there.
 */
async function normaliseXlsx(input: Uint8Array): Promise<Uint8Array> {
  const require_ = createRequire(import.meta.url)
  const fromExcel = createRequire(require_.resolve('exceljs'))
  type Zip = {
    files: Record<string, { dir: boolean; async(kind: 'uint8array'): Promise<Uint8Array> }>
    file(name: string, data: Uint8Array | string): void
    generateAsync(o: { type: 'uint8array'; compression: 'DEFLATE' }): Promise<Uint8Array>
  }
  const JSZip = fromExcel('jszip') as { loadAsync(d: Uint8Array): Promise<Zip>; new (): Zip }
  const src = await JSZip.loadAsync(input)
  const out = new JSZip()
  for (const [name, entry] of Object.entries(src.files)) {
    if (entry.dir) continue
    if (/^xl\/(worksheets\/_rels\/|comments|drawings\/)/.test(name)) continue
    const data = await entry.async('uint8array')
    if (!/\.(xml|rels)$/.test(name)) {
      out.file(name, data)
      continue
    }
    let text = new TextDecoder('utf-8').decode(data).replace(/^\uFEFF/, '')
    text = text.replace(/<(\/?)x:/g, '<$1').replace(/xmlns:x=/g, 'xmlns=')
    text = text.replace(/<legacyDrawing[^>]*\/>/g, '')
    if (name.endsWith('.rels')) {
      const owner = posix.dirname(posix.dirname(name))
      text = text.replace(
        /Target="\/([^"]+)"/g,
        (_m, target: string) => `Target="${posix.relative(owner === '.' ? '' : owner, target)}"`,
      )
    }
    out.file(name, text)
  }
  return out.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
}

async function main(): Promise<number> {
  if (!filePath) {
    console.error('usage: import-activities-final.ts --file=<xlsx> [--images=<dir>] [--apply] …')
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

  // Loaded after the shim (they import 'server-only').
  const { and, asc, eq, inArray, isNull, sql } = await import('drizzle-orm')
  const postgres = (await import('postgres')).default
  const { translator } = await import('@/app/(admin)/_i18n')
  const { writeAudit } = await import('@/app/(admin)/_lib/audit')
  const { ingestImage } = await import('@/app/(admin)/_lib/image/pipeline')
  const { loadChecklist } = await import('@/app/(admin)/studio/activities/checklist')
  const { missingForPublish } = await import('@/lib/content/activity-checklist')
  const sheet = await import('@/app/(admin)/studio/activity-import/sheet')
  const { db } = await import('@/db')
  const schema = await import('@/db/schema')
  const {
    activities,
    activityCategories,
    activityImages,
    activityTiers,
    categories,
    mapPlaces,
    media,
  } = schema
  const { syncPlaceAccess } = await import('@/lib/content/map-access')
  const { isPublicStatus } = await import('@/lib/content/activity-status')
  type AdminSession = import('@/app/(admin)/_lib/session').AdminSession

  const t = translator('en')
  const SYSTEM: AdminSession = {
    userId: null as unknown as string,
    email: 'system@data-job',
    name: 'import: activities-final',
    role: 'admin',
    sessionId: 'data-job',
    ipAddress: null,
  }

  // ---------------------------------------------------------------- files
  const bytes = await normaliseXlsx(new Uint8Array(readFileSync(resolve(filePath))))
  const { rows: allRows, issues: readIssues } = await sheet.readUpload('activities.xlsx', bytes)
  if (readIssues.length > 0) {
    console.error('workbook unreadable:', readIssues.map((i) => sheet.issueText(i, t)).join(' | '))
    return 1
  }
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
  )

  const slugOf = (r: { cells: Record<string, string> }) =>
    (r.cells.activity_slug ?? '').trim().toLowerCase()
  const rows = allRows.filter((r) => only.size === 0 || only.has(slugOf(r)))
  const fileSlugs = [
    ...new Set(
      allRows
        .filter((r) => r.sheet === 'activities')
        .map(slugOf)
        .filter(Boolean),
    ),
  ]
  const slugs = fileSlugs.filter((s) => only.size === 0 || only.has(s))
  if (slugs.length === 0) {
    console.error('no activities selected')
    return 1
  }

  // Map_Locations: the master for pins.
  const locations = new Map<string, MapLocation>()
  const problems: string[] = []
  for (const r of sheetRecords(wb, 'Map_Locations')) {
    const slug = (r.activity_slug ?? '').toLowerCase()
    if (!slug) continue
    const lat = Number(r.latitude)
    const lon = Number(r.longitude)
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !inBali(lat, lon)) {
      problems.push(
        `${slug}: Map_Locations ${r.latitude},${r.longitude} is not in Bali — pin skipped`,
      )
      continue
    }
    locations.set(slug, {
      slug,
      mapType: r.map_type ?? '',
      nameEn: r.place_name_en ?? '',
      nameAr: r.place_name_ar ?? '',
      lat,
      lon,
      mapsUrl: r.google_maps_url ?? '',
      confidence: r.confidence ?? '',
      sourceType: r.source_type ?? '',
      notes: r.notes ?? '',
    })
  }

  // ID reference / SEO reference.
  const idRef = new Map<string, Map<string, string>>()
  for (const r of sheetRecords(wb, 'ID reference')) {
    const keys = Object.keys(r)
    const slug = (r[keys[0] ?? ''] ?? '').toLowerCase()
    const field = r[keys[1] ?? ''] ?? ''
    const text = r[keys[2] ?? ''] ?? ''
    if (!slug || !field || !text) continue
    const m = idRef.get(slug) ?? new Map<string, string>()
    m.set(field, text)
    idRef.set(slug, m)
  }
  const seo = new Map<string, { title: Loc; description: Loc }>()
  for (const r of sheetRecords(wb, 'SEO reference')) {
    const slug = (r.activity_slug ?? '').toLowerCase()
    const lang = (r.lang ?? '') as keyof Loc
    if (!slug || !['ar', 'en', 'id'].includes(lang)) continue
    const s = seo.get(slug) ?? {
      title: { ar: '', en: '', id: '' },
      description: { ar: '', en: '', id: '' },
    }
    s.title[lang] = r.title ?? ''
    s.description[lang] = r.meta_description ?? ''
    seo.set(slug, s)
  }

  // List cells: drop empty items (« | X» would never match what is stored, so
  // every re-run would «change» it) and the researcher's provenance notes
  // («External Public 2026 – Supplier confirmation pending»), which are
  // internal and must not show on the page as package features.
  const INTERNAL = /supplier confirmation|external public/i
  let droppedNotes = 0
  for (const row of rows) {
    for (const [key, cell] of Object.entries(row.cells)) {
      if (!/_(ar|en)$/.test(key) || !(cell ?? '').includes('|')) continue
      const items = cell.split('|').map((x) => x.trim())
      const kept = items.filter((x) => x !== '' && !INTERNAL.test(x))
      droppedNotes += items.filter((x) => INTERNAL.test(x)).length
      row.cells[key] = kept.join(' | ')
    }
    for (const key of ['features_en', 'features_ar']) {
      const cell = row.cells[key] ?? ''
      if (INTERNAL.test(cell) && !cell.includes('|')) {
        row.cells[key] = ''
        droppedNotes += 1
      }
    }
  }
  if (droppedNotes > 0) log(`left out ${droppedNotes} internal provenance note(s) from list cells`)

  // Sheet rows → the Studio import, adjusted.
  for (const row of rows) {
    if (row.sheet !== 'activities') continue
    const slug = slugOf(row)
    const loc = locations.get(slug)
    if (loc) {
      row.cells.lat = String(loc.lat)
      row.cells.lng = String(loc.lon)
      if (loc.mapsUrl) row.cells.map_url = loc.mapsUrl
    }
    row.columns = [...new Set([...row.columns, 'lat', 'lng', 'map_url'])]
    // Published after the photos (step 4); Drive links are not fetched.
    delete row.cells.status
    delete row.cells.hero_image_url
    delete row.cells.gallery_urls
    row.columns = row.columns.filter(
      (key) => !['status', 'hero_image_url', 'gallery_urls'].includes(key),
    )
    for (const key of ['map_url', 'lat', 'lng', 'meeting_ar', 'meeting_en']) {
      if (!(row.cells[key] ?? '').trim()) problems.push(`${slug}: ${key} is empty in the file`)
    }
  }

  // ---------------------------------------------------------------- lock
  const lockConn = postgres(process.env.DATABASE_URL ?? '', { max: 1 })
  const [lock] = await lockConn<{ ok: boolean }[]>`select pg_try_advisory_lock(${LOCK_KEY}) as ok`
  if (!lock?.ok) {
    log('another run holds the lock — try again later')
    await lockConn.end()
    return 1
  }
  try {
    log(apply ? '== APPLY ==' : '== DRY RUN (nothing is written; add --apply) ==')
    log(`file: ${slugs.length} activities${only.size ? ` (--only)` : ''}`)

    // Archived slugs are refused by the import: report, never restore silently.
    const archived = await sheet.archivedSlugs(slugs)
    const ctx = await sheet.loadContext()
    const storedBefore = await sheet.loadStored(ctx, { slugs })
    const blockedArchived = [...archived].filter((s) => !storedBefore.has(s))
    if (blockedArchived.length > 0) {
      problems.push(
        `archived in Studio (restore them first, then re-run): ${blockedArchived.join(', ')}`,
      )
    }

    // ------------------------------------------------------------ 1. sheet
    const existing = new Map(
      [...storedBefore].map(([slug, item]) => [slug, { currency: item.row.currency }]),
    )
    const plan = sheet.planRows(rows, ctx.lookups, existing)
    const { preview, blocking } = sheet.previewPlan(plan, storedBefore, archived, SYSTEM, t)
    for (const item of preview.items) {
      log(
        `  ${item.kind.padEnd(6)} ${item.slug}${item.changes.length ? ` — ${item.changes.length} change(s): ${item.changes.slice(0, 6).join('; ')}${item.changes.length > 6 ? ' …' : ''}` : ''}`,
      )
    }
    log(
      `sheet: new ${preview.counts.new}, update ${preview.counts.update}, unchanged ${preview.counts.same}, errors ${preview.counts.errors}`,
    )
    if (blocking.length > 0) {
      for (const issue of blocking) console.error('  BLOCKING:', sheet.issueText(issue, t))
      return 1
    }
    if (apply) {
      const result = await sheet.applyPlan(plan, ctx, SYSTEM, t, new Map())
      log(`sheet applied: created ${result.created}, updated ${result.updated}`)
      for (const w of result.warnings) {
        // «kept as draft»: expected, step 4 publishes once the cover is attached.
        if (!/draft/i.test(w)) log(`  warning: ${w}`)
      }
    }

    const [activitiesCat] = await db
      .select({ id: categories.id, label: categories.label })
      .from(categories)
      .where(eq(categories.key, 'activities'))
      .limit(1)
    if (!activitiesCat) throw new Error('category «activities» is missing')

    const counts = { texts: 0, images: 0, imageFiles: 0, published: 0, placesNew: 0, placesUpd: 0 }
    const wantNoPackages = new Set(
      slugs.filter((s) => !rows.some((r) => r.sheet === 'packages' && slugOf(r) === s)),
    )

    for (const slug of slugs) {
      const [row] = await db
        .select()
        .from(activities)
        .where(and(eq(activities.slug, slug), isNull(activities.deletedAt)))
        .limit(1)
      if (!row) {
        log(`  ${slug}: not in the database yet${apply ? ' — skipped' : ' (created on --apply)'}`)
        continue
      }

      // ---------------------------------------------------- 2. ID + SEO
      const ids = idRef.get(slug) ?? new Map<string, string>()
      const patch: Partial<typeof activities.$inferInsert> = {}
      const withId = (cur: Loc | null, text: string | undefined): Loc | null =>
        text ? { ar: cur?.ar ?? '', en: cur?.en ?? '', id: text } : cur
      const fields = [
        ['name', 'name'],
        ['headline', 'headline'],
        ['short', 'shortDescription'],
        ['duration', 'duration'],
        ['cancellation', 'cancellationPolicy'],
      ] as const
      for (const [field, column] of fields) {
        const cur = (row[column] as Loc | null) ?? null
        const next = withId(cur, ids.get(field))
        if (next && !sameJson(next, cur)) (patch as Record<string, unknown>)[column] = next
      }
      const s = seo.get(slug)
      if (s) {
        if (ids.get('SEO title') && !s.title.id) s.title.id = ids.get('SEO title') ?? ''
        if (ids.get('SEO description') && !s.description.id)
          s.description.id = ids.get('SEO description') ?? ''
        if (!sameJson(s.title, row.seoTitle)) patch.seoTitle = s.title
        if (!sameJson(s.description, row.seoDescription)) patch.seoDescription = s.description
      }
      const tierRows = await db
        .select()
        .from(activityTiers)
        .where(and(eq(activityTiers.activityId, row.id), isNull(activityTiers.deletedAt)))
      const tierPatches = tierRows
        .map((tier) => {
          const text = ids.get(`package ${tier.key}`)
          const next = withId(tier.name as Loc, text)
          return next && !sameJson(next, tier.name) ? { tier, next } : null
        })
        .filter((x): x is NonNullable<typeof x> => x !== null)
      if (Object.keys(patch).length + tierPatches.length > 0) {
        counts.texts += 1
        log(
          `  ${slug}: Indonesian/SEO → ${[...Object.keys(patch), ...tierPatches.map((p) => `package ${p.tier.key}`)].join(', ')}`,
        )
        if (apply) {
          await db.transaction(async (tx) => {
            if (Object.keys(patch).length > 0) {
              await tx
                .update(activities)
                .set({ ...patch, updatedAt: new Date() })
                .where(eq(activities.id, row.id))
            }
            for (const { tier, next } of tierPatches) {
              await tx
                .update(activityTiers)
                .set({ name: next, updatedAt: new Date() })
                .where(eq(activityTiers.id, tier.id))
            }
            await writeAudit(
              {
                actor: SYSTEM,
                action: 'activity.update',
                entityType: 'activity',
                entityId: row.id,
                before: { columns: Object.keys(patch) },
                after: {
                  ...patch,
                  packages: tierPatches.length,
                  source: 'import-activities-final',
                },
              },
              tx,
            )
          })
        }
      }

      // ---------------------------------------------------- 3. photos
      const dir = imagesDir ? join(resolve(imagesDir), slug) : null
      const files =
        dir && existsSync(dir)
          ? readdirSync(dir)
              .filter((f) => IMAGE_RE.test(f))
              .sort()
          : []
      if (imagesDir && files.length === 0) problems.push(`${slug}: no photos in ${dir}`)
      let heroId = row.heroImageId
      if (files.length > 0 && dir) {
        const wanted = files.map((file) => {
          const data = new Uint8Array(readFileSync(join(dir, file)))
          const sha = createHash('sha256').update(data).digest('hex')
          return { file, data, sha, id: stableId(`${slug}/${file}/${sha}`) }
        })
        const gallery = await db
          .select({ mediaId: activityImages.mediaId })
          .from(activityImages)
          .where(eq(activityImages.activityId, row.id))
          .orderBy(asc(activityImages.sortOrder))
        const want = wanted.map((w) => w.id)
        const same =
          row.heroImageId === want[0] &&
          sameJson(
            gallery.map((g) => g.mediaId),
            want,
          )
        if (!same) {
          counts.images += 1
          const have = new Set(
            (
              await db
                .select({ id: media.id })
                .from(media)
                .where(and(inArray(media.id, want), isNull(media.deletedAt)))
            ).map((m) => m.id),
          )
          const toIngest = wanted.filter((w) => !have.has(w.id))
          log(
            `  ${slug}: photos → cover + ${wanted.length} gallery (${toIngest.length} to process, ${wanted.length - toIngest.length} already in the library)`,
          )
          if (apply) {
            for (const w of toIngest) {
              const result = await ingestImage({
                mediaId: w.id,
                bytes: w.data,
                declaredMime: /\.webp$/i.test(w.file)
                  ? 'image/webp'
                  : /\.png$/i.test(w.file)
                    ? 'image/png'
                    : 'image/jpeg',
                declaredName: `${slug}-${w.file}`,
              })
              const values = {
                objectKey: result.objectKey,
                mimeType: result.mimeType,
                width: result.width,
                height: result.height,
                bytes: result.bytes,
                name: `${slug}-${w.file}`.slice(0, 120),
                alt: row.name,
                credit: 'Bali Trips',
                sha256: w.sha,
              }
              await db
                .insert(media)
                .values({ id: w.id, ...values })
                .onConflictDoUpdate({
                  target: media.id,
                  set: { ...values, deletedAt: null, updatedAt: new Date() },
                })
              counts.imageFiles += 1
              if (pauseMs > 0) await sleep(pauseMs)
            }
            await db.transaction(async (tx) => {
              await tx.delete(activityImages).where(eq(activityImages.activityId, row.id))
              await tx
                .insert(activityImages)
                .values(
                  want.map((mediaId, index) => ({ activityId: row.id, mediaId, sortOrder: index })),
                )
              await tx
                .update(activities)
                .set({ heroImageId: want[0] ?? null, updatedAt: new Date() })
                .where(eq(activities.id, row.id))
              await writeAudit(
                {
                  actor: SYSTEM,
                  action: 'activity.update',
                  entityType: 'activity',
                  entityId: row.id,
                  before: { heroImageId: row.heroImageId, gallery: gallery.map((g) => g.mediaId) },
                  after: { heroImageId: want[0], gallery: want, source: 'import-activities-final' },
                },
                tx,
              )
            })
            heroId = want[0] ?? null
          }
        }
      }

      // ---------------------------------------------------- 4. publish
      if (!isPublicStatus(row.status)) {
        const items = apply ? await loadChecklist(db, row.id, {}) : null
        const missing = items ? missingForPublish(items).filter((k) => k !== 'reviewed') : []
        const allowed =
          missing.length === 0 ||
          (PUBLISH_WITHOUT_PRICE.has(slug) &&
            wantNoPackages.has(slug) &&
            missing.every((k) => k === 'price'))
        if (!apply) {
          log(
            `  ${slug}: publish (status ${row.status}${heroId || files.length ? '' : ', NO COVER PHOTO'})`,
          )
        } else if (!allowed) {
          problems.push(`${slug}: kept as ${row.status} — missing ${missing.join(', ')}`)
        } else {
          await db.transaction(async (tx) => {
            await tx
              .update(activities)
              .set({
                status: 'published',
                needsReview: false,
                publishedAt: row.publishedAt ?? new Date(),
              })
              .where(eq(activities.id, row.id))
            await writeAudit(
              {
                actor: SYSTEM,
                action: 'activity.publish',
                entityType: 'activity',
                entityId: row.id,
                before: { status: row.status, needsReview: row.needsReview },
                after: {
                  status: 'published',
                  source: 'import-activities-final',
                  ...(missing.length ? { publishedWithout: missing } : {}),
                },
              },
              tx,
            )
          })
          counts.published += 1
          log(
            `  ${slug}: published${missing.length ? ` (owner exception: no ${missing.join(', ')})` : ''}`,
          )
        }
      }

      // ---------------------------------------------------- 5. map place
      const loc = locations.get(slug)
      if (!loc) {
        problems.push(`${slug}: no Map_Locations row — no map marker`)
        continue
      }
      const [fresh] = await db.select().from(activities).where(eq(activities.id, row.id)).limit(1)
      if (!fresh) continue
      const cats = await db
        .select({ id: activityCategories.categoryId })
        .from(activityCategories)
        .where(eq(activityCategories.activityId, row.id))
      const galleryIds = (
        await db
          .select({ id: activityImages.mediaId })
          .from(activityImages)
          .where(eq(activityImages.activityId, row.id))
          .orderBy(asc(activityImages.sortOrder))
      ).map((g) => g.id)
      const notes = [
        `Activity marker (import-activities-final): ${loc.mapType || 'pin'}`,
        `confidence: ${loc.confidence || '—'}`,
        `source: ${loc.sourceType || '—'}`,
        loc.notes ? `notes: ${loc.notes}` : '',
      ]
        .filter(Boolean)
        .join(' · ')
      const values = {
        name: fresh.name,
        category: activitiesCat.label,
        description: fresh.shortDescription,
        lat: loc.lat,
        lon: loc.lon,
        regionId: fresh.regionId,
        categoryId: activitiesCat.id,
        activityId: fresh.id,
        subCategoryIds: [...new Set(cats.map((c) => c.id))].filter((id) => id !== activitiesCat.id),
        heroImageId: fresh.heroImageId,
        galleryImageIds: galleryIds,
        internalNotes: notes,
        isHidden: false,
        canAddToTrip: true,
        canFavorite: true,
        status: 'published',
      }
      const [place] = await db
        .select()
        .from(mapPlaces)
        .where(and(eq(mapPlaces.activityId, fresh.id), isNull(mapPlaces.deletedAt)))
        .limit(1)
      if (place) {
        const diff = (Object.keys(values) as (keyof typeof values)[]).filter(
          (k) => !sameJson(values[k], place[k]),
        )
        if (diff.length === 0) continue
        counts.placesUpd += 1
        log(`  ${slug}: map marker ${place.slug} → ${diff.join(', ')}`)
        if (!apply) continue
        await db.transaction(async (tx) => {
          await tx
            .update(mapPlaces)
            .set({ ...values, publishedAt: place.publishedAt ?? new Date(), updatedAt: new Date() })
            .where(eq(mapPlaces.id, place.id))
          await syncPlaceAccess(tx, sql`mp.id = ${place.id}`)
          await writeAudit(
            {
              actor: SYSTEM,
              action: 'place.update',
              entityType: 'map_place',
              entityId: place.id,
              before: Object.fromEntries(diff.map((k) => [k, place[k]])),
              after: {
                ...Object.fromEntries(diff.map((k) => [k, values[k]])),
                source: 'import-activities-final',
              },
            },
            tx,
          )
        })
      } else {
        const taken = await db
          .select({ slug: mapPlaces.slug })
          .from(mapPlaces)
          .where(inArray(mapPlaces.slug, [slug, `${slug}-activity`]))
        const placeSlug = !taken.some((p) => p.slug === slug) ? slug : `${slug}-activity`
        counts.placesNew += 1
        log(
          `  ${slug}: new map marker ${placeSlug} at ${loc.lat},${loc.lon} (${loc.confidence || '—'})`,
        )
        if (!apply) continue
        if (taken.some((p) => p.slug === placeSlug)) {
          problems.push(`${slug}: map slugs ${slug} and ${slug}-activity are both taken`)
          continue
        }
        await db.transaction(async (tx) => {
          const [inserted] = await tx
            .insert(mapPlaces)
            .values({ ...values, slug: placeSlug, publishedAt: new Date() })
            .returning({ id: mapPlaces.id })
          if (!inserted) return
          await syncPlaceAccess(tx, sql`mp.id = ${inserted.id}`)
          await writeAudit(
            {
              actor: SYSTEM,
              action: 'place.create',
              entityType: 'map_place',
              entityId: inserted.id,
              before: null,
              after: { ...values, slug: placeSlug, source: 'import-activities-final' },
            },
            tx,
          )
        })
      }
    }

    // ---------------------------------------------------------- report
    const live = await db
      .select({ slug: activities.slug, status: activities.status })
      .from(activities)
      .where(isNull(activities.deletedAt))
      .orderBy(asc(activities.slug))
    const notInFile = live.filter((a) => !fileSlugs.includes(a.slug))
    log('')
    log(
      `Indonesian/SEO updated: ${counts.texts} · photo sets: ${counts.images} (${counts.imageFiles} files processed) · published: ${counts.published} · map markers new ${counts.placesNew}, updated ${counts.placesUpd}`,
    )
    log(
      `On the site but not in the file (left untouched — owner decides): ${notInFile.map((a) => `${a.slug} (${a.status})`).join(', ') || 'none'}`,
    )
    log('Sub-activities (SubActivities_Review): not stored — the site has no sub-activity table.')
    if (problems.length > 0) {
      log(`Needs attention (${problems.length}):`)
      for (const p of problems) log(`  - ${p}`)
    }
    if (apply) log('Map and pages refresh within 60 s (cache).')
    return 0
  } finally {
    await lockConn`select pg_advisory_unlock(${LOCK_KEY})`
    await lockConn.end()
  }
}

main()
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    console.error('[import-activities-final] FAILED:', error instanceof Error ? error.stack : error)
    process.exit(1)
  })
