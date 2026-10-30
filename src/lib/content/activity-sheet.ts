/**
 * Activities as a spreadsheet (owner request, Oct 2026): one sheet per thing —
 * Activities, Packages, AddOns, FAQ — that the Studio exports, the owner edits
 * in Excel (or as CSV) and uploads again. Pure: no database, no I/O.
 *
 * Every cell has ONE canonical text form (`normalizeCell`). Export writes the
 * canonical form of what is stored; import normalizes what the file holds and
 * compares the two strings column by column. So exporting and re-importing an
 * unchanged file is, by construction, zero changes, and the preview can name
 * exactly which columns of which activity would change.
 *
 * Rules (also printed on the template's «Instructions» sheet):
 *  - Activities are matched by `activity_slug`: a known slug is UPDATED, a new
 *    one CREATED (as a draft unless `status` says otherwise). Nothing is ever
 *    deleted — a row missing from the file leaves the stored row alone.
 *  - A column missing from the file is left untouched; an EMPTY cell in a
 *    column that is there clears that value (the name and slug never clear).
 *  - Packages are matched by `package_key`, add-ons by their name, questions
 *    by their question text.
 *  - Lists inside a cell are separated by «|» (or a new line inside the cell).
 *  - The CSV form is one file: a `type` column says which sheet the row is
 *    (activity / package / addon / faq). Files from the older CSV template
 *    keep working.
 */

import { formatMoneyInput, parseMoneyInput } from '@/lib/money-input'

export type SheetKey = 'activities' | 'packages' | 'addons' | 'faq'
export const SHEET_KEYS: readonly SheetKey[] = ['activities', 'packages', 'addons', 'faq']

/** Tab names in the workbook (and the `type` value of a CSV row). */
export const SHEET_TITLES: Record<SheetKey, { tab: string; type: string; ar: string }> = {
  activities: { tab: 'Activities', type: 'activity', ar: 'الأنشطة' },
  packages: { tab: 'Packages', type: 'package', ar: 'الباقات' },
  addons: { tab: 'AddOns', type: 'addon', ar: 'الإضافات' },
  faq: { tab: 'FAQ', type: 'faq', ar: 'الأسئلة الشائعة' },
}

export const ACTIVITY_STATUS_VALUES = [
  'draft',
  'in_review',
  'published',
  'hidden',
  'unavailable',
  'archived',
] as const
export const PACKAGE_PRICING_VALUES = ['per_person', 'per_group', 'per_couple', 'fixed'] as const
export const ADDON_PRICING_VALUES = [
  'per_person',
  'per_booking',
  'per_qty',
  'per_hour',
  'tiered',
] as const

export type CellKind =
  | 'text'
  | 'slug'
  | 'list'
  | 'money'
  | 'int'
  | 'float'
  | 'bool'
  | 'url'
  | 'urls'
  | 'keys'
  | 'times'
  | 'currency'
  | 'status'
  | 'pkg_pricing'
  | 'addon_pricing'
  | 'region'
  | 'category'

export interface ColumnSpec {
  key: string
  kind: CellKind
  /** Arabic header shown above the key row. */
  ar: string
  required?: boolean
}

const c = (key: string, kind: CellKind, ar: string, required = false): ColumnSpec => ({
  key,
  kind,
  ar,
  required,
})

