/**
 * One-time data job (owner request, Nov 2026): the site sells exactly two
 * activities — «Nusa Penida Island Tour» and «Tanjung Benoa Water Sports».
 *
 *   1. Upserts both from `data/jobs/replace-activities-2026-11/activities.xlsx`
 *      through the Studio's own spreadsheet import (`readUpload` → `planRows` →
 *      `previewPlan` → `applyPlan`), with free cancellation = 1 hour and
 *      status = published.
 *   2. Attaches the committed photos (01-cover = hero, all = gallery, in
 *      order) through `ingestImage()` — the same pipeline as a Studio upload —
 *      but only when the activity does not already carry a full gallery.
 *   3. Soft-deletes EVERY other activity exactly like Studio's «delete»
 *      (`deleteActivity`): `deleted_at = now()`, `status = 'draft'`, one
 *      `activity.delete` audit row each. Nothing is hard-deleted: orders,
 *      reviews and order items keep pointing at the archived rows.
 *
 * SAFETY
 *  - Runs once: a `site_settings` marker row (`MARKER`) is written at the end;
 *    when it exists the job only logs and exits. A Postgres advisory lock
 *    keeps two deploys from running it at the same time.
 *  - Step 3 only runs when both kept activities exist, are not deleted and are
 *    public. Otherwise nothing is deleted, no marker is written, and the next
 *    deploy tries again.
 *  - An empty cell in the sheet never clears a stored value here (the Studio
 *    import treats an empty cell as «clear»): live edits made in Studio after
 *    the sheet was written (map links, times, Indonesian text…) survive.
 *  - Never fails the deploy: errors are logged and the process exits 0
 *    (`--strict` exits 1 instead, for tests).
 *
 *   tsx --conditions=react-server scripts/data-jobs/replace-activities.ts [--dry-run] [--strict]
 */

import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { and, asc, eq, inArray, isNull, notInArray } from 'drizzle-orm'
import postgres from 'postgres'

import { translator } from '@/app/(admin)/_i18n'
import { writeAudit } from '@/app/(admin)/_lib/audit'
import { ingestImage } from '@/app/(admin)/_lib/image/pipeline'
import type { AdminSession } from '@/app/(admin)/_lib/session'
import { assertPublishable } from '@/app/(admin)/studio/activities/checklist'
import {
  applyPlan,
  archivedSlugs,
  issueText,
  loadContext,
  loadStored,
  planRows,
  previewPlan,
  readUpload,
} from '@/app/(admin)/studio/activity-import/sheet'
import { db } from '@/db'
import { activities, activityImages, media, siteSettings } from '@/db/schema'
import { isPublicStatus } from '@/lib/content/activity-status'

export const MARKER = 'datajob.replace-activities-2026-11'
export const KEEP = ['nusa-penida-island-tour', 'tanjung-benoa-water-sports'] as const
/** Arbitrary constant for pg_advisory_lock: one runner at a time. */
const LOCK_KEY = 2026110401

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const DATA = join(root, 'data/jobs/replace-activities-2026-11')
const dryRun = process.argv.includes('--dry-run')
const strict = process.argv.includes('--strict')

const t = translator('en')
/**
 * The audit actor: a system job, not a signed-in admin. `actor_id` is null
 * (like the worker's own audit rows); the role only gates the import's
 * price/publish checks, which the owner approved for this job.
 */
const SYSTEM: AdminSession = {
  userId: null as unknown as string,
  email: 'system@data-job',
  name: 'data job: replace activities',
  role: 'admin',
  sessionId: 'data-job',
  ipAddress: null,
}

const log = (...parts: unknown[]) => console.log('[replace-activities]', ...parts)

