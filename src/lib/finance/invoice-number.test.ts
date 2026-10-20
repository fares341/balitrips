import { describe, expect, it } from 'vitest'

import {
  baliYear,
  formatInvoiceNumber,
  nextInvoiceState,
  parseInvoiceNumber,
} from './invoice-number'

describe('invoice numbers', () => {
  it('are BT-INV-YYYY-NNNNN', () => {
    expect(formatInvoiceNumber(2026, 1)).toBe('BT-INV-2026-00001')
    expect(formatInvoiceNumber(2026, 123_456)).toBe('BT-INV-2026-123456')
    expect(parseInvoiceNumber('BT-INV-2026-00042')).toEqual({ year: 2026, sequence: 42 })
    expect(() => formatInvoiceNumber(2026, 0)).toThrow()
  })

  it('belong to the Bali calendar year', () => {
    // 31 Dec 17:00 UTC is already 1 Jan in Bali.
    expect(baliYear(new Date('2026-12-31T17:00:00Z'))).toBe(2027)
    expect(baliYear(new Date('2026-12-31T15:59:59Z'))).toBe(2026)
  })

  it('never renumber an order that already has one', () => {
    expect(nextInvoiceState(7, 'BT-INV-2026-00003', 2026)).toEqual({
      store: null,
      number: 'BT-INV-2026-00003',
    })
    expect(nextInvoiceState(null, null, 2027)).toEqual({ store: 1, number: 'BT-INV-2027-00001' })
  })

  /**
   * The database version holds the counter row's lock until the payment's
   * transaction ends, and rolls the increment back with it. Model exactly
   * that — one lock, commit or roll back — and run many payments at once.
   */
  it('stay sequential and gap-free under concurrent payments, with rollbacks', async () => {
    let stored: number | null = null
    let queue = Promise.resolve()
    const issued: string[] = []

    const pay = (fail: boolean, existing: string | null = null) => {
      const run = queue.then(async () => {
        const before = stored
        const step = nextInvoiceState(stored, existing, 2026)
        if (step.store !== null) stored = step.store
        await new Promise((resolve) => setTimeout(resolve, Math.random() * 3))
        if (fail) {
          stored = before // transaction rolled back: the number goes back too
          return
        }
        if (existing === null) issued.push(step.number)
      })
      queue = run.catch(() => undefined)
      return run
    }

    await Promise.all(
      Array.from({ length: 40 }, (_, i) =>
        pay(i % 7 === 3, i % 11 === 5 ? 'BT-INV-2026-99999' : null),
      ),
    )

    const sequences = issued.map((n) => parseInvoiceNumber(n)?.sequence)
    expect(new Set(issued).size).toBe(issued.length)
    expect(sequences).toEqual(Array.from({ length: issued.length }, (_, i) => i + 1))
    expect(stored).toBe(issued.length)
  })
})