export const COLUMNS: Record<SheetKey, readonly ColumnSpec[]> = {
  activities: [
    c('activity_slug', 'slug', 'المعرّف في الرابط (slug)', true),
    c('status', 'status', 'الحالة'),
    c('name_ar', 'text', 'الاسم بالعربية'),
    c('name_en', 'text', 'الاسم بالإنجليزية'),
    c('name_id', 'text', 'الاسم بالإندونيسية'),
    c('region', 'region', 'المنطقة'),
    c('category', 'category', 'التصنيف الرئيسي'),
    c('extra_categories', 'keys', 'تصنيفات إضافية (|)'),
    c('area_ar', 'text', 'المكان بالعربية'),
    c('area_en', 'text', 'المكان بالإنجليزية'),
    c('duration_ar', 'text', 'المدة بالعربية'),
    c('duration_en', 'text', 'المدة بالإنجليزية'),
    c('headline_ar', 'text', 'العنوان الجذاب بالعربية'),
    c('headline_en', 'text', 'العنوان الجذاب بالإنجليزية'),
    c('short_ar', 'text', 'وصف مختصر بالعربية'),
    c('short_en', 'text', 'وصف مختصر بالإنجليزية'),
    c('description_ar', 'text', 'الوصف بالعربية'),
    c('description_en', 'text', 'الوصف بالإنجليزية'),
    c('highlights_ar', 'list', 'أبرز النقاط بالعربية (|)'),
    c('highlights_en', 'list', 'أبرز النقاط بالإنجليزية (|)'),
    c('included_ar', 'list', 'يشمل بالعربية (|)'),
    c('included_en', 'list', 'يشمل بالإنجليزية (|)'),
    c('excluded_ar', 'list', 'لا يشمل بالعربية (|)'),
    c('excluded_en', 'list', 'لا يشمل بالإنجليزية (|)'),
    c('price', 'money', 'السعر الأساسي «يبدأ من»'),
    c('currency', 'currency', 'العملة'),
    c('min_guests', 'int', 'أقل عدد أشخاص'),
    c('max_guests', 'int', 'أكبر عدد أشخاص'),
    c('lead_time_hours', 'int', 'الحجز قبل (ساعات)'),
    c('min_advance_days', 'int', 'أقرب موعد للحجز: بعد كم يوم (0 نفس اليوم، 1 الغد، 2 بعد الغد)'),
    c('booking_cutoff', 'times', 'آخر وقت للحجز يومياً بتوقيت بالي مثل 18:00'),
    c('time_slots', 'times', 'الأوقات المتاحة (|) مثل 08:00'),
    c('meeting_ar', 'text', 'نقطة اللقاء بالعربية'),
    c('meeting_en', 'text', 'نقطة اللقاء بالإنجليزية'),
    c('meeting_time_ar', 'text', 'وقت اللقاء بالعربية'),
    c('meeting_time_en', 'text', 'وقت اللقاء بالإنجليزية'),
    c('map_url', 'url', 'رابط الخريطة (https)'),
    c('lat', 'float', 'خط العرض'),
    c('lng', 'float', 'خط الطول'),
    c('what_to_bring_ar', 'list', 'ماذا تحضر بالعربية (|)'),
    c('what_to_bring_en', 'list', 'ماذا تحضر بالإنجليزية (|)'),
    c('age_ar', 'list', 'شروط العمر بالعربية (|)'),
    c('age_en', 'list', 'شروط العمر بالإنجليزية (|)'),
    c('notes_ar', 'list', 'ملاحظات مهمة بالعربية (|)'),
    c('notes_en', 'list', 'ملاحظات مهمة بالإنجليزية (|)'),
    c('cancellation_ar', 'text', 'سياسة الإلغاء بالعربية'),
    c('cancellation_en', 'text', 'سياسة الإلغاء بالإنجليزية'),
    c('free_cancel_hours', 'int', 'إلغاء مجاني حتى (ساعات)'),
    c('instant_confirmation', 'bool', 'تأكيد فوري (نعم/لا)'),
    c('featured', 'bool', 'مميّزة (نعم/لا)'),
    c('hero_image_url', 'url', 'رابط الصورة الرئيسية'),
    c('gallery_urls', 'urls', 'روابط صور المعرض (|)'),
  ],
  packages: [
    c('activity_slug', 'slug', 'معرّف النشاط', true),
    c('package_key', 'slug', 'معرّف الباقة', true),
    c('name_ar', 'text', 'اسم الباقة بالعربية'),
    c('name_en', 'text', 'اسم الباقة بالإنجليزية'),
    c('pricing', 'pkg_pricing', 'طريقة التسعير'),
    c('price', 'money', 'السعر'),
    c('compare_at', 'money', 'السعر قبل الخصم'),
    c('child_price', 'money', 'سعر الطفل'),
    c('included_persons', 'int', 'عدد الأشخاص في الوحدة (للمجموعة)'),
    c('min_guests', 'int', 'أقل عدد'),
    c('max_guests', 'int', 'أكبر عدد'),
    c('popular', 'bool', 'الأكثر طلبًا (نعم/لا)'),
    c('available', 'bool', 'متاحة (نعم/لا)'),
    c('includes_ar', 'list', 'تشمل بالعربية (|)'),
    c('includes_en', 'list', 'تشمل بالإنجليزية (|)'),
    c('excludes_ar', 'list', 'لا تشمل بالعربية (|)'),
    c('excludes_en', 'list', 'لا تشمل بالإنجليزية (|)'),
    c('features_ar', 'list', 'مزايا بالعربية (|)'),
    c('features_en', 'list', 'مزايا بالإنجليزية (|)'),
  ],
  addons: [
    c('activity_slug', 'slug', 'معرّف النشاط', true),
    c('name_ar', 'text', 'اسم الإضافة بالعربية'),
    c('name_en', 'text', 'اسم الإضافة بالإنجليزية'),
    c('pricing', 'addon_pricing', 'طريقة التسعير'),
    c('price', 'money', 'السعر'),
    c('max_qty', 'int', 'أكبر كمية'),
    c('available', 'bool', 'متاحة (نعم/لا)'),
  ],
  faq: [
    c('activity_slug', 'slug', 'معرّف النشاط', true),
    c('question_ar', 'text', 'السؤال بالعربية'),
    c('question_en', 'text', 'السؤال بالإنجليزية'),
    c('answer_ar', 'text', 'الإجابة بالعربية'),
    c('answer_en', 'text', 'الإجابة بالإنجليزية'),
  ],
}

