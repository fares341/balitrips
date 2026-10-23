/**
 * Bulk import of activities from a CSV file (client spec §15). Pure: parse
 * and validate only — the Studio action writes what passes, as drafts.
 *
 * One file, one row per thing, the `type` column says what:
 *   activity  slug, names, region, category, texts, base price, meeting point
 *   package   activity slug, package key, name, price, pricing, people, lists
 *   addon     activity slug, name, price, pricing, max quantity
 *   faq       activity slug, question and answer
 * Lists inside a cell are separated by «|». Excel opens and saves the
 * template as UTF-8 (it starts with a BOM).
 *
 * Errors carry the file line (header = line 1) and a message key the Studio
 * translates (`av2.imp_err_<code>`), so the preview can list them all before
 * anything is written.
 */

export const IMPORT_COLUMNS = [
  'type',
  'activity_slug',
  'name_ar',
  'name_en',
  'region',
  'category',
  'short_ar',
  'short_en',
  'description_ar',
  'description_en',
  'duration_ar',
  'duration_en',
  'price',
  'currency',
  'min_guests',
  'max_guests',
  'meeting_ar',
  'meeting_en',
  'map_url',
  'lat',
  'lng',
  'cancellation_ar',
  'cancellation_en',
  'package_key',
  'pricing',
  'included_persons',
  'compare_at',
  'includes_ar',
  'includes_en',
  'excludes_ar',
  'excludes_en',
  'features_ar',
  'features_en',
  'max_qty',
  'question_ar',
  'question_en',
  'answer_ar',
  'answer_en',
] as const

export type ImportColumn = (typeof IMPORT_COLUMNS)[number]
export type ImportRow = Partial<Record<ImportColumn, string>>

export type ImportErrorCode =
  | 'columns'
  | 'type'
  | 'slug'
  | 'duplicate_slug'
  | 'exists'
  | 'name'
  | 'region'
  | 'category'
  | 'unknown_activity'
  | 'price'
  | 'negative'
  | 'people'
  | 'pricing'
  | 'package_key'
  | 'duplicate_package'
  | 'duplicate_addon'
  | 'question'
  | 'coords'
  | 'map_url'

export interface ImportError {
  line: number
  code: ImportErrorCode
  value?: string
}

type Text = { ar: string; en: string; id: string }

export interface ImportPackage {
  key: string
  name: Text
  priceMinor: number
  compareAtMinor: number | null
  pricing: 'per_person' | 'per_group' | 'per_couple' | 'fixed'
  groupMax: number | null
  minGuests: number | null
  maxGuests: number | null
  includes: Text[]
  excludes: Text[]
  features: Text[]
}

export interface ImportAddon {
  name: Text
  priceMinor: number
  pricing: 'per_person' | 'per_booking' | 'per_qty' | 'per_hour'
  maxQty: number | null
}

export interface ImportActivity {
  line: number
  slug: string
  name: Text
  region: string
  category: string | null
  short: Text | null
  description: Text | null
  duration: Text | null
  priceMinor: number
  currency: string
  minGuests: number
  maxGuests: number
  meeting: Text | null
  mapUrl: string | null
  lat: number | null
  lng: number | null
  cancellation: Text | null
  packages: ImportPackage[]
  addons: ImportAddon[]
  faq: { q: Text; a: Text }[]
}

export interface ImportResult {
  activities: ImportActivity[]
  errors: ImportError[]
}

