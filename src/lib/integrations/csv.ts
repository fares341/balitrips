/**
 * Phase 6: supplier CSV import — parsing and the preview diff (pure).
 *
 * One file can carry three kinds of rows, told apart by the `type` column:
 *
 *   type,external_id,name,cost,currency,date,slot,capacity,closed
 *   product,KAY-01,Ayung rafting (half day),,,,,,
 *   price,KAY-01,,45.00,USD,,,,
 *   availability,KAY-01,,,,2026-11-03,,12,no
 *   availability,KAY-01,,,,2026-11-04,08:00,,yes
 *
 * `external_id` is the supplier's own id. It is linked once, in Studio, to one
 * of our supplier offers (activity + package + the supplier's cost) through
 * `external_product_mappings`; from then on:
 *
 *   product       → keeps the supplier's name for the link (nothing else changes);
 *   price         → the offer's COST to us (never our selling price);
 *   availability  → the activity's places for that day (and time), or closed.
 *
 * Nothing is written by this file. `planImport` compares the rows with what
 * the database holds and says, row by row, what applying would do — that is
 * the preview Studio shows before anyone presses "Apply".
 */

import { parseMoneyInput } from '@/lib/money-input'

export const CSV_MAX_BYTES = 2 * 1024 * 1024
export const CSV_MAX_ROWS = 5000

export const CONFLICT_POLICIES = ['keep_ours', 'take_theirs', 'flag'] as const
export type ConflictPolicy = (typeof CONFLICT_POLICIES)[number]

export function isConflictPolicy(value: unknown): value is ConflictPolicy {
  return typeof value === 'string' && (CONFLICT_POLICIES as readonly string[]).includes(value)
}

/* --------------------------------------------------------------------------
   Parsing
   -------------------------------------------------------------------------- */

/**
 * RFC 4180 CSV: quoted fields, doubled quotes, commas and newlines inside
 * quotes, CRLF or LF. A UTF-8 byte-order mark (Excel) is dropped. The
 * delimiter is `;` when the header line has more semicolons than commas
 * (Excel in many locales saves that way), else `,`.
 */
export function parseCsv(input: string): string[][] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input
  const firstLine = text.slice(0, text.search(/\r?\n|$/))
  const delimiter =
    (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ','

  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 1
        } else quoted = false
      } else field += char
      continue
    }
    if (char === '"' && field === '') quoted = true
    else if (char === delimiter) {
      row.push(field)
      field = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += char
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  // Blank lines (a trailing newline, spacing rows) carry nothing.
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ''))
}

export const CSV_COLUMNS = [
  'type',
  'external_id',
  'name',
  'cost',
  'currency',
  'date',
  'slot',
  'capacity',
  'closed',
] as const

export type RowKind = 'product' | 'price' | 'availability'

export interface ImportRow {
  /** 1-based line in the file (the header is line 1). */
  line: number
  kind: RowKind
  externalId: string
  name: string | null
  costMinor: number | null
  currency: string | null
  date: string | null
  slot: string
  capacity: number | null
  closed: boolean | null
}

export interface RowError {
  line: number
  /** Dictionary key (Studio `int.csv_err_*`). */
  code: string
}

const YES = new Set(['yes', 'y', 'true', '1', 'closed', 'نعم', 'ya'])
const NO = new Set(['no', 'n', 'false', '0', 'open', '', 'لا', 'tidak'])

function cellOf(cells: readonly string[], index: number | undefined): string {
  return index === undefined ? '' : (cells[index] ?? '').trim()
}