/** UUIDv5-shaped id from a name: re-runs replace the same media rows. */
function stableId(name: string): string {
  const hex = createHash('sha1').update(`bali-trips/data-job/${name}`).digest('hex')
  const variant = ((parseInt(hex.slice(16, 18), 16) & 0x3f) | 0x80).toString(16)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(18, 20)}-${hex.slice(20, 32)}`
}

async function markerExists(): Promise<boolean> {
  const rows = await db
    .select({ key: siteSettings.key })
    .from(siteSettings)
    .where(eq(siteSettings.key, MARKER))
  return rows.length > 0
}

/** Step 1: the Studio spreadsheet import, adjusted as described above. */
async function importSheet(): Promise<void> {
  const bytes = new Uint8Array(readFileSync(join(DATA, 'activities.xlsx')))
  const { rows, issues } = await readUpload('activities.xlsx', bytes)
  if (issues.length > 0) throw new Error(`sheet unreadable: ${JSON.stringify(issues)}`)

  for (const row of rows) {
    if (row.sheet === 'activities') {
      row.cells.status = 'published'
      row.cells.free_cancel_hours = '1'
      // Photos are attached by this job from committed files, not by URL.
      delete row.cells.hero_image_url
      delete row.cells.gallery_urls
    }
    // Empty cell = keep what is stored (see SAFETY).
    const keep = ['activity_slug', 'package_key', 'status', 'free_cancel_hours']
    const columns = row.columns.filter(
      (key) => keep.includes(key) || (row.cells[key] ?? '').trim() !== '',
    )
    row.columns = [...new Set([...columns, ...(row.sheet === 'activities' ? keep.slice(2) : [])])]
  }

  const slugs = [
    ...new Set(rows.map((row) => (row.cells.activity_slug ?? '').trim().toLowerCase())),
  ]
  const unexpected = slugs.filter((slug) => !(KEEP as readonly string[]).includes(slug))
  if (unexpected.length > 0) throw new Error(`sheet has unexpected slugs: ${unexpected.join(', ')}`)

  // A kept slug that was archived earlier is restored (the import refuses
  // archived slugs, and the owner wants exactly these two live).
  const archived = await archivedSlugs(slugs)
  const live = await loadStored(await loadContext(), { slugs })
  for (const slug of archived) {
    if (live.has(slug)) continue
    log(`restoring archived activity ${slug}`)
    if (dryRun) continue
    await db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(activities)
        .where(eq(activities.slug, slug))
        .orderBy(asc(activities.createdAt))
        .limit(1)
      if (!before) return
      await tx.update(activities).set({ deletedAt: null }).where(eq(activities.id, before.id))
      await writeAudit(
        {
          actor: SYSTEM,
          action: 'activity.restore',
          entityType: 'activity',
          entityId: before.id,
          before: { deletedAt: before.deletedAt },
          after: { deletedAt: null, source: 'data-job' },
        },
        tx,
      )
    })
  }

  const ctx = await loadContext()
  const stored = await loadStored(ctx, { slugs })
  const existing = new Map(
    [...stored].map(([slug, item]) => [slug, { currency: item.row.currency }]),
  )
  const plan = planRows(rows, ctx.lookups, existing)
  const { preview, blocking } = previewPlan(
    plan,
    stored,
    dryRun ? await archivedSlugs(slugs) : new Set(),
    SYSTEM,
    t,
  )
  for (const item of preview.items) {
    log(
      `sheet: ${item.slug} → ${item.kind}${item.changes.length ? ` (${item.changes.join('; ')})` : ''}`,
    )
  }
  if (blocking.length > 0) {
    throw new Error(
      `sheet has blocking issues: ${blocking.map((i) => issueText(i, t)).join(' | ')}`,
    )
  }
  if (dryRun) return
  const result = await applyPlan(plan, ctx, SYSTEM, t, new Map())
  log(`sheet applied: created ${result.created}, updated ${result.updated}`)
  for (const warning of result.warnings) log(`  warning: ${warning}`)
}

/** Step 2: committed photos → media library → hero + gallery. */
async function attachPhotos(): Promise<void> {
  for (const slug of KEEP) {
    const dir = join(DATA, 'photos', slug)
    const files = readdirSync(dir)
      .filter((f) => /\.(webp|jpe?g|png)$/i.test(f))
      .sort()
    const [row] = await db
      .select()
      .from(activities)
      .where(and(eq(activities.slug, slug), isNull(activities.deletedAt)))
      .limit(1)
    if (!row) {
      log(`photos: ${slug} not found${dryRun ? ' (dry run)' : ''} — skipped`)
      continue
    }
    const gallery = await db
      .select({ mediaId: activityImages.mediaId })
      .from(activityImages)
      .innerJoin(media, eq(media.id, activityImages.mediaId))
      .where(and(eq(activityImages.activityId, row.id), isNull(media.deletedAt)))
    if (row.heroImageId && gallery.length >= files.length) {
      log(`photos: ${slug} already has a cover and ${gallery.length} gallery photos — kept as is`)
      continue
    }
    log(
      `photos: ${slug} has ${gallery.length} gallery photos → attaching ${files.length} committed photos`,
    )
    if (dryRun) continue
    const ids: string[] = []
    for (const file of files) {
      const mediaId = stableId(`${slug}/${file}`)
      const bytes = new Uint8Array(readFileSync(join(dir, file)))
      const result = await ingestImage({
        mediaId,
        bytes,
        declaredMime: file.endsWith('.webp') ? 'image/webp' : null,
        declaredName: file,
      })
      const values = {
        objectKey: result.objectKey,
        mimeType: result.mimeType,
        width: result.width,
        height: result.height,
        bytes: result.bytes,
        alt: row.name,
        credit: 'Bali Trips',
      }
      await db
        .insert(media)
        .values({ id: mediaId, ...values })
        .onConflictDoUpdate({
          target: media.id,
          set: { ...values, deletedAt: null, updatedAt: new Date() },
        })
      ids.push(mediaId)
    }
    await db.transaction(async (tx) => {
      await tx.delete(activityImages).where(eq(activityImages.activityId, row.id))
      await tx
        .insert(activityImages)
        .values(ids.map((mediaId, index) => ({ activityId: row.id, mediaId, sortOrder: index })))
      await tx
        .update(activities)
        .set({ heroImageId: ids[0] ?? null, updatedAt: new Date() })
        .where(eq(activities.id, row.id))
      await writeAudit(
        {
          actor: SYSTEM,
          action: 'activity.update',
          entityType: 'activity',
          entityId: row.id,
          before: { heroImageId: row.heroImageId, gallery: gallery.map((g) => g.mediaId) },
          after: { heroImageId: ids[0] ?? null, gallery: ids, source: 'data-job' },
        },
        tx,
      )
    })
  }
}

/** Publishes a kept activity the import left as a draft (e.g. photos came after). */
async function publishKept(): Promise<void> {
  for (const slug of KEEP) {
    const [row] = await db
      .select()
      .from(activities)
      .where(and(eq(activities.slug, slug), isNull(activities.deletedAt)))
      .limit(1)
    if (!row || isPublicStatus(row.status)) continue
    log(`publishing ${slug} (was ${row.status})`)
    if (dryRun) continue
    await db.transaction(async (tx) => {
      // The owner reviewed and approved this content (Nov 2026 request).
      await tx.update(activities).set({ needsReview: false }).where(eq(activities.id, row.id))
      await assertPublishable(tx, row.id, t)
      await tx
        .update(activities)
        .set({ status: 'published', publishedAt: row.publishedAt ?? new Date() })
        .where(eq(activities.id, row.id))
      await writeAudit(
        {
          actor: SYSTEM,
          action: 'activity.publish',
          entityType: 'activity',
          entityId: row.id,
          before: { status: row.status, needsReview: row.needsReview },
          after: { status: 'published', needsReview: false, source: 'data-job' },
        },
        tx,
      )
    })
  }
}

/** Step 3: soft-delete everything else, exactly like Studio's deleteActivity. */
async function archiveOthers(): Promise<string[]> {
  const kept = await db
    .select({ slug: activities.slug, status: activities.status })
    .from(activities)
    .where(and(inArray(activities.slug, [...KEEP]), isNull(activities.deletedAt)))
  const ready = KEEP.every((slug) => kept.some((k) => k.slug === slug && isPublicStatus(k.status)))
  if (!ready && !dryRun) {
    throw new Error(
      `kept activities are not both live (${JSON.stringify(kept)}) — nothing deleted, will retry next deploy`,
    )
  }
  const doomed = await db
    .select()
    .from(activities)
    .where(and(isNull(activities.deletedAt), notInArray(activities.slug, [...KEEP])))
    .orderBy(asc(activities.slug))
  log(
    `archiving ${doomed.length} other activities: ${doomed.map((a) => `${a.slug}(${a.status})`).join(', ') || '—'}`,
  )
  if (dryRun) return doomed.map((a) => a.slug)
  await db.transaction(async (tx) => {
    for (const before of doomed) {
      const now = new Date()
      await tx
        .update(activities)
        .set({ deletedAt: now, status: 'draft' })
        .where(eq(activities.id, before.id))
      await writeAudit(
        {
          actor: SYSTEM,
          action: 'activity.delete',
          entityType: 'activity',
          entityId: before.id,
          before,
          after: { deletedAt: now.toISOString(), status: 'draft' },
        },
        tx,
      )
    }
  })
  return doomed.map((a) => a.slug)
}

async function main(): Promise<number> {
  if (await markerExists()) {
    log(`already done (${MARKER}) — nothing to do`)
    return 0
  }
  // Session-level lock on a dedicated connection (the pool would hand the
  // unlock to another backend).
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
    await importSheet()
    await attachPhotos()
    await publishKept()
    const archived = await archiveOthers()
    if (dryRun) return 0
    await db.insert(siteSettings).values({
      key: MARKER,
      value: { doneAt: new Date().toISOString(), kept: [...KEEP], archived },
    })
    log(`done: kept ${KEEP.join(', ')}; archived ${archived.length}`)
    return 0
  } finally {
    await lockConn`select pg_advisory_unlock(${LOCK_KEY})`
    await lockConn.end()
  }
}

main()
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    console.error('[replace-activities] FAILED:', error instanceof Error ? error.message : error)
    process.exit(strict ? 1 : 0)
  })
