import 'server-only'

import { randomUUID } from 'node:crypto'

import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm'
import ExcelJS from 'exceljs'

import { db } from '@/db'
import {
  activities,
  activityAddons,
  activityCategories,
  activityImages,
  activityTiers,
  categories,
  media,
  regions,
} from '@/db/schema'
import type { Localized } from '@/db/schema/_shared'
import { can } from '@/lib/auth/roles'
import { isPublicStatus } from '@/lib/content/activity-status'
import {
  changedColumns,
  COLUMNS,
  csvColumns,
  csvLabel,
  gridToRows,
  joinList,
  listCells,
  mergeList,
  planRows,
  SHEET_DEFAULTS,
  SHEET_EXAMPLES,
  SHEET_KEYS,
  SHEET_TITLES,
  splitList,
  ACTIVITY_STATUS_VALUES,
  ADDON_PRICING_VALUES,
  PACKAGE_PRICING_VALUES,
  type Lookups,
  type Plan,
  type PlannedActivity,
  type Record_,
  type RowIssue,
  type SheetKey,
  type SheetRow,
} from '@/lib/content/activity-sheet'
import { parseCsv } from '@/lib/content/activity-import'
import { mediaUrl } from '@/lib/content/queries'
import { addonPricing, tierPricing } from '@/lib/booking/price'
import { formatMoneyInput, parseMoneyInput } from '@/lib/money-input'

import type { Translate } from '../../_i18n'
import { writeAudit } from '../../_lib/audit'
import { csvBody } from '../../_lib/csv'
import type { requireCapability } from '../../_lib/session'
import { assertPublishable } from '../activities/checklist'
import { fetchRemoteImage } from './remote-image'

type Session = Awaited<ReturnType<typeof requireCapability>>
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]
type ActivityRow = typeof activities.$inferSelect
type TierRow = typeof activityTiers.$inferSelect
type AddonRow = typeof activityAddons.$inferSelect
type FaqEntry = { q: Localized; a: Localized; hidden?: true; pkg?: string }

const EMPTY: Localized = { ar: '', en: '', id: '' }

// ---------------------------------------------------------------------------
// Stored → canonical records
// ---------------------------------------------------------------------------

/** Localized text columns: sheet base name → activity column. */
const TEXTS = {
  name: 'name',
  area: 'area',
  duration: 'duration',
  headline: 'headline',
  short: 'shortDescription',
  description: 'description',
  meeting: 'meetingPoint',
  meeting_time: 'meetingTimeNote',
  cancellation: 'cancellationPolicy',
} as const satisfies Record<string, keyof ActivityRow>

/** Localized list columns: sheet base name → activity column. */
const LISTS = {
  highlights: 'highlights',
  included: 'included',
  excluded: 'excluded',
  what_to_bring: 'whatToBring',
  age: 'ageConditions',
  notes: 'importantNotes',
} as const satisfies Record<string, keyof ActivityRow>

const money = (minor: number | null | undefined, currency: string) =>
  minor === null || minor === undefined ? '' : formatMoneyInput(minor, currency)
const yesNo = (value: boolean) => (value ? 'yes' : 'no')
const num = (value: number | null | undefined) =>
  value === null || value === undefined ? '' : String(value)

export interface Context {
  regionKey: Map<string, string>
  regionId: Map<string, string>
  categoryKey: Map<string, string>
  categoryId: Map<string, string>
  lookups: Lookups
}

export async function loadContext(): Promise<Context> {
  const [regionRows, categoryRows] = await Promise.all([
    db.select({ id: regions.id, key: regions.key }).from(regions).orderBy(asc(regions.sortOrder)),
    db
      .select({ id: categories.id, key: categories.key })
      .from(categories)
      .orderBy(asc(categories.sortOrder)),
  ])
  return {
    regionKey: new Map(regionRows.map((row) => [row.id, row.key])),
    regionId: new Map(regionRows.map((row) => [row.key, row.id])),
    categoryKey: new Map(categoryRows.map((row) => [row.id, row.key])),
    categoryId: new Map(categoryRows.map((row) => [row.key, row.id])),
    lookups: {
      regions: new Set(regionRows.map((row) => row.key)),
      categories: new Set(categoryRows.map((row) => row.key)),
    },
  }
}

export interface StoredActivity {
  row: ActivityRow
  record: Record_
  categoryIds: string[]
  galleryIds: string[]
  tiers: Map<string, { row: TierRow; record: Record_ }>
  addons: Map<string, { row: AddonRow; record: Record_ }>
  faq: Map<string, { index: number; record: Record_ }>
}

