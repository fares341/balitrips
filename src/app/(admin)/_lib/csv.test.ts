import { describe, expect, it } from 'vitest'

import { csvBody, csvCell } from './csv'

describe('csv', () => {
  it('quotes and escapes', () => {
    expect(csvCell('a "b", c')).toBe('"a ""b"", c"')
    expect(csvCell(null)).toBe('""')
    expect(csvCell(12)).toBe('"12"')
  })

  it('neutralises spreadsheet formulas', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`)
    expect(csvCell('+1')).toBe(`"'+1"`)
    expect(csvCell('-2')).toBe(`"'-2"`)
    expect(csvCell('@cmd')).toBe(`"'@cmd"`)
  })

  it('writes dates as ISO and objects as JSON', () => {
    expect(csvCell(new Date('2026-01-02T03:04:05Z'))).toBe('"2026-01-02T03:04:05.000Z"')
    expect(csvCell({ a: 1 })).toBe('"{""a"":1}"')
  })

  it('starts with a BOM and uses CRLF', () => {
    const body = csvBody(['x'], [['أ']])
    expect(body.startsWith('﻿')).toBe(true)
    expect(body).toBe('﻿"x"\r\n"أ"\r\n')
  })
})
