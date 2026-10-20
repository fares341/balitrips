/**
 * Invoice numbers: BT-INV-YYYY-NNNNN.
 *
 * Sequential and gap-free per calendar year in Bali time. The counter lives in
 * `invoice_counters` (one row per year) and is advanced with a single
 * `INSERT … ON CONFLICT DO UPDATE … RETURNING` inside the transaction that
 * marks the order paid (see `./paid.ts`). Postgres holds that row's lock until
 * the transaction ends, so:
 *
 *   - two payments committing at once queue on the row and get n and n+1;
 *   - a payment whose transaction rolls back rolls its increment back too,
 *     so the next payment reuses the number — no gap;
 *   - an order that already has a number keeps it (checked under the order's
 *     own row lock), so a replayed webhook never issues a second one.
 *
 * A Postgres SEQUENCE would be simpler but is NOT gap-free: `nextval` is
 * never rolled back.
 */

export const INVOICE_PREFIX = 'BT-INV'

/** The calendar year of an instant in Bali (UTC+8, no daylight saving). */
export function baliYear(at: Date): number {
  return new Date(at.getTime() + 8 * 60 * 60 * 1000).getUTCFullYear()
}

export function formatInvoiceNumber(year: number, sequence: number): string {
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new Error(`Invoice sequence must be a positive integer, got ${sequence}`)
  }
  return `${INVOICE_PREFIX}-${year}-${String(sequence).padStart(5, '0')}`
}

export function parseInvoiceNumber(value: string): { year: number; sequence: number } | null {
  const match = /^BT-INV-(\d{4})-(\d{5,})$/.exec(value)
  if (!match) return null
  return { year: Number(match[1]), sequence: Number(match[2]) }
}

/**
 * The counter's contract, independent of the database: given the stored row
 * (or none) and an order that may already be numbered, what to store and what
 * the order gets. `./paid.ts` does the same thing in one SQL statement; this
 * is the same rule in a form a unit test can drive concurrently.
 */
export function nextInvoiceState(
  stored: number | null,
  existing: string | null,
  year: number,
): { store: number | null; number: string } {
  if (existing !== null) return { store: null, number: existing }
  const next = (stored ?? 0) + 1
  return { store: next, number: formatInvoiceNumber(year, next) }
}