function activityRecord(
  row: ActivityRow,
  ctx: Context,
  categoryIds: readonly string[],
  hero: string | null,
  gallery: readonly string[],
): Record_ {
  const record: Record_ = {
    activity_slug: row.slug,
    status: row.status,
    name_id: row.name?.id ?? '',
    region: row.regionId ? (ctx.regionKey.get(row.regionId) ?? '') : '',
    category: row.primaryCategoryId ? (ctx.categoryKey.get(row.primaryCategoryId) ?? '') : '',
    extra_categories: joinList(
      categoryIds
        .filter((id) => id !== row.primaryCategoryId)
        .map((id) => ctx.categoryKey.get(id) ?? '')
        .filter((key) => key !== ''),
    ),
    price: money(row.priceMinor, row.currency),
    currency: row.currency,
    min_guests: num(row.minGuests),
    max_guests: num(row.maxGuests),
    lead_time_hours: num(row.leadTimeHours),
    time_slots: joinList([...(row.timeSlots ?? [])].sort()),
    map_url: row.meetingMapUrl ?? '',
    lat: num(row.meetingLat),
    lng: num(row.meetingLng),
    free_cancel_hours: num(row.freeCancellationHours),
    instant_confirmation: yesNo(row.instantConfirmation),
    featured: yesNo(row.isFeatured),
    hero_image_url: hero ?? '',
    gallery_urls: joinList(gallery),
  }
  for (const [base, column] of Object.entries(TEXTS)) {
    const value = row[column] as Localized | null
    record[`${base}_ar`] = (value?.ar ?? '').trim().replace(/\r\n/g, '\n')
    record[`${base}_en`] = (value?.en ?? '').trim().replace(/\r\n/g, '\n')
  }
  for (const [base, column] of Object.entries(LISTS)) {
    const cells = listCells(row[column] as Localized[] | null)
    record[`${base}_ar`] = cells.ar
    record[`${base}_en`] = cells.en
  }
  return record
}

function tierRecord(row: TierRow, slug: string, currency: string): Record_ {
  const includes = listCells(row.includes)
  const excludes = listCells(row.excludes)
  const features = listCells(row.features)
  return {
    activity_slug: slug,
    package_key: row.key,
    name_ar: (row.name?.ar ?? '').trim(),
    name_en: (row.name?.en ?? '').trim(),
    // Old spellings (before migration 0013) read as `tierPricing()` does.
    pricing: tierPricing(row.pricingMode),
    price: money(row.priceMinor, currency),
    compare_at: money(row.compareAtPriceMinor, currency),
    child_price: money(row.childPriceMinor, currency),
    included_persons: num(row.groupMax),
    min_guests: num(row.minGuests),
    max_guests: num(row.maxGuests),
    popular: yesNo(row.isPopular),
    available: yesNo(row.available),
    includes_ar: includes.ar,
    includes_en: includes.en,
    excludes_ar: excludes.ar,
    excludes_en: excludes.en,
    features_ar: features.ar,
    features_en: features.en,
  }
}

function addonRecord(row: AddonRow, slug: string, currency: string): Record_ {
  return {
    activity_slug: slug,
    name_ar: (row.name?.ar ?? '').trim(),
    name_en: (row.name?.en ?? '').trim(),
    pricing: addonPricing(row.pricing),
    price: money(row.priceMinor, currency),
    max_qty: num(row.maxQty),
    available: yesNo(row.available),
  }
}

function faqRecord(entry: FaqEntry, slug: string): Record_ {
  return {
    activity_slug: slug,
    question_ar: (entry.q?.ar ?? '').trim(),
    question_en: (entry.q?.en ?? '').trim(),
    answer_ar: (entry.a?.ar ?? '').trim(),
    answer_en: (entry.a?.en ?? '').trim(),
  }
}

const addonMatch = (record: Record_) =>
  (record.name_en || record.name_ar || '').trim().toLowerCase()
const faqMatch = (record: Record_) =>
  (record.question_ar || record.question_en || '').trim().toLowerCase()

/**
 * Stored activities (not deleted) with their children, keyed by slug.
 * `filter`: only these ids (export of a selection) — null = all.
 */
export async function loadStored(
  ctx: Context,
  filter: { ids?: readonly string[]; slugs?: readonly string[] } | null = null,
  executor: Pick<typeof db, 'select'> = db,
): Promise<Map<string, StoredActivity>> {
  const conditions = [isNull(activities.deletedAt)]
  if (filter?.ids) conditions.push(inArray(activities.id, [...filter.ids, randomUUID()]))
  if (filter?.slugs) conditions.push(inArray(activities.slug, [...filter.slugs, '']))
  const rows = await executor
    .select()
    .from(activities)
    .where(and(...conditions))
    .orderBy(asc(activities.sortOrder), asc(activities.slug))
  const ids = rows.map((row) => row.id)
  const out = new Map<string, StoredActivity>()
  if (ids.length === 0) return out

  const [catRows, galleryRows, tierRows, addonRows] = await Promise.all([
    executor.select().from(activityCategories).where(inArray(activityCategories.activityId, ids)),
    executor
      .select({
        activityId: activityImages.activityId,
        mediaId: activityImages.mediaId,
        objectKey: media.objectKey,
      })
      .from(activityImages)
      .innerJoin(media, eq(media.id, activityImages.mediaId))
      .where(and(inArray(activityImages.activityId, ids), isNull(media.deletedAt)))
      .orderBy(asc(activityImages.sortOrder)),
    executor
      .select()
      .from(activityTiers)
      .where(and(inArray(activityTiers.activityId, ids), isNull(activityTiers.deletedAt)))
      .orderBy(asc(activityTiers.sortOrder)),
    executor
      .select()
      .from(activityAddons)
      .where(and(inArray(activityAddons.activityId, ids), isNull(activityAddons.deletedAt)))
      .orderBy(asc(activityAddons.sortOrder)),
  ])
  const heroIds = rows.map((row) => row.heroImageId).filter((id): id is string => id !== null)
  const heroRows =
    heroIds.length > 0
      ? await executor
          .select({ id: media.id, objectKey: media.objectKey })
          .from(media)
          .where(and(inArray(media.id, heroIds), isNull(media.deletedAt)))
      : []
  const heroUrl = new Map(heroRows.map((row) => [row.id, mediaUrl(row.objectKey)]))

  for (const row of rows) {
    const cats = catRows.filter((c) => c.activityId === row.id).map((c) => c.categoryId)
    const gallery = galleryRows.filter((g) => g.activityId === row.id)
    const stored: StoredActivity = {
      row,
      record: activityRecord(
        row,
        ctx,
        cats,
        row.heroImageId ? (heroUrl.get(row.heroImageId) ?? null) : null,
        gallery.map((g) => mediaUrl(g.objectKey)),
      ),
      categoryIds: cats,
      galleryIds: gallery.map((g) => g.mediaId),
      tiers: new Map(),
      addons: new Map(),
      faq: new Map(),
    }
    for (const tier of tierRows.filter((t) => t.activityId === row.id)) {
      stored.tiers.set(tier.key, { row: tier, record: tierRecord(tier, row.slug, row.currency) })
    }
    for (const addon of addonRows.filter((a) => a.activityId === row.id)) {
      const record = addonRecord(addon, row.slug, row.currency)
      const key = addonMatch(record)
      if (!stored.addons.has(key)) stored.addons.set(key, { row: addon, record })
    }
    ;((row.faq ?? []) as FaqEntry[]).forEach((entry, index) => {
      const record = faqRecord(entry, row.slug)
      const key = faqMatch(record)
      if (key !== '' && !stored.faq.has(key)) stored.faq.set(key, { index, record })
    })
    out.set(row.slug, stored)
  }
  return out
}