/** Old CSV template column names → the current ones (PR #20 files keep importing). */
const ALIASES: Record<string, string> = { slug: 'activity_slug', key: 'package_key' }

export function columnSpec(sheet: SheetKey, key: string): ColumnSpec | undefined {
  return COLUMNS[sheet].find((column) => column.key === key)
}

// ---------------------------------------------------------------------------
// Cells
// ---------------------------------------------------------------------------

export type CellError =
  | 'slug'
  | 'money'
  | 'negative'
  | 'int'
  | 'float'
  | 'bool'
  | 'url'
  | 'time'
  | 'currency'
  | 'status'
  | 'pricing'
  | 'region'
  | 'category'

export interface Lookups {
  regions: ReadonlySet<string>
  categories: ReadonlySet<string>
}

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/
const YES = new Set(['yes', 'y', 'true', '1', 'نعم', 'ن', 'x', '✓', 'ya'])
const NO = new Set(['no', 'n', 'false', '0', 'لا', 'tidak', ''])

/** Split a list cell on «|» or new lines; empty middle items keep alignment. */
export function splitList(raw: string): string[] {
  const items = raw.split(/\s*(?:\||\r?\n)\s*/).map((item) => item.trim())
  while (items.length > 0 && items[items.length - 1] === '') items.pop()
  while (items.length > 0 && items[0] === '' && items.every((i) => i === '')) items.shift()
  return items
}

export function joinList(items: readonly string[]): string {
  const copy = items.map((item) => item.replace(/\s*\|\s*/g, ' / ').trim())
  while (copy.length > 0 && copy[copy.length - 1] === '') copy.pop()
  return copy.join(' | ')
}

function numberText(raw: string): string {
  return raw
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/٫/g, '.')
    .replace(/\s/g, '')
}

/**
 * The canonical text of one cell, or why it is not acceptable. `currency` is
 * the row's currency (money cells depend on it). Empty stays empty.
 */
