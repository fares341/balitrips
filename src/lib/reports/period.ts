/**
 * Report periods and comparison — pure, no database, no clock of its own.
 *
 * Every day boundary is a Bali day (WITA, UTC+8, no daylight saving): "today"
 * for the team in Bali is today, wherever the server or the person reading
 * happens to be.
 *
 * The comparison period is the stretch of the same length immediately before
 * — except "this month", which compares with the same days of last month
 * (1–20 October against 1–20 September), because comparing a part-month with
 * a whole one would always look like a drop.
 */

export const BALI_OFFSET_MS = 8 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

export const PERIOD_PRESETS = ['today', 'yesterday', '7d', '30d', 'month', 'custom'] as const
export type PeriodPreset = (typeof PERIOD_PRESETS)[number]

export function isPreset(value: unknown): value is PeriodPreset {
  return typeof value === 'string' && (PERIOD_PRESETS as readonly string[]).includes(value)
}

export type Bucket = 'hour' | 'day' | 'month'

export interface Period {
  preset: PeriodPreset
  /** Inclusive start instant. */
  start: Date
  /** Exclusive end instant. */
  end: Date
  prevStart: Date
  prevEnd: Date
  /** Bali calendar dates, inclusive: what the person picked. */
  fromDate: string
  toDate: string
  prevFromDate: string
  prevToDate: string
  bucket: Bucket
}

const DATE = /^\d{4}-\d{2}-\d{2}$/

/** Midnight (Bali) of the Bali calendar day containing `instant`. */
export function baliDayStart(instant: Date): Date {
  const local = new Date(instant.getTime() + BALI_OFFSET_MS)
  return new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - BALI_OFFSET_MS,
  )
}

/** `YYYY-MM-DD` of the Bali day containing `instant`. */
export function baliDate(instant: Date): string {
  return new Date(instant.getTime() + BALI_OFFSET_MS).toISOString().slice(0, 10)
}

/** Midnight (Bali) at the start of a Bali calendar date. */
export function baliMidnight(date: string): Date {
  return new Date(Date.parse(`${date}T00:00:00Z`) - BALI_OFFSET_MS)
}

function addDays(instant: Date, days: number): Date {
  return new Date(instant.getTime() + days * DAY_MS)
}

/** The longest custom range accepted (a little over two years). */
export const MAX_RANGE_DAYS = 800

export function resolvePeriod(
  input: { preset?: string | null; from?: string | null; to?: string | null },
  now: Date = new Date(),
): Period {
  const today = baliDayStart(now)
  let preset: PeriodPreset = isPreset(input.preset) ? input.preset : '30d'
  let start: Date
  let end: Date
  let prevStart: Date
  let prevEnd: Date

  switch (preset) {
    case 'today':
      start = today
      end = addDays(today, 1)
      break
    case 'yesterday':
      start = addDays(today, -1)
      end = today
      break
    case '7d':
      start = addDays(today, -6)
      end = addDays(today, 1)
      break
    case 'month': {
      const local = new Date(now.getTime() + BALI_OFFSET_MS)
      start = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - BALI_OFFSET_MS)
      end = addDays(today, 1)
      break
    }
    case 'custom': {
      const from = input.from && DATE.test(input.from) ? baliMidnight(input.from) : null
      const to = input.to && DATE.test(input.to) ? baliMidnight(input.to) : null
      if (
        from === null ||
        to === null ||
        Number.isNaN(from.getTime()) ||
        Number.isNaN(to.getTime())
      ) {
        preset = '30d'
        start = addDays(today, -29)
        end = addDays(today, 1)
        break
      }
      const [a, b] = from <= to ? [from, to] : [to, from]
      start = a
      end = addDays(b, 1)
      if ((end.getTime() - start.getTime()) / DAY_MS > MAX_RANGE_DAYS) {
        start = addDays(end, -MAX_RANGE_DAYS)
      }
      break
    }
    default:
      start = addDays(today, -29)
      end = addDays(today, 1)
  }

  if (preset === 'month') {
    // Same days of the previous month (clamped to its length).
    const local = new Date(start.getTime() + BALI_OFFSET_MS)
    const prevMonthStart = new Date(
      Date.UTC(local.getUTCFullYear(), local.getUTCMonth() - 1, 1) - BALI_OFFSET_MS,
    )
    const length = end.getTime() - start.getTime()
    prevStart = prevMonthStart
    prevEnd = new Date(Math.min(prevMonthStart.getTime() + length, start.getTime()))
  } else {
    const length = end.getTime() - start.getTime()
    prevEnd = start
    prevStart = new Date(start.getTime() - length)
  }

  const days = Math.round((end.getTime() - start.getTime()) / DAY_MS)
  return {
    preset,
    start,
    end,
    prevStart,
    prevEnd,
    fromDate: baliDate(start),
    toDate: baliDate(new Date(end.getTime() - 1)),
    prevFromDate: baliDate(prevStart),
    prevToDate: baliDate(new Date(prevEnd.getTime() - 1)),
    bucket: days <= 1 ? 'hour' : days > 120 ? 'month' : 'day',
  }
}

/**
 * Percentage change from `previous` to `current`.
 *
 * null when there is nothing to compare with (previous was 0 and current is
 * not — shown as "new", never as an invented +100%). 0 → 0 is 0.
 */
export function pctChange(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null
  if (previous === 0) return current === 0 ? 0 : null
  return ((current - previous) / Math.abs(previous)) * 100
}

/** Bucket keys covering [start, end) in Bali time: `HH`, `YYYY-MM-DD` or `YYYY-MM`. */
export function bucketKeys(start: Date, end: Date, bucket: Bucket): string[] {
  const keys: string[] = []
  if (bucket === 'hour') {
    for (let h = 0; h < 24; h += 1) keys.push(String(h).padStart(2, '0'))
    return keys
  }
  if (bucket === 'month') {
    let cursor = new Date(start.getTime() + BALI_OFFSET_MS)
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), 1))
    const last = new Date(end.getTime() - 1 + BALI_OFFSET_MS)
    while (cursor <= last) {
      keys.push(cursor.toISOString().slice(0, 7))
      cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1))
    }
    return keys
  }
  for (let t = start.getTime(); t < end.getTime(); t += DAY_MS) keys.push(baliDate(new Date(t)))
  return keys
}

/** The bucket an instant falls in. */
export function bucketOf(instant: Date, bucket: Bucket): string {
  const local = new Date(instant.getTime() + BALI_OFFSET_MS).toISOString()
  if (bucket === 'hour') return local.slice(11, 13)
  if (bucket === 'month') return local.slice(0, 7)
  return local.slice(0, 10)
}

/** Postgres expression format for the same buckets (`to_char` in Bali time). */
export function bucketSqlFormat(bucket: Bucket): string {
  return bucket === 'hour' ? 'HH24' : bucket === 'month' ? 'YYYY-MM' : 'YYYY-MM-DD'
}

/**
 * Align a series to its keys (missing buckets → 0). The previous period's
 * series is aligned by position, so day 3 is compared with day 3.
 */
export function alignSeries(
  keys: readonly string[],
  points: ReadonlyMap<string, number>,
): number[] {
  return keys.map((key) => points.get(key) ?? 0)
}