// ---------------------------------------------------------------------------
// Writing files
// ---------------------------------------------------------------------------

export interface SheetData {
  activities: Record_[]
  packages: Record_[]
  addons: Record_[]
  faq: Record_[]
}

export function storedToSheets(stored: Iterable<StoredActivity>): SheetData {
  const data: SheetData = { activities: [], packages: [], addons: [], faq: [] }
  for (const item of stored) {
    data.activities.push(item.record)
    for (const tier of item.tiers.values()) data.packages.push(tier.record)
    for (const addon of item.addons.values()) data.addons.push(addon.record)
    for (const entry of item.faq.values()) data.faq.push(entry.record)
  }
  return data
}

const LIST_COLUMN = {
  status: 'A',
  pkg_pricing: 'B',
  addon_pricing: 'C',
  region: 'D',
  category: 'E',
  bool: 'F',
} as const

/** The workbook: instructions, the four sheets (Arabic labels + key row), dropdowns. */
export async function buildWorkbook(data: SheetData, t: Translate, ctx: Context): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Bali Trips Studio'
  workbook.created = new Date()

  const help = workbook.addWorksheet('Instructions', { views: [{ rightToLeft: true }] })
  help.getColumn(1).width = 110
  const lines = t('sh.instructions').split('\n')
  help.addRow([t('sh.instructions_title')]).font = { bold: true, size: 14 }
  for (const line of lines) help.addRow([line])
  help.addRow([])
  help.addRow([t('sh.instructions_values')]).font = { bold: true }
  help.addRow([`status: ${ACTIVITY_STATUS_VALUES.join(', ')}`])
  help.addRow([`Packages pricing: ${PACKAGE_PRICING_VALUES.join(', ')}`])
  help.addRow([`AddOns pricing: ${ADDON_PRICING_VALUES.join(', ')}`])
  help.addRow([`region: ${[...ctx.lookups.regions].join(', ')}`])
  help.addRow([`category: ${[...ctx.lookups.categories].join(', ')}`])

  const lists = workbook.addWorksheet('Lists', { state: 'veryHidden' })
  const listValues: Record<keyof typeof LIST_COLUMN, readonly string[]> = {
    status: ACTIVITY_STATUS_VALUES,
    pkg_pricing: PACKAGE_PRICING_VALUES,
    addon_pricing: ADDON_PRICING_VALUES,
    region: [...ctx.lookups.regions],
    category: [...ctx.lookups.categories],
    bool: ['yes', 'no'],
  }
  for (const [kind, letter] of Object.entries(LIST_COLUMN)) {
    const values = listValues[kind as keyof typeof LIST_COLUMN]
    values.forEach((value, index) => {
      lists.getCell(`${letter}${index + 1}`).value = value
    })
  }

  for (const sheet of SHEET_KEYS) {
    const ws = workbook.addWorksheet(SHEET_TITLES[sheet].tab, {
      views: [{ state: 'frozen', ySplit: 2, xSplit: 1 }],
    })
    const columns = COLUMNS[sheet]
    const labels = ws.addRow(columns.map((column) => column.ar))
    labels.font = { bold: true }
    labels.alignment = { wrapText: true, vertical: 'top', readingOrder: 'rtl' }
    labels.height = 36
    const keys = ws.addRow(columns.map((column) => column.key))
    keys.font = { color: { argb: 'FF6B7280' }, italic: true }
    columns.forEach((column, index) => {
      ws.getColumn(index + 1).width = Math.min(
        48,
        Math.max(14, column.ar.length + 2, column.key.length + 2),
      )
      // Keep numbers as typed text in the file (no «1e+21», no lost zeros).
      ws.getColumn(index + 1).numFmt = '@'
    })
    labels.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } }
    })
    const rows = data[sheet].length > 0 ? data[sheet] : [SHEET_EXAMPLES[sheet]]
    for (const record of rows) ws.addRow(columns.map((column) => record[column.key] ?? ''))

    // Dropdowns on the first 500 data rows.
    const last = Math.max(rows.length + 2, 502)
    columns.forEach((column, index) => {
      const kind =
        column.kind === 'status'
          ? 'status'
          : column.kind === 'pkg_pricing'
            ? 'pkg_pricing'
            : column.kind === 'addon_pricing'
              ? 'addon_pricing'
              : column.kind === 'region'
                ? 'region'
                : column.kind === 'category'
                  ? 'category'
                  : column.kind === 'bool'
                    ? 'bool'
                    : null
      if (kind === null) return
      const count = Math.max(1, listValues[kind].length)
      const letter = LIST_COLUMN[kind]
      for (let r = 3; r <= last; r += 1) {
        ws.getCell(r, index + 1).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [`Lists!$${letter}$1:$${letter}$${count}`],
          showErrorMessage: true,
          errorTitle: t('sh.dropdown_title'),
          error: t('sh.dropdown_error'),
        }
      }
    })
  }
  const buffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(buffer as ArrayBuffer)
}