export function normalizeCell(
  spec: ColumnSpec,
  raw: string,
  lookups: Lookups,
  currency = 'USD',
): { value: string } | { error: CellError } {
  const text = raw.replace(/ /g, ' ').trim()
  if (text === '' && spec.kind !== 'bool') return { value: '' }
  switch (spec.kind) {
    case 'text':
      return { value: text.replace(/\r\n/g, '\n') }
    case 'slug': {
      const slug = text.toLowerCase()
      return SLUG.test(slug) ? { value: slug } : { error: 'slug' }
    }
    case 'list':
      return { value: joinList(splitList(text)) }
    case 'money': {
      const clean = numberText(text)
      if (clean.startsWith('-')) return { error: 'negative' }
      const parsed = parseMoneyInput(clean, currency)
      if (!parsed.ok) return { error: parsed.error === 'negative' ? 'negative' : 'money' }
      return { value: formatMoneyInput(parsed.value, currency) }
    }
    case 'int': {
      const clean = numberText(text).replace(/\.0+$/, '')
      if (clean.startsWith('-')) return { error: 'negative' }
      return /^\d{1,7}$/.test(clean) ? { value: String(Number(clean)) } : { error: 'int' }
    }
    case 'float': {
      const clean = numberText(text).replace(',', '.')
      if (!/^-?\d+(\.\d+)?$/.test(clean)) return { error: 'float' }
      return { value: String(Number(clean)) }
    }
    case 'bool': {
      const lower = text.toLowerCase()
      if (YES.has(lower)) return { value: 'yes' }
      if (NO.has(lower)) return { value: lower === '' ? '' : 'no' }
      return { error: 'bool' }
    }
    case 'url':
      return /^https?:\/\/\S+$/i.test(text) || /^\/\S+$/.test(text)
        ? { value: text }
        : { error: 'url' }
    case 'urls': {
      const items = splitList(text).filter((item) => item !== '')
      if (!items.every((item) => /^https?:\/\/\S+$/i.test(item) || /^\/\S+$/.test(item))) {
        return { error: 'url' }
      }
      return { value: joinList(items) }
    }
    case 'keys': {
      const items = [...new Set(splitList(text).filter((item) => item !== ''))].map((item) =>
        item.toLowerCase(),
      )
      if (!items.every((item) => lookups.categories.has(item))) return { error: 'category' }
      return { value: joinList(items) }
    }
    case 'times': {
      const out: string[] = []
      for (const item of splitList(text.replace(/,/g, '|'))) {
        if (item === '') continue
        const match = /^(\d{1,2})[:.٫](\d{2})$/.exec(numberText(item))
        if (!match) return { error: 'time' }
        const h = Number(match[1])
        const m = Number(match[2])
        if (h > 23 || m > 59) return { error: 'time' }
        out.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
      }
      return { value: joinList([...new Set(out)].sort()) }
    }
    case 'currency': {
      const code = text.toUpperCase()
      return /^[A-Z]{3}$/.test(code) ? { value: code } : { error: 'currency' }
    }
    case 'status': {
      const value = STATUS_WORDS[text.toLowerCase()] ?? text.toLowerCase()
      return (ACTIVITY_STATUS_VALUES as readonly string[]).includes(value)
        ? { value }
        : { error: 'status' }
    }
    case 'pkg_pricing': {
      const value = PRICING_WORDS[text.toLowerCase()] ?? text.toLowerCase()
      return (PACKAGE_PRICING_VALUES as readonly string[]).includes(value)
        ? { value }
        : { error: 'pricing' }
    }
    case 'addon_pricing': {
      const value = PRICING_WORDS[text.toLowerCase()] ?? text.toLowerCase()
      return (ADDON_PRICING_VALUES as readonly string[]).includes(value)
        ? { value }
        : { error: 'pricing' }
    }
    case 'region': {
      const value = text.toLowerCase()
      return lookups.regions.has(value) ? { value } : { error: 'region' }
    }
    case 'category': {
      const value = text.toLowerCase()
      return lookups.categories.has(value) ? { value } : { error: 'category' }
    }
  }
}