/** Read the rows; every problem is reported with its line, never thrown. */
export function readImportRows(text: string): { rows: ImportRow[]; errors: RowError[] } {
  const table = parseCsv(text)
  const errors: RowError[] = []
  const header = (table[0] ?? []).map((cell) => cell.trim().toLowerCase())
  const index = new Map(header.map((name, at) => [name, at]))
  if (!index.has('type') || !index.has('external_id')) {
    return { rows: [], errors: [{ line: 1, code: 'header' }] }
  }
  const at = (name: (typeof CSV_COLUMNS)[number]) => index.get(name)

  const rows: ImportRow[] = []
  const body = table.slice(1)
  if (body.length > CSV_MAX_ROWS) {
    errors.push({ line: CSV_MAX_ROWS + 2, code: 'too_many_rows' })
  }
  body.slice(0, CSV_MAX_ROWS).forEach((cells, offset) => {
    const line = offset + 2
    const kind = cellOf(cells, at('type')).toLowerCase()
    const externalId = cellOf(cells, at('external_id'))
    if (kind !== 'product' && kind !== 'price' && kind !== 'availability') {
      errors.push({ line, code: 'type' })
      return
    }
    if (externalId === '' || externalId.length > 160) {
      errors.push({ line, code: 'external_id' })
      return
    }
    const name = cellOf(cells, at('name')) || null
    const currencyRaw = cellOf(cells, at('currency')).toUpperCase()
    const currency = currencyRaw === '' ? null : currencyRaw
    if (currency !== null && !/^[A-Z]{3}$/.test(currency)) {
      errors.push({ line, code: 'currency' })
      return
    }

    let costMinor: number | null = null
    if (kind === 'price') {
      if (currency === null) {
        errors.push({ line, code: 'currency' })
        return
      }
      const parsed = parseMoneyInput(cellOf(cells, at('cost')), currency)
      if (!parsed.ok) {
        errors.push({ line, code: 'cost' })
        return
      }
      costMinor = parsed.value
    }

    let date: string | null = null
    let slot = ''
    let capacity: number | null = null
    let closed: boolean | null = null
    if (kind === 'availability') {
      date = cellOf(cells, at('date'))
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
        errors.push({ line, code: 'date' })
        return
      }
      slot = cellOf(cells, at('slot'))
      if (slot !== '' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(slot)) {
        errors.push({ line, code: 'slot' })
        return
      }
      const capacityText = cellOf(cells, at('capacity'))
      if (capacityText !== '') {
        if (!/^\d{1,5}$/.test(capacityText)) {
          errors.push({ line, code: 'capacity' })
          return
        }
        capacity = Number(capacityText)
      }
      const closedText = cellOf(cells, at('closed')).toLowerCase()
      if (YES.has(closedText)) closed = true
      else if (NO.has(closedText)) closed = false
      else {
        errors.push({ line, code: 'closed' })
        return
      }
      if (capacity === null && closed === false && closedText === '') {
        // Neither places nor closed: nothing to say about this day.
        errors.push({ line, code: 'empty_availability' })
        return
      }
    }

    rows.push({ line, kind, externalId, name, costMinor, currency, date, slot, capacity, closed })
  })
  return { rows, errors }
}

/* --------------------------------------------------------------------------
   Preview diff
   -------------------------------------------------------------------------- */

export interface MappingState {
  externalId: string
  offerId: string
  label: string | null
  lastImportedAt: Date | null
}

export interface OfferState {
  id: string
  activityId: string
  costMinor: number
  currency: string
  updatedAt: Date
}

export interface AvailabilityState {
  capacity: number | null
  booked: number
  isClosed: boolean
  updatedAt: Date
}

export const availabilityKey = (activityId: string, day: string, slot: string) =>
  `${activityId}|${day}|${slot}`

export interface PlanContext {
  mappings: ReadonlyMap<string, MappingState>
  offers: ReadonlyMap<string, OfferState>
  availability: ReadonlyMap<string, AvailabilityState>
  policy: ConflictPolicy
}

export type ChangeStatus =
  /** Will be written. */
  | 'create'
  | 'update'
  /** Already as the file says. */
  | 'same'
  /** The supplier id is not linked to one of our offers yet. */
  | 'unmapped'
  /** Changed here since the last import, or would go below places already sold — needs a person. */
  | 'conflict'
  /** Our value kept on purpose (conflict policy "keep ours"). */
  | 'kept'
  /** The row repeats an earlier row for the same thing. */
  | 'duplicate'

export interface PlannedChange {
  line: number
  kind: RowKind
  externalId: string
  status: ChangeStatus
  /** Dictionary key explaining a conflict (`int.why_*`). */
  reason?: 'changed_here' | 'below_booked'
  offerId?: string
  activityId?: string
  date?: string
  slot?: string
  before?: {
    costMinor?: number
    currency?: string
    capacity?: number | null
    closed?: boolean
    label?: string | null
  }
  after?: {
    costMinor?: number
    currency?: string
    capacity?: number | null
    closed?: boolean
    label?: string | null
  }
}