/** One CSV: an Arabic label line, the key line, then rows with `type`. */
export function buildCsv(data: SheetData): string {
  const columns = csvColumns()
  const rows: string[][] = [columns]
  for (const sheet of SHEET_KEYS) {
    const records = data[sheet].length > 0 ? data[sheet] : [SHEET_EXAMPLES[sheet]]
    for (const record of records) {
      rows.push(
        columns.map((key) => (key === 'type' ? SHEET_TITLES[sheet].type : (record[key] ?? ''))),
      )
    }
  }
  return csvBody(
    columns.map((key) => csvLabel(key)),
    rows,
  )
}

// ---------------------------------------------------------------------------
// Reading files
// ---------------------------------------------------------------------------

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (typeof value === 'object') {
    if ('richText' in value) return value.richText.map((part) => part.text).join('')
    if ('text' in value && typeof value.text === 'string') return value.text
    if ('result' in value) return cellText(value.result as ExcelJS.CellValue)
    if ('error' in value) return ''
    return ''
  }
  return String(value)
}

export const MAX_FILE_BYTES = 5 * 1024 * 1024

/** An uploaded .xlsx or .csv → rows of every sheet. */
export async function readUpload(
  name: string,
  bytes: Uint8Array,
): Promise<{ rows: SheetRow[]; issues: RowIssue[] }> {
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b
  if (!isZip) {
    const text = new TextDecoder('utf-8').decode(bytes)
    // csvCell() guards formula-looking cells with a leading «'»: undo it.
    const grid = parseCsv(text).map((row) =>
      row.map((cell) => (/^'[=+\-@]/.test(cell) ? cell.slice(1) : cell)),
    )
    return gridToRows(grid, null)
  }
  const workbook = new ExcelJS.Workbook()
  try {
    await workbook.xlsx.load(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
    )
  } catch {
    return { rows: [], issues: [{ sheet: 'file', line: 1, code: 'unreadable', value: name }] }
  }
  const rows: SheetRow[] = []
  const issues: RowIssue[] = []
  let found = 0
  for (const sheet of SHEET_KEYS) {
    const wanted = SHEET_TITLES[sheet]
    const ws = workbook.worksheets.find((candidate) => {
      const title = candidate.name.trim().toLowerCase()
      return (
        title === wanted.tab.toLowerCase() ||
        title === wanted.ar ||
        title === `${wanted.tab.toLowerCase()}s`
      )
    })
    if (!ws) continue
    found += 1
    const grid: string[][] = []
    ws.eachRow({ includeEmpty: true }, (row, rowNumber) => {
      const values = row.values as ExcelJS.CellValue[]
      const cells: string[] = []
      for (let i = 1; i < Math.max(values.length, 2); i += 1) cells.push(cellText(values[i]))
      grid[rowNumber - 1] = cells
    })
    for (let i = 0; i < grid.length; i += 1) grid[i] ??= []
    const result = gridToRows(grid, sheet)
    rows.push(...result.rows)
    issues.push(...result.issues)
  }
  if (found === 0) issues.push({ sheet: 'file', line: 1, code: 'no_sheets' })
  return { rows, issues }
}

// ---------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------

export interface PreviewItem {
  slug: string
  name: string
  kind: 'new' | 'update' | 'same'
  changes: string[]
  warnings: string[]
}

export interface Preview {
  items: PreviewItem[]
  issues: string[]
  counts: { new: number; update: number; same: number; errors: number }
}

const MONEY_COLUMNS = new Set(['price', 'compare_at', 'child_price', 'currency'])

export function issueText(issue: RowIssue, t: Translate): string {
  const where =
    issue.sheet === 'file'
      ? t('sh.where_file', { line: issue.line })
      : t('sh.where', { sheet: SHEET_TITLES[issue.sheet].tab, line: issue.line })
  const column = issue.column ? t('sh.column', { column: issue.column }) : ''
  return `${where}${column}: ${t(`sh.err_${issue.code}`, { value: issue.value ?? '' })}`
}

/** What applying `plan` would do, child changes included, without writing. */
export function previewPlan(
  plan: Plan,
  stored: ReadonlyMap<string, StoredActivity>,
  archivedSlugs: ReadonlySet<string>,
  session: Session,
  t: Translate,
): { preview: Preview; blocking: RowIssue[] } {
  const blocking: RowIssue[] = [...plan.issues]
  const items: PreviewItem[] = []
  const prices = can(session.role, 'prices.write')
  const publish = can(session.role, 'content.publish')

  for (const item of plan.activities) {
    const before = stored.get(item.slug) ?? null
    if (!before && archivedSlugs.has(item.slug)) {
      blocking.push({
        sheet: 'activities',
        line: item.line,
        code: 'archived_slug',
        value: item.slug,
      })
      continue
    }
    const changes: string[] = []
    const warnings: string[] = []
    const own = changedColumns(
      item.values,
      item.columns,
      before?.record ?? null,
      SHEET_DEFAULTS.activities,
    )
    changes.push(...own)
    for (const pkg of item.packages) {
      const old = before?.tiers.get(pkg.match)?.record ?? null
      const diff = changedColumns(pkg.values, pkg.columns, old, SHEET_DEFAULTS.packages)
      if (!old) changes.push(t('sh.new_package', { key: pkg.match }))
      else if (diff.length > 0)
        changes.push(`${t('sh.package', { key: pkg.match })}: ${diff.join(', ')}`)
      if (!prices && diff.some((key) => MONEY_COLUMNS.has(key))) {
        blocking.push({ sheet: 'packages', line: pkg.line, code: 'prices_locked' })
      }
    }
    for (const addon of item.addons) {
      const old = before?.addons.get(addon.match)?.record ?? null
      const diff = changedColumns(addon.values, addon.columns, old, SHEET_DEFAULTS.addons)
      if (!old) changes.push(t('sh.new_addon', { name: addon.match }))
      else if (diff.length > 0)
        changes.push(`${t('sh.addon', { name: addon.match })}: ${diff.join(', ')}`)
      if (!prices && diff.some((key) => MONEY_COLUMNS.has(key))) {
        blocking.push({ sheet: 'addons', line: addon.line, code: 'prices_locked' })
      }
    }
    for (const entry of item.faq) {
      const old = before?.faq.get(entry.match)?.record ?? null
      const diff = changedColumns(entry.values, entry.columns, old)
      if (!old) changes.push(t('sh.new_question'))
      else if (diff.length > 0) changes.push(`${t('sh.question')}: ${diff.join(', ')}`)
    }
    if (!prices && own.some((key) => MONEY_COLUMNS.has(key))) {
      blocking.push({ sheet: 'activities', line: item.line, code: 'prices_locked' })
    }
    const status = item.values.status
    if (own.includes('status') && status && isPublicStatus(status) && !publish) {
      blocking.push({
        sheet: 'activities',
        line: item.line,
        column: 'status',
        code: 'publish_locked',
      })
    }
    if (!before && status && isPublicStatus(status)) warnings.push(t('sh.warn_publish_check'))
    for (const key of ['hero_image_url', 'gallery_urls']) {
      if (own.includes(key) && item.values[key]) warnings.push(t('sh.warn_images'))
    }
    const name =
      item.values.name_ar ||
      item.values.name_en ||
      before?.record.name_ar ||
      before?.record.name_en ||
      item.slug
    items.push({
      slug: item.slug,
      name,
      kind: !before ? 'new' : changes.length > 0 ? 'update' : 'same',
      changes,
      warnings: [...new Set(warnings)],
    })
  }
  return {
    preview: {
      items,
      issues: blocking.map((issue) => issueText(issue, t)),
      counts: {
        new: items.filter((i) => i.kind === 'new').length,
        update: items.filter((i) => i.kind === 'update').length,
        same: items.filter((i) => i.kind === 'same').length,
        errors: blocking.length,
      },
    },
    blocking,
  }
}

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

function loc(values: Record_, columns: readonly string[], base: string, before: Localized | null) {
  const has = (key: string) => columns.includes(key)
  const next: Localized = {
    ar: has(`${base}_ar`) ? (values[`${base}_ar`] ?? '') : (before?.ar ?? ''),
    en: has(`${base}_en`) ? (values[`${base}_en`] ?? '') : (before?.en ?? ''),
    id: has(`${base}_id`) ? (values[`${base}_id`] ?? '') : (before?.id ?? ''),
  }
  return next.ar === '' && next.en === '' && next.id === '' ? null : next
}

function minor(value: string | undefined, currency: string): number | null {
  if (!value) return null
  const parsed = parseMoneyInput(value, currency)
  return parsed.ok ? parsed.value : null
}

const intOr = (value: string | undefined, fallback: number | null) =>
  value === undefined || value === '' ? fallback : Number(value)

/** Downloads every new image URL of the plan (before the transaction). */
export async function fetchImages(
  plan: Plan,
  stored: ReadonlyMap<string, StoredActivity>,
  session: Session,
): Promise<{ ids: Map<string, string>; failed: { url: string; reason: string }[] }> {
  const ids = new Map<string, string>()
  const failed: { url: string; reason: string }[] = []
  // Already in the library: the exported URLs point at our own media.
  const known = new Map<string, string>()
  for (const item of stored.values()) {
    if (item.row.heroImageId && item.record.hero_image_url) {
      known.set(item.record.hero_image_url, item.row.heroImageId)
    }
    splitList(item.record.gallery_urls ?? '').forEach((url, index) => {
      const id = item.galleryIds[index]
      if (url && id) known.set(url, id)
    })
  }
  const wanted = new Set<string>()
  for (const item of plan.activities) {
    const before = stored.get(item.slug)
    if (item.columns.includes('hero_image_url') && item.values.hero_image_url) {
      if (item.values.hero_image_url !== before?.record.hero_image_url)
        wanted.add(item.values.hero_image_url)
    }
    if (
      item.columns.includes('gallery_urls') &&
      item.values.gallery_urls !== before?.record.gallery_urls
    ) {
      for (const url of splitList(item.values.gallery_urls ?? '')) if (url) wanted.add(url)
    }
  }
  for (const url of wanted) {
    if (known.has(url)) {
      ids.set(url, known.get(url) as string)
      continue
    }
    const result = await fetchRemoteImage(url, session)
    if ('id' in result) ids.set(url, result.id)
    else failed.push({ url, reason: result.reason })
  }
  return { ids, failed }
}

/** Writes the plan in one transaction. Never deletes anything. */
export async function applyPlan(
  plan: Plan,
  ctx: Context,
  session: Session,
  t: Translate,
  images: Map<string, string>,
): Promise<{ created: number; updated: number; warnings: string[] }> {
  const warnings: string[] = []
  let created = 0
  let updated = 0
  await db.transaction(async (tx) => {
    const stored = await loadStored(ctx, { slugs: plan.activities.map((a) => a.slug) }, tx)
    const [last] = await tx
      .select({ sortOrder: activities.sortOrder })
      .from(activities)
      .orderBy(sql`${activities.sortOrder} desc`)
      .limit(1)
    let sortOrder = (last?.sortOrder ?? -1) + 1

    for (const item of plan.activities) {
      const before = stored.get(item.slug) ?? null
      const own = changedColumns(
        item.values,
        item.columns,
        before?.record ?? null,
        SHEET_DEFAULTS.activities,
      )
      const childChanges = item.packages.length + item.addons.length + item.faq.length > 0
      if (before && own.length === 0 && !childChanges) continue
      const result = await applyActivity(tx, item, before, own, ctx, session, t, images, sortOrder)
      if (!before) sortOrder += 1
      warnings.push(...result.warnings)
      if (result.created) created += 1
      else if (result.changed) updated += 1
    }
    await writeAudit(
      {
        actor: session,
        action: 'activity.import',
        entityType: 'activity',
        entityId: null,
        before: null,
        after: { slugs: plan.activities.map((a) => a.slug), created, updated },
      },
      tx,
    )
  })
  return { created, updated, warnings }
}

async function applyActivity(
  tx: Tx,
  item: PlannedActivity,
  before: StoredActivity | null,
  own: readonly string[],
  ctx: Context,
  session: Session,
  t: Translate,
  images: Map<string, string>,
  sortOrder: number,
): Promise<{ created: boolean; changed: boolean; warnings: string[] }> {
  const warnings: string[] = []
  const v = item.values
  const cols = item.columns
  const touched = (key: string) =>
    before ? own.includes(key) : cols.includes(key) && v[key] !== ''
  const currency = (touched('currency') ? v.currency : before?.row.currency) || 'USD'
  const patch: Partial<typeof activities.$inferInsert> = {}

  for (const [base, column] of Object.entries(TEXTS)) {
    if ([`${base}_ar`, `${base}_en`, `${base}_id`].some(touched)) {
      const value = loc(v, cols, base, (before?.row[column] as Localized | null) ?? null)
      if (column === 'name') patch.name = value ?? before?.row.name ?? EMPTY
      else (patch as Record<string, unknown>)[column] = value
    }
  }
  for (const [base, column] of Object.entries(LISTS)) {
    if ([`${base}_ar`, `${base}_en`].some(touched)) {
      const old = (before?.row[column] as Localized[] | null) ?? []
      const cells = listCells(old)
      ;(patch as Record<string, unknown>)[column] = mergeList(
        old,
        cols.includes(`${base}_ar`) ? (v[`${base}_ar`] ?? '') : cells.ar,
        cols.includes(`${base}_en`) ? (v[`${base}_en`] ?? '') : cells.en,
      )
    }
  }
  if (touched('region')) patch.regionId = v.region ? (ctx.regionId.get(v.region) ?? null) : null
  if (touched('category')) {
    patch.primaryCategoryId = v.category ? (ctx.categoryId.get(v.category) ?? null) : null
  }
  if (touched('currency')) patch.currency = currency
  if (touched('price') || touched('currency')) {
    patch.priceMinor = minor(cols.includes('price') ? v.price : before?.record.price, currency) ?? 0
  }
  if (touched('min_guests')) patch.minGuests = intOr(v.min_guests, 1) ?? 1
  if (touched('max_guests')) patch.maxGuests = intOr(v.max_guests, 20) ?? 20
  if (touched('lead_time_hours')) patch.leadTimeHours = intOr(v.lead_time_hours, 24) ?? 24
  if (touched('time_slots')) patch.timeSlots = splitList(v.time_slots ?? '').filter(Boolean)
  if (touched('map_url')) patch.meetingMapUrl = v.map_url || null
  if (touched('lat') || touched('lng')) {
    patch.meetingLat = v.lat ? Number(v.lat) : null
    patch.meetingLng = v.lng ? Number(v.lng) : null
  }
  if (touched('free_cancel_hours')) patch.freeCancellationHours = intOr(v.free_cancel_hours, null)
  if (touched('instant_confirmation')) patch.instantConfirmation = v.instant_confirmation === 'yes'
  if (touched('featured')) patch.isFeatured = v.featured === 'yes'
  if (touched('hero_image_url')) {
    const id = v.hero_image_url ? images.get(v.hero_image_url) : null
    if (v.hero_image_url && !id)
      warnings.push(t('sh.warn_image_skipped', { slug: item.slug, url: v.hero_image_url }))
    else patch.heroImageId = id ?? null
  }

  const wantStatus = touched('status') ? v.status : null
  let row: ActivityRow
  const created = before === null
  if (before === null) {
    const [inserted] = await tx
      .insert(activities)
      .values({
        ...patch,
        slug: item.slug,
        name: patch.name ?? EMPTY,
        priceMinor: patch.priceMinor ?? 0,
        currency,
        timeSlots: patch.timeSlots ?? [],
        status: 'draft',
        needsReview: wantStatus === null || !isPublicStatus(wantStatus),
        sortOrder,
      })
      .returning()
    if (!inserted) throw new Error(t('activities.err_save_failed'))
    row = inserted
  } else {
    row = before.row
    if (Object.keys(patch).length > 0) {
      const [next] = await tx
        .update(activities)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(activities.id, before.row.id))
        .returning()
      if (next) row = next
    }
  }

  // Categories: the main one plus the extras.
  if (touched('category') || touched('extra_categories')) {
    const primary = row.primaryCategoryId
    const extras = cols.includes('extra_categories')
      ? splitList(v.extra_categories ?? '')
          .map((key) => ctx.categoryId.get(key))
          .filter((id): id is string => Boolean(id))
      : (before?.categoryIds ?? []).filter((id) => id !== before?.row.primaryCategoryId)
    const ids = [...new Set([...(primary ? [primary] : []), ...extras])]
    await tx.delete(activityCategories).where(eq(activityCategories.activityId, row.id))
    if (ids.length > 0) {
      await tx
        .insert(activityCategories)
        .values(ids.map((categoryId) => ({ activityId: row.id, categoryId })))
    }
  } else if (created && row.primaryCategoryId) {
    await tx
      .insert(activityCategories)
      .values({ activityId: row.id, categoryId: row.primaryCategoryId })
  }

  if (touched('gallery_urls')) {
    const urls = splitList(v.gallery_urls ?? '').filter(Boolean)
    const ids = urls.map((url) => images.get(url)).filter((id): id is string => Boolean(id))
    if (ids.length < urls.length)
      warnings.push(
        t('sh.warn_image_skipped', {
          slug: item.slug,
          url: urls.filter((u) => !images.has(u)).join(' '),
        }),
      )
    await tx.delete(activityImages).where(eq(activityImages.activityId, row.id))
    if (ids.length > 0) {
      await tx.insert(activityImages).values(
        [...new Set(ids)].map((mediaId, index) => ({
          activityId: row.id,
          mediaId,
          sortOrder: index,
        })),
      )
    }
  }

  let childChanged = false
  // Packages.
  let tierOrder = before ? before.tiers.size : 0
  for (const pkg of item.packages) {
    const old = before?.tiers.get(pkg.match) ?? null
    const diff = changedColumns(
      pkg.values,
      pkg.columns,
      old?.record ?? null,
      SHEET_DEFAULTS.packages,
    )
    if (old && diff.length === 0) continue
    const p = pkg.values
    const has = (key: string) =>
      old ? diff.includes(key) : pkg.columns.includes(key) && p[key] !== ''
    const values: Partial<typeof activityTiers.$inferInsert> = {}
    if (has('name_ar') || has('name_en'))
      values.name = loc(p, pkg.columns, 'name', old?.row.name ?? null) ?? EMPTY
    if (has('pricing')) values.pricingMode = p.pricing || 'per_person'
    if (has('price')) values.priceMinor = minor(p.price, row.currency) ?? 0
    if (has('compare_at')) values.compareAtPriceMinor = minor(p.compare_at, row.currency)
    if (has('child_price')) values.childPriceMinor = minor(p.child_price, row.currency)
    if (has('included_persons')) values.groupMax = intOr(p.included_persons, null)
    if (has('min_guests')) values.minGuests = intOr(p.min_guests, null)
    if (has('max_guests')) values.maxGuests = intOr(p.max_guests, null)
    if (has('popular')) values.isPopular = p.popular === 'yes'
    if (has('available')) values.available = p.available !== 'no'
    for (const base of ['includes', 'excludes', 'features'] as const) {
      if (has(`${base}_ar`) || has(`${base}_en`)) {
        const oldList = old?.row[base] ?? []
        const cells = listCells(oldList)
        values[base] = mergeList(
          oldList,
          pkg.columns.includes(`${base}_ar`) ? (p[`${base}_ar`] ?? '') : cells.ar,
          pkg.columns.includes(`${base}_en`) ? (p[`${base}_en`] ?? '') : cells.en,
        )
      }
    }
    let tierId: string
    if (old) {
      await tx
        .update(activityTiers)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(activityTiers.id, old.row.id))
      tierId = old.row.id
    } else {
      const [inserted] = await tx
        .insert(activityTiers)
        .values({
          ...values,
          activityId: row.id,
          key: pkg.match,
          name: values.name ?? { ar: '', en: pkg.match, id: '' },
          priceMinor: values.priceMinor ?? 0,
          currency: row.currency,
          sortOrder: tierOrder,
          status: 'published',
          publishedAt: new Date(),
        })
        .returning({ id: activityTiers.id })
      tierOrder += 1
      if (!inserted) continue
      tierId = inserted.id
    }
    if (values.isPopular) {
      await tx
        .update(activityTiers)
        .set({ isPopular: false })
        .where(and(eq(activityTiers.activityId, row.id), sql`${activityTiers.id} <> ${tierId}`))
    }
    childChanged = true
  }

  // Add-ons.
  let addonOrder = before ? before.addons.size : 0
  for (const addon of item.addons) {
    const old = before?.addons.get(addon.match) ?? null
    const diff = changedColumns(
      addon.values,
      addon.columns,
      old?.record ?? null,
      SHEET_DEFAULTS.addons,
    )
    if (old && diff.length === 0) continue
    const a = addon.values
    const has = (key: string) =>
      old ? diff.includes(key) : addon.columns.includes(key) && a[key] !== ''
    const values: Partial<typeof activityAddons.$inferInsert> = {}
    if (has('name_ar') || has('name_en'))
      values.name = loc(a, addon.columns, 'name', old?.row.name ?? null) ?? EMPTY
    if (has('pricing')) values.pricing = a.pricing || 'per_booking'
    if (has('price')) values.priceMinor = minor(a.price, row.currency) ?? 0
    if (has('max_qty')) values.maxQty = intOr(a.max_qty, null)
    if (has('available')) values.available = a.available !== 'no'
    if (old) {
      await tx
        .update(activityAddons)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(activityAddons.id, old.row.id))
    } else {
      await tx.insert(activityAddons).values({
        ...values,
        activityId: row.id,
        name: values.name ?? EMPTY,
        priceMinor: values.priceMinor ?? 0,
        currency: row.currency,
        sortOrder: addonOrder,
      })
      addonOrder += 1
    }
    childChanged = true
  }

  // Questions (a jsonb list on the activity).
  if (item.faq.length > 0) {
    const list = [...((row.faq ?? []) as FaqEntry[])]
    let faqChanged = false
    for (const entry of item.faq) {
      const old = before?.faq.get(entry.match) ?? null
      const diff = changedColumns(entry.values, entry.columns, old?.record ?? null)
      if (old && diff.length === 0) continue
      const f = entry.values
      const prev = old ? list[old.index] : undefined
      const next: FaqEntry = {
        ...(prev ?? {}),
        q: loc(f, entry.columns, 'question', prev?.q ?? null) ?? EMPTY,
        a: loc(f, entry.columns, 'answer', prev?.a ?? null) ?? EMPTY,
      }
      if (old) list[old.index] = next
      else list.push(next)
      faqChanged = true
    }
    if (faqChanged) {
      await tx
        .update(activities)
        .set({ faq: list, updatedAt: new Date() })
        .where(eq(activities.id, row.id))
      childChanged = true
    }
  }

  // Status last: going public needs the checklist (packages now exist).
  let statusChanged = false
  if (wantStatus !== null && wantStatus !== row.status) {
    if (isPublicStatus(wantStatus) && !isPublicStatus(row.status)) {
      try {
        if (created)
          await tx.update(activities).set({ needsReview: false }).where(eq(activities.id, row.id))
        await assertPublishable(tx, row.id, t)
        await tx
          .update(activities)
          .set({ status: wantStatus, publishedAt: row.publishedAt ?? new Date() })
          .where(eq(activities.id, row.id))
        statusChanged = true
      } catch (error) {
        if (created)
          await tx.update(activities).set({ needsReview: true }).where(eq(activities.id, row.id))
        warnings.push(
          t('sh.warn_kept_draft', {
            slug: item.slug,
            reason: error instanceof Error ? error.message : '',
          }),
        )
      }
    } else {
      await tx.update(activities).set({ status: wantStatus }).where(eq(activities.id, row.id))
      statusChanged = true
    }
  }

  await writeAudit(
    {
      actor: session,
      action: created ? 'activity.create' : 'activity.update',
      entityType: 'activity',
      entityId: row.id,
      before: before?.row ?? null,
      after: { ...row, source: 'spreadsheet', columns: own },
    },
    tx,
  )
  return {
    created,
    changed: created || own.length > 0 || childChanged || statusChanged,
    warnings,
  }
}

/** Slugs taken by archived (deleted) activities: a new row may not reuse them. */
export async function archivedSlugs(slugs: readonly string[]): Promise<Set<string>> {
  if (slugs.length === 0) return new Set()
  const rows = await db
    .select({ slug: activities.slug, deletedAt: activities.deletedAt })
    .from(activities)
    .where(inArray(activities.slug, [...slugs]))
  return new Set(rows.filter((row) => row.deletedAt !== null).map((row) => row.slug))
}

export { planRows }
export type { SheetKey }