/** Arabic words an owner may type instead of the keys. */
const STATUS_WORDS: Record<string, string> = {
  مسودة: 'draft',
  منشور: 'published',
  منشورة: 'published',
  مخفي: 'hidden',
  مخفية: 'hidden',
  'غير متاح': 'unavailable',
  'غير متاحة': 'unavailable',
  مراجعة: 'in_review',
  مؤرشف: 'archived',
  مؤرشفة: 'archived',
}
const PRICING_WORDS: Record<string, string> = {
  للشخص: 'per_person',
  'لكل شخص': 'per_person',
  للمجموعة: 'per_group',
  للزوجين: 'per_couple',
  'سعر ثابت': 'fixed',
  للحجز: 'per_booking',
  'لكل حجز': 'per_booking',
  بالكمية: 'per_qty',
  بالساعة: 'per_hour',
}

// ---------------------------------------------------------------------------
// Reading a file into rows
// ---------------------------------------------------------------------------

export type Record_ = Record<string, string>

export interface SheetRow {
  sheet: SheetKey
  /** Row number as the owner sees it in Excel (or the CSV line). */
  line: number
  cells: Record_
  /** Column keys present in that sheet's header. */
  columns: readonly string[]
}

export interface RowIssue {
  sheet: SheetKey | 'file'
  line: number
  column?: string
  code: string
  value?: string
}

/**
 * A raw grid (one sheet, or the whole CSV) → keyed rows. The key row is the
 * first row holding `activity_slug` (or the old `type`); rows above it are
 * the Arabic labels. `sheet` null = a CSV whose `type` column picks the sheet.
 */
export function gridToRows(
  grid: readonly (readonly string[])[],
  sheet: SheetKey | null,
): { rows: SheetRow[]; issues: RowIssue[] } {
  const keyIndex = grid.findIndex((row) =>
    row.some((cell) => {
      const key = cell.trim().toLowerCase()
      return key === 'activity_slug' || key === 'type'
    }),
  )
  if (keyIndex < 0) {
    return { rows: [], issues: [{ sheet: sheet ?? 'file', line: 1, code: 'columns' }] }
  }
  const header = (grid[keyIndex] ?? []).map((cell) => {
    const key = cell.trim().toLowerCase()
    return ALIASES[key] ?? key
  })
  const rows: SheetRow[] = []
  const issues: RowIssue[] = []
  for (let index = keyIndex + 1; index < grid.length; index += 1) {
    const raw = grid[index] ?? []
    if (!raw.some((cell) => String(cell ?? '').trim() !== '')) continue
    const cells: Record_ = {}
    header.forEach((key, i) => {
      if (key !== '') cells[key] = String(raw[i] ?? '')
    })
    let target = sheet
    if (target === null) {
      const type = (cells.type ?? '').trim().toLowerCase()
      target = SHEET_KEYS.find((key) => SHEET_TITLES[key].type === type) ?? null
      if (target === null) {
        issues.push({ sheet: 'file', line: index + 1, code: 'type', value: cells.type ?? '' })
        continue
      }
    }
    // Example rows of the template are skipped, never imported.
    if ((cells.activity_slug ?? '').trim().toLowerCase().startsWith('example-')) continue
    const known = new Set(COLUMNS[target].map((column) => column.key))
    rows.push({
      sheet: target,
      line: index + 1,
      cells,
      columns: header.filter((key) => known.has(key)),
    })
  }
  return { rows, issues }
}

// ---------------------------------------------------------------------------
// Validating rows into a plan
// ---------------------------------------------------------------------------

export interface PlannedChild {
  line: number
  /** Match key: package_key, add-on name, or question text. */
  match: string
  values: Record_
  columns: readonly string[]
}

export interface PlannedActivity {
  line: number
  slug: string
  values: Record_
  columns: readonly string[]
  packages: PlannedChild[]
  addons: PlannedChild[]
  faq: PlannedChild[]
}

export interface Plan {
  activities: PlannedActivity[]
  issues: RowIssue[]
}

function lower(text: string): string {
  return text.trim().toLowerCase()
}