/** RFC 4180 CSV: quotes, doubled quotes, CRLF/LF, a leading BOM. */
export function parseCsv(text: string): string[][] {
  const input = text.replace(/^﻿/, '')
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]
    if (quoted) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          cell += '"'
          i++
        } else quoted = false
      } else cell += ch
      continue
    }
    if (ch === '"') quoted = true
    else if (ch === ',') {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && input[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += ch
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((r) => r.some((value) => value.trim() !== ''))
}

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/

/** «12.50» / «12,5» → 1250 (2-decimal currencies). Null = not a number. */
function money(value: string | undefined): number | null {
  const text = (value ?? '').trim().replace(',', '.')
  if (text === '') return 0
  if (!/^-?\d+(\.\d{1,2})?$/.test(text)) return null
  return Math.round(Number(text) * 100)
}

function int(value: string | undefined): number | null | 'bad' {
  const text = (value ?? '').trim()
  if (text === '') return null
  return /^\d+$/.test(text) ? Number(text) : 'bad'
}

function text(row: ImportRow, base: string): Text | null {
  const ar = (row[`${base}_ar` as ImportColumn] ?? '').trim()
  const en = (row[`${base}_en` as ImportColumn] ?? '').trim()
  return ar === '' && en === '' ? null : { ar, en, id: '' }
}

function list(row: ImportRow, base: string): Text[] {
  const ar = (row[`${base}_ar` as ImportColumn] ?? '').split('|').map((s) => s.trim())
  const en = (row[`${base}_en` as ImportColumn] ?? '').split('|').map((s) => s.trim())
  const out: Text[] = []
  for (let i = 0; i < Math.max(ar.length, en.length); i++) {
    const line = { ar: ar[i] ?? '', en: en[i] ?? '', id: '' }
    if (line.ar !== '' || line.en !== '') out.push(line)
  }
  return out
}

export function validateImport(
  csv: string,
  known: {
    /** Slugs already used by activities in the database. */
    slugs: ReadonlySet<string>
    regions: ReadonlySet<string>
    categories: ReadonlySet<string>
  },
): ImportResult {
  const errors: ImportError[] = []
  const table = parseCsv(csv)
  const header = (table[0] ?? []).map((name) => name.trim().toLowerCase())
  if (!header.includes('type') || !header.includes('activity_slug')) {
    return { activities: [], errors: [{ line: 1, code: 'columns' }] }
  }
  const rows: { line: number; row: ImportRow }[] = table.slice(1).map((cells, index) => ({
    line: index + 2,
    row: Object.fromEntries(header.map((name, i) => [name, cells[i] ?? ''])) as ImportRow,
  }))

  const bySlug = new Map<string, ImportActivity>()
  // Activities first, so packages may come before or after their activity.
  for (const { line, row } of rows) {
    if ((row.type ?? '').trim().toLowerCase() !== 'activity') continue
    const slug = (row.activity_slug ?? '').trim()
    if (!SLUG.test(slug)) {
      errors.push({ line, code: 'slug', value: slug })
      continue
    }
    if (bySlug.has(slug)) {
      errors.push({ line, code: 'duplicate_slug', value: slug })
      continue
    }
    if (known.slugs.has(slug)) errors.push({ line, code: 'exists', value: slug })
    const name = text(row, 'name')
    if (!name || name.ar === '' || name.en === '') errors.push({ line, code: 'name' })
    const region = (row.region ?? '').trim()
    if (!known.regions.has(region)) errors.push({ line, code: 'region', value: region })
    const category = (row.category ?? '').trim()
    if (category !== '' && !known.categories.has(category)) {
      errors.push({ line, code: 'category', value: category })
    }
    const price = money(row.price)
    if (price === null) errors.push({ line, code: 'price', value: row.price ?? '' })
    else if (price < 0) errors.push({ line, code: 'negative', value: row.price ?? '' })
    const min = int(row.min_guests)
    const max = int(row.max_guests)
    if (
      min === 'bad' ||
      max === 'bad' ||
      (min !== null && min < 1) ||
      (max !== null && max < 1) ||
      (min !== null && max !== null && min > max) ||
      (max !== null && max > 500)
    ) {
      errors.push({ line, code: 'people' })
    }
    const lat = (row.lat ?? '').trim()
    const lng = (row.lng ?? '').trim()
    const latN = lat === '' ? null : Number(lat)
    const lngN = lng === '' ? null : Number(lng)
    if (
      (latN === null) !== (lngN === null) ||
      (latN !== null && (!Number.isFinite(latN) || Math.abs(latN) > 90)) ||
      (lngN !== null && (!Number.isFinite(lngN) || Math.abs(lngN) > 180))
    ) {
      errors.push({ line, code: 'coords' })
    }
    const mapUrl = (row.map_url ?? '').trim()
    if (mapUrl !== '' && !/^https:\/\/\S+$/i.test(mapUrl)) errors.push({ line, code: 'map_url' })
    bySlug.set(slug, {
      line,
      slug,
      name: name ?? { ar: '', en: '', id: '' },
      region,
      category: category === '' ? null : category,
      short: text(row, 'short'),
      description: text(row, 'description'),
      duration: text(row, 'duration'),
      priceMinor: price !== null && price > 0 ? price : 0,
      currency: ((row.currency ?? '').trim() || 'USD').toUpperCase().slice(0, 3),
      minGuests: typeof min === 'number' ? min : 1,
      maxGuests: typeof max === 'number' ? max : 20,
      meeting: text(row, 'meeting'),
      mapUrl: mapUrl === '' ? null : mapUrl,
      lat: latN,
      lng: lngN,
      cancellation: text(row, 'cancellation'),
      packages: [],
      addons: [],
      faq: [],
    })
  }

  for (const { line, row } of rows) {
    const type = (row.type ?? '').trim().toLowerCase()
    if (type === 'activity') continue
    if (!['package', 'addon', 'faq'].includes(type)) {
      errors.push({ line, code: 'type', value: row.type ?? '' })
      continue
    }
    const slug = (row.activity_slug ?? '').trim()
    const activity = bySlug.get(slug)
    if (!activity) {
      errors.push({ line, code: 'unknown_activity', value: slug })
      continue
    }
    if (type === 'faq') {
      const q = text(row, 'question')
      const a = text(row, 'answer')
      if (!q || !a) errors.push({ line, code: 'question' })
      else activity.faq.push({ q, a })
      continue
    }
    const name = text(row, 'name')
    if (!name) errors.push({ line, code: 'name' })
    const price = money(row.price)
    if (price === null) errors.push({ line, code: 'price', value: row.price ?? '' })
    else if (price < 0) errors.push({ line, code: 'negative', value: row.price ?? '' })
    if (type === 'addon') {
      const pricing = (row.pricing ?? '').trim() || 'per_booking'
      if (!['per_person', 'per_booking', 'per_qty', 'per_hour'].includes(pricing)) {
        errors.push({ line, code: 'pricing', value: pricing })
      }
      const maxQty = int(row.max_qty)
      if (maxQty === 'bad' || maxQty === 0) errors.push({ line, code: 'people' })
      const key = `${name?.ar ?? ''}|${name?.en ?? ''}`.toLowerCase()
      if (
        activity.addons.some((addon) => `${addon.name.ar}|${addon.name.en}`.toLowerCase() === key)
      ) {
        errors.push({ line, code: 'duplicate_addon', value: name?.en || name?.ar || '' })
        continue
      }
      if (name && price !== null && price >= 0) {
        activity.addons.push({
          name,
          priceMinor: price,
          pricing: pricing as ImportAddon['pricing'],
          maxQty: typeof maxQty === 'number' ? maxQty : null,
        })
      }
      continue
    }
    // package
    const key = (row.package_key ?? '').trim()
    if (!SLUG.test(key)) {
      errors.push({ line, code: 'package_key', value: key })
      continue
    }
    if (activity.packages.some((pkg) => pkg.key === key)) {
      errors.push({ line, code: 'duplicate_package', value: key })
      continue
    }
    const pricing = (row.pricing ?? '').trim() || 'per_person'
    if (!['per_person', 'per_group', 'per_couple', 'fixed'].includes(pricing)) {
      errors.push({ line, code: 'pricing', value: pricing })
    }
    const persons = int(row.included_persons)
    const min = int(row.min_guests)
    const max = int(row.max_guests)
    if (
      persons === 'bad' ||
      min === 'bad' ||
      max === 'bad' ||
      (persons !== null && persons < 1) ||
      (min !== null && min < 1) ||
      (max !== null && max < 1) ||
      (min !== null && max !== null && min > max) ||
      (pricing === 'per_group' && persons === null) ||
      (pricing === 'per_couple' && max !== null && max < 2)
    ) {
      errors.push({ line, code: 'people' })
    }
    const compare = money(row.compare_at)
    if (compare === null || (compare !== 0 && price !== null && compare <= price)) {
      errors.push({ line, code: 'price', value: row.compare_at ?? '' })
    }
    if (name && price !== null && price >= 0) {
      activity.packages.push({
        key,
        name,
        priceMinor: price,
        compareAtMinor: compare !== null && compare > 0 ? compare : null,
        pricing: pricing as ImportPackage['pricing'],
        groupMax: typeof persons === 'number' ? persons : null,
        minGuests: typeof min === 'number' ? min : null,
        maxGuests: typeof max === 'number' ? max : null,
        includes: list(row, 'includes'),
        excludes: list(row, 'excludes'),
        features: list(row, 'features'),
      })
    }
  }

  errors.sort((a, b) => a.line - b.line)
  return { activities: [...bySlug.values()], errors }
}

/** Template rows: one sample of each type, clearly marked as an example. */
export const IMPORT_EXAMPLE: readonly ImportRow[] = [
  {
    type: 'activity',
    activity_slug: 'example-activity',
    name_ar: 'مثال: اسم الفعالية',
    name_en: 'Example: activity name',
    region: 'ubud',
    category: '',
    short_ar: 'وصف مختصر',
    short_en: 'Short description',
    duration_ar: '2–3 ساعات',
    duration_en: '2–3 hours',
    price: '0',
    currency: 'USD',
    min_guests: '1',
    max_guests: '10',
  },
  {
    type: 'package',
    activity_slug: 'example-activity',
    package_key: 'basic',
    name_ar: 'الباقة الأساسية',
    name_en: 'Basic package',
    price: '0',
    pricing: 'per_person',
    includes_ar: 'دخول النشاط|مرشد',
    includes_en: 'Entry|Guide',
  },
  {
    type: 'addon',
    activity_slug: 'example-activity',
    name_ar: 'غداء',
    name_en: 'Lunch',
    price: '0',
    pricing: 'per_person',
  },
  {
    type: 'faq',
    activity_slug: 'example-activity',
    question_ar: 'سؤال؟',
    question_en: 'Question?',
    answer_ar: 'الإجابة',
    answer_en: 'Answer',
  },
]
