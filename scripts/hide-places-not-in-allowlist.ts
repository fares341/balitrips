/**
 * Hide every map place that is NOT in the owner's allow-list (owner, Nov 2026:
 * "the map has places I never added — show only the ones I chose").
 *
 * Nothing is deleted or unpublished: the place gets `is_hidden = true`, which
 * takes it off the map and out of search for everyone (subscribers too) while
 * the row, its photos, favourites and trip links stay. Studio can show any
 * of them again one by one, or `--undo` puts the whole run back.
 *
 * DRY RUN BY DEFAULT — it reads the database and prints the plan, nothing is
 * written. Not wired into deploys; run it by hand inside the worker container:
 *
 *   node_modules/.bin/tsx --conditions=react-server \
 *     --require ./scripts/data-jobs/server-only-shim.cjs \
 *     scripts/hide-places-not-in-allowlist.ts --allow=/data/allow.csv \
 *     [--keep-category=activities,mosques] [--report=/data/hide-report.csv] [--apply]
 *
 *   … scripts/hide-places-not-in-allowlist.ts --undo=/data/hide-report.csv [--apply]
 *
 * --allow           CSV with a `slug` column (the map inventory CSV works; an
 *                   optional `keep` column limits it to rows marked yes), or
 *                   one slug per line.
 * --keep-category   category keys kept whole (e.g. the free sections).
 * --report          CSV of every place the run hides (default
 *                   ./hide-places-report-<time>.csv) — the input for --undo.
 * --apply           actually write. One `map_place.hide` (or `.unhide`) audit
 *                   row per place, in one transaction.
 *
 * Safety: refuses to write when the allow-list keeps no place at all (a wrong
 * file); slugs that match no place are listed in the dry run. The public map cache refreshes within
 * 60 s.
 */

import { readFileSync, writeFileSync } from 'node:fs'

import { and, eq, isNull } from 'drizzle-orm'

import { writeAudit } from '@/app/(admin)/_lib/audit'
import type { AdminSession } from '@/app/(admin)/_lib/session'
import { db } from '@/db'
import { categories, mapPlaces } from '@/db/schema'
import { parseAllowList, planHide, splitCsvLine, type PlaceRow } from '@/lib/map/allowlist'

const argv = process.argv.slice(2)
const flag = (name: string) => argv.includes(`--${name}`)
const value = (name: string) => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)

const apply = flag('apply')
const allowPath = value('allow')
const undoPath = value('undo')
const reportPath =
  value('report') ?? `./hide-places-report-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`
const keepCategories = new Set(
  (value('keep-category') ?? '')
    .split(',')
    .map((one) => one.trim())
    .filter(Boolean),
)

const log = (...parts: unknown[]) => console.log('[hide-places]', ...parts)

const SYSTEM: AdminSession = {
  userId: null as unknown as string,
  email: 'system@data-job',
  name: 'script: hide places not in allow-list',
  role: 'admin',
  sessionId: 'data-job',
  ipAddress: null,
}

async function loadPlaces(): Promise<PlaceRow[]> {
  const rows = await db
    .select({
      id: mapPlaces.id,
      slug: mapPlaces.slug,
      categoryKey: categories.key,
      isHidden: mapPlaces.isHidden,
    })
    .from(mapPlaces)
    .leftJoin(categories, eq(categories.id, mapPlaces.categoryId))
    .where(isNull(mapPlaces.deletedAt))
  return rows.map((row) => ({ ...row, categoryKey: row.categoryKey ?? null }))
}

function countBy(rows: readonly PlaceRow[]): string {
  const counts = new Map<string, number>()
  for (const row of rows)
    counts.set(row.categoryKey ?? '—', (counts.get(row.categoryKey ?? '—') ?? 0) + 1)
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([key, n]) => `${key}: ${n}`)
    .join(', ')
}

async function setHidden(rows: readonly PlaceRow[], hidden: boolean): Promise<void> {
  await db.transaction(async (tx) => {
    for (const row of rows) {
      await tx
        .update(mapPlaces)
        .set({ isHidden: hidden, updatedAt: new Date() })
        .where(and(eq(mapPlaces.id, row.id), eq(mapPlaces.isHidden, !hidden)))
      await writeAudit(
        {
          actor: SYSTEM,
          action: hidden ? 'map_place.hide' : 'map_place.unhide',
          entityType: 'map_place',
          entityId: row.id,
          before: { isHidden: !hidden },
          after: { isHidden: hidden },
        },
        tx,
      )
    }
  })
}

async function runHide(): Promise<number> {
  if (!allowPath) {
    log('missing --allow=<csv> (or --undo=<report.csv>)')
    return 1
  }
  const allow = parseAllowList(readFileSync(allowPath, 'utf8'))
  const places = await loadPlaces()
  const plan = planHide(places, allow.slugs, keepCategories)

  log(apply ? 'APPLY' : 'DRY RUN — nothing is written (add --apply to write)')
  log(
    `allow-list: ${allow.slugs.size} slugs; kept categories: ${[...keepCategories].join(', ') || '—'}`,
  )
  if (allow.skipped.length > 0) log(`ignored lines: ${allow.skipped.length}`)
  if (plan.unknown.length > 0) log(`allow-list slugs with no place: ${plan.unknown.join(', ')}`)
  log(`keep ${plan.keep.length} (${countBy(plan.keep)})`)
  log(`hide ${plan.hide.length} (${countBy(plan.hide)})`)
  log(`already hidden ${plan.alreadyHidden.length}`)

  writeFileSync(
    reportPath,
    'slug,id,category\n' +
      plan.hide.map((row) => `${row.slug},${row.id},${row.categoryKey ?? ''}`).join('\n') +
      '\n',
  )
  log(`report: ${reportPath}`)

  if (plan.keep.length === 0) {
    log('REFUSED: the allow-list keeps no place at all — check the file')
    return 1
  }
  if (!apply) return 0
  await setHidden(plan.hide, true)
  log(`done: hid ${plan.hide.length} places`)
  return 0
}

async function runUndo(path: string): Promise<number> {
  const lines = readFileSync(path, 'utf8').split(/\r?\n/).slice(1).filter(Boolean)
  const ids = lines.map((line) => splitCsvLine(line)[1]).filter((id): id is string => !!id)
  if (ids.length === 0) {
    log('nothing to undo')
    return 0
  }
  const rows = (await loadPlaces()).filter((row) => ids.includes(row.id) && row.isHidden)
  log(`${apply ? 'APPLY' : 'DRY RUN'} — show again ${rows.length} places (${countBy(rows)})`)
  if (!apply) return 0
  await setHidden(rows, false)
  log(`done: ${rows.length} places visible again`)
  return 0
}

;(undoPath ? runUndo(undoPath) : runHide())
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    console.error('[hide-places] FAILED:', error instanceof Error ? error.message : error)
    process.exit(1)
  })