/** Normalizes every cell, checks each row, groups children under their activity. */
export function planRows(
  rows: readonly SheetRow[],
  lookups: Lookups,
  existing: ReadonlyMap<string, { currency: string }>,
): Plan {
  const issues: RowIssue[] = []
  const bySlug = new Map<string, PlannedActivity>()

  const normalizeRow = (row: SheetRow, currency: string): Record_ | null => {
    const values: Record_ = {}
    let ok = true
    for (const key of row.columns) {
      const spec = columnSpec(row.sheet, key)
      if (!spec) continue
      const result = normalizeCell(spec, row.cells[key] ?? '', lookups, currency)
      if ('error' in result) {
        ok = false
        issues.push({
          sheet: row.sheet,
          line: row.line,
          column: key,
          code: result.error,
          value: (row.cells[key] ?? '').slice(0, 80),
        })
      } else values[key] = result.value
    }
    return ok ? values : null
  }

  for (const row of rows.filter((r) => r.sheet === 'activities')) {
    const slug = lower(row.cells.activity_slug ?? '')
    if (!SLUG.test(slug)) {
      issues.push({
        sheet: 'activities',
        line: row.line,
        column: 'activity_slug',
        code: 'slug',
        value: slug,
      })
      continue
    }
    if (bySlug.has(slug)) {
      issues.push({ sheet: 'activities', line: row.line, code: 'duplicate_slug', value: slug })
      continue
    }
    const currency =
      (row.cells.currency ?? '').trim().toUpperCase() || existing.get(slug)?.currency || 'USD'
    const values = normalizeRow(row, currency)
    if (!values) continue
    const isNew = !existing.has(slug)
    const hasName = ['name_ar', 'name_en', 'name_id'].some((key) => (values[key] ?? '') !== '')
    const nameColumns = row.columns.some((key) => key.startsWith('name_'))
    if ((isNew || nameColumns) && !hasName) {
      issues.push({ sheet: 'activities', line: row.line, column: 'name_ar', code: 'name' })
      continue
    }
    if (isNew && !values.region && !row.columns.includes('region')) {
      // Allowed: the region can be set later in the Studio (needed to publish).
    }
    const min = values.min_guests ? Number(values.min_guests) : null
    const max = values.max_guests ? Number(values.max_guests) : null
    if (
      (min !== null && min < 1) ||
      (max !== null && max < 1) ||
      (min !== null && max !== null && min > max)
    ) {
      issues.push({ sheet: 'activities', line: row.line, column: 'min_guests', code: 'people' })
      continue
    }
    const hasLat = (values.lat ?? '') !== ''
    const hasLng = (values.lng ?? '') !== ''
    if (
      hasLat !== hasLng ||
      (hasLat && Math.abs(Number(values.lat)) > 90) ||
      (hasLng && Math.abs(Number(values.lng)) > 180)
    ) {
      issues.push({ sheet: 'activities', line: row.line, column: 'lat', code: 'coords' })
      continue
    }
    if (values.map_url && !/^https:\/\//i.test(values.map_url)) {
      issues.push({ sheet: 'activities', line: row.line, column: 'map_url', code: 'map_url' })
      continue
    }
    bySlug.set(slug, {
      line: row.line,
      slug,
      values: { ...values, activity_slug: slug },
      columns: row.columns,
      packages: [],
      addons: [],
      faq: [],
    })
  }

  for (const row of rows.filter((r) => r.sheet !== 'activities')) {
    const slug = lower(row.cells.activity_slug ?? '')
    const parent = bySlug.get(slug)
    if (!parent && !existing.has(slug)) {
      issues.push({
        sheet: row.sheet,
        line: row.line,
        column: 'activity_slug',
        code: 'unknown_activity',
        value: slug,
      })
      continue
    }
    const target =
      parent ??
      (() => {
        // Children of an activity that is not in the Activities sheet: an
        // update of that stored activity's children only.
        const stub: PlannedActivity = {
          line: row.line,
          slug,
          values: { activity_slug: slug },
          columns: ['activity_slug'],
          packages: [],
          addons: [],
          faq: [],
        }
        bySlug.set(slug, stub)
        return stub
      })()
    const currency = target.values.currency || existing.get(slug)?.currency || 'USD'
    const values = normalizeRow(row, currency)
    if (!values) continue
    if (row.sheet === 'packages') {
      const key = values.package_key ?? ''
      if (!SLUG.test(key)) {
        issues.push({
          sheet: 'packages',
          line: row.line,
          column: 'package_key',
          code: 'slug',
          value: row.cells.package_key ?? '',
        })
        continue
      }
      if (target.packages.some((pkg) => pkg.match === key)) {
        issues.push({ sheet: 'packages', line: row.line, code: 'duplicate_package', value: key })
        continue
      }
      const min = values.min_guests ? Number(values.min_guests) : null
      const max = values.max_guests ? Number(values.max_guests) : null
      const persons = values.included_persons ? Number(values.included_persons) : null
      if (
        (min !== null && min < 1) ||
        (max !== null && max < 1) ||
        (persons !== null && persons < 1) ||
        (min !== null && max !== null && min > max)
      ) {
        issues.push({
          sheet: 'packages',
          line: row.line,
          column: 'included_persons',
          code: 'people',
        })
        continue
      }
      const price = values.price ? Number(values.price) : 0
      const compare = values.compare_at ? Number(values.compare_at) : 0
      if (compare !== 0 && compare <= price) {
        issues.push({
          sheet: 'packages',
          line: row.line,
          column: 'compare_at',
          code: 'compare_at',
          value: values.compare_at,
        })
        continue
      }
      target.packages.push({ line: row.line, match: key, values, columns: row.columns })
    } else if (row.sheet === 'addons') {
      const match = lower(values.name_en || values.name_ar || '')
      if (match === '') {
        issues.push({ sheet: 'addons', line: row.line, column: 'name_ar', code: 'name' })
        continue
      }
      if (target.addons.some((addon) => addon.match === match)) {
        issues.push({ sheet: 'addons', line: row.line, code: 'duplicate_addon', value: match })
        continue
      }
      if (values.max_qty === '0') {
        issues.push({ sheet: 'addons', line: row.line, column: 'max_qty', code: 'people' })
        continue
      }
      target.addons.push({ line: row.line, match, values, columns: row.columns })
    } else {
      const match = lower(values.question_ar || values.question_en || '')
      if (match === '') {
        issues.push({ sheet: 'faq', line: row.line, column: 'question_ar', code: 'question' })
        continue
      }
      if (target.faq.some((entry) => entry.match === match)) {
        issues.push({ sheet: 'faq', line: row.line, code: 'duplicate_question', value: match })
        continue
      }
      target.faq.push({ line: row.line, match, values, columns: row.columns })
    }
  }

  issues.sort((a, b) => a.sheet.localeCompare(b.sheet) || a.line - b.line)
  return { activities: [...bySlug.values()], issues }
}