export type PlanSummary = Record<ChangeStatus | 'invalid', number>

/** Will applying this change write something? */
export function isApplied(change: PlannedChange): boolean {
  return change.status === 'create' || change.status === 'update'
}

function changedHere(updatedAt: Date, mapping: MappingState): boolean {
  return mapping.lastImportedAt !== null && updatedAt.getTime() > mapping.lastImportedAt.getTime()
}

function resolveConflict(policy: ConflictPolicy): ChangeStatus {
  if (policy === 'take_theirs') return 'update'
  if (policy === 'keep_ours') return 'kept'
  return 'conflict'
}

export function planImport(
  rows: readonly ImportRow[],
  context: PlanContext,
  invalid = 0,
): { changes: PlannedChange[]; summary: PlanSummary } {
  const changes: PlannedChange[] = []
  const seen = new Set<string>()

  for (const row of rows) {
    const base = { line: row.line, kind: row.kind, externalId: row.externalId }
    const identity =
      row.kind === 'availability'
        ? `${row.kind}|${row.externalId}|${row.date}|${row.slot}`
        : `${row.kind}|${row.externalId}`
    if (seen.has(identity)) {
      changes.push({ ...base, status: 'duplicate' })
      continue
    }
    seen.add(identity)

    const mapping = context.mappings.get(row.externalId)
    const offer = mapping ? context.offers.get(mapping.offerId) : undefined
    if (!mapping || !offer) {
      changes.push({ ...base, status: 'unmapped' })
      continue
    }
    const target = { offerId: offer.id, activityId: offer.activityId }

    if (row.kind === 'product') {
      const same = row.name === null || row.name === mapping.label
      changes.push({
        ...base,
        ...target,
        status: same ? 'same' : 'update',
        before: { label: mapping.label },
        after: { label: row.name ?? mapping.label },
      })
      continue
    }

    if (row.kind === 'price') {
      const before = { costMinor: offer.costMinor, currency: offer.currency }
      const after = {
        costMinor: row.costMinor ?? offer.costMinor,
        currency: row.currency ?? offer.currency,
      }
      if (before.costMinor === after.costMinor && before.currency === after.currency) {
        changes.push({ ...base, ...target, status: 'same', before, after })
      } else if (changedHere(offer.updatedAt, mapping)) {
        const status = resolveConflict(context.policy)
        changes.push({
          ...base,
          ...target,
          status,
          ...(status === 'update' ? {} : { reason: 'changed_here' as const }),
          before,
          after,
        })
      } else {
        changes.push({ ...base, ...target, status: 'update', before, after })
      }
      continue
    }

    // availability
    const day = row.date ?? ''
    const key = availabilityKey(offer.activityId, day, row.slot)
    const existing = context.availability.get(key)
    const after = {
      capacity: row.capacity ?? existing?.capacity ?? null,
      closed: row.closed ?? existing?.isClosed ?? false,
    }
    const where = { date: day, slot: row.slot }
    if (!existing) {
      changes.push({ ...base, ...target, ...where, status: 'create', after })
      continue
    }
    const before = { capacity: existing.capacity, closed: existing.isClosed }
    if (after.capacity !== null && after.capacity < existing.booked) {
      // Never take away places already sold — whatever the policy says.
      changes.push({
        ...base,
        ...target,
        ...where,
        status: 'conflict',
        reason: 'below_booked',
        before,
        after,
      })
    } else if (before.capacity === after.capacity && before.closed === after.closed) {
      changes.push({ ...base, ...target, ...where, status: 'same', before, after })
    } else if (changedHere(existing.updatedAt, mapping)) {
      const status = resolveConflict(context.policy)
      changes.push({
        ...base,
        ...target,
        ...where,
        status,
        ...(status === 'update' ? {} : { reason: 'changed_here' as const }),
        before,
        after,
      })
    } else {
      changes.push({ ...base, ...target, ...where, status: 'update', before, after })
    }
  }

  const summary: PlanSummary = {
    create: 0,
    update: 0,
    same: 0,
    unmapped: 0,
    conflict: 0,
    kept: 0,
    duplicate: 0,
    invalid,
  }
  for (const change of changes) summary[change.status] += 1
  return { changes, summary }
}
