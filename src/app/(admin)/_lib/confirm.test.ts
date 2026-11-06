import { describe, expect, it } from 'vitest'

import { assertTypedValue, assertTypedWord, matchesTyped, normalizeTyped } from './confirm'

function form(confirm?: string): FormData {
  const data = new FormData()
  if (confirm !== undefined) data.set('confirm', confirm)
  return data
}

describe('refund confirmation (typed order number)', () => {
  it('accepts the exact order number, ignoring case and outer spaces', () => {
    expect(() => assertTypedValue(form('BT-2026-0042'), 'BT-2026-0042', 'no')).not.toThrow()
    expect(() => assertTypedValue(form('  bt-2026-0042 '), 'BT-2026-0042', 'no')).not.toThrow()
  })

  it('accepts a value pasted with bidi marks from an Arabic page', () => {
    expect(() => assertTypedValue(form('‏BT-2026-0042‎'), 'BT-2026-0042', 'no')).not.toThrow()
  })

  it('rejects a missing, empty or different value with the given message', () => {
    expect(() => assertTypedValue(form(), 'BT-2026-0042', 'mismatch')).toThrow('mismatch')
    expect(() => assertTypedValue(form(''), 'BT-2026-0042', 'mismatch')).toThrow('mismatch')
    expect(() => assertTypedValue(form('BT-2026-0043'), 'BT-2026-0042', 'mismatch')).toThrow(
      'mismatch',
    )
    expect(() => assertTypedValue(form('BT-2026-004'), 'BT-2026-0042', 'mismatch')).toThrow()
  })

  it('never matches an empty expected value', () => {
    expect(matchesTyped('', '')).toBe(false)
    expect(matchesTyped(' ', '  ')).toBe(false)
  })

  it('folds full-width digits to ASCII', () => {
    expect(normalizeTyped('ＢＴ-１')).toBe('bt-1')
  })
})

describe('ban / revoke typed word', () => {
  it('accepts the word in any Studio language', () => {
    for (const word of ['BAN', 'ban', 'حظر', 'BLOKIR']) {
      expect(() => assertTypedWord(form(word), 'ban', 'no')).not.toThrow()
    }
    for (const word of ['REVOKE', 'إلغاء', 'cabut']) {
      expect(() => assertTypedWord(form(word), 'revoke', 'no')).not.toThrow()
    }
  })

  it('rejects the wrong word or none', () => {
    expect(() => assertTypedWord(form('REVOKE'), 'ban', 'typed')).toThrow('typed')
    expect(() => assertTypedWord(form(), 'revoke', 'typed')).toThrow('typed')
    expect(() => assertTypedWord(form('yes'), 'revoke', 'typed')).toThrow('typed')
  })
})