/**
 * What an empty cell means for a column that always has a stored value
 * (the database default): an empty «max_guests» is 20, not a change.
 */
export const SHEET_DEFAULTS: Record<SheetKey, Record_> = {
  activities: {
    status: 'draft',
    price: '0.00',
    currency: 'USD',
    min_guests: '1',
    max_guests: '20',
    lead_time_hours: '24',
    instant_confirmation: 'no',
    featured: 'no',
  },
  packages: { pricing: 'per_person', price: '0.00', popular: 'no', available: 'yes' },
  addons: { pricing: 'per_booking', price: '0.00', available: 'yes' },
  faq: {},
}

/** Columns whose canonical value differs (only columns the file has). */
export function changedColumns(
  values: Record_,
  columns: readonly string[],
  stored: Record_ | null,
  defaults: Record_ = {},
  skip: readonly string[] = ['activity_slug', 'package_key'],
): string[] {
  if (stored === null) {
    return columns.filter((key) => !skip.includes(key) && (values[key] ?? '') !== '')
  }
  const value = (key: string) => {
    const v = values[key] ?? ''
    return v === '' ? (defaults[key] ?? '') : v
  }
  return columns.filter((key) => !skip.includes(key) && value(key) !== (stored[key] ?? ''))
}

/** Rows (in column order) for a sheet, from canonical records. */
export function recordsToGrid(sheet: SheetKey, records: readonly Record_[]): string[][] {
  return records.map((record) => COLUMNS[sheet].map((column) => record[column.key] ?? ''))
}

/**
 * One localized list (stored rows) ↔ the two cells «xxx_ar» / «xxx_en». The
 * Indonesian text and the per-line switches are not in the sheet; `mergeList`
 * keeps them by position when the text is changed.
 */
export function listCells(rows: readonly { ar?: string; en?: string }[] | null | undefined): {
  ar: string
  en: string
} {
  const list = rows ?? []
  return {
    ar: joinList(list.map((row) => row.ar ?? '')),
    en: joinList(list.map((row) => row.en ?? '')),
  }
}

export function mergeList<T extends { ar: string; en: string; id: string }>(
  before: readonly T[] | null | undefined,
  ar: string,
  en: string,
): T[] {
  const arItems = splitList(ar)
  const enItems = splitList(en)
  const out: T[] = []
  for (let i = 0; i < Math.max(arItems.length, enItems.length); i += 1) {
    const old = before?.[i]
    const row = {
      ...(old ?? {}),
      ar: arItems[i] ?? '',
      en: enItems[i] ?? '',
      id: old?.id ?? '',
    } as T
    if (row.ar !== '' || row.en !== '' || row.id !== '') out.push(row)
  }
  return out
}

/** Template example rows (skipped on import: their slug starts with «example-»). */
export const SHEET_EXAMPLES: Record<SheetKey, Record_> = {
  activities: {
    activity_slug: 'example-activity',
    status: 'draft',
    name_ar: 'مثال: رحلة شروق الشمس على جبل باتور',
    name_en: 'Example: Mount Batur sunrise trek',
    region: 'ubud',
    duration_ar: '٦ ساعات',
    duration_en: '6 hours',
    short_ar: 'تسلق ليلي ومشاهدة الشروق فوق البركان',
    short_en: 'Night hike and sunrise above the volcano',
    highlights_ar: 'شروق الشمس | فطور على القمة',
    highlights_en: 'Sunrise | Breakfast at the top',
    price: '45.00',
    currency: 'USD',
    min_guests: '1',
    max_guests: '12',
    time_slots: '02:00 | 03:00',
    instant_confirmation: 'yes',
  },
  packages: {
    activity_slug: 'example-activity',
    package_key: 'basic',
    name_ar: 'الباقة الأساسية',
    name_en: 'Basic',
    pricing: 'per_person',
    price: '45.00',
    includes_ar: 'مرشد | فطور',
    includes_en: 'Guide | Breakfast',
    available: 'yes',
  },
  addons: {
    activity_slug: 'example-activity',
    name_ar: 'نقل من الفندق',
    name_en: 'Hotel transfer',
    pricing: 'per_booking',
    price: '15.00',
    available: 'yes',
  },
  faq: {
    activity_slug: 'example-activity',
    question_ar: 'هل الرحلة مناسبة للأطفال؟',
    question_en: 'Is it suitable for children?',
    answer_ar: 'من عمر ١٠ سنوات.',
    answer_en: 'From 10 years old.',
  },
}

/** CSV form: the `type` column first, then every sheet's columns (union, in order). */
export function csvColumns(): string[] {
  const out = ['type']
  for (const sheet of SHEET_KEYS) {
    for (const column of COLUMNS[sheet]) if (!out.includes(column.key)) out.push(column.key)
  }
  return out
}

export function csvLabel(key: string): string {
  if (key === 'type') return 'نوع الصف (activity/package/addon/faq)'
  for (const sheet of SHEET_KEYS) {
    const spec = columnSpec(sheet, key)
    if (spec) return spec.ar
  }
  return key
}
