import { describe, expect, it } from 'vitest'

import {
  availabilityKey,
  isApplied,
  parseCsv,
  planImport,
  readImportRows,
  type AvailabilityState,
  type MappingState,
  type OfferState,
  type PlanContext,
} from './csv'

describe('parseCsv', () => {
  it('handles quotes, doubled quotes, embedded commas and newlines, CRLF and a BOM', () => {
    const text = '﻿a,b,c\r\n"x, y","he said ""hi""","line\nbreak"\r\n\r\n1,2,3'
    expect(parseCsv(text)).toEqual([
      ['a', 'b', 'c'],
      ['x, y', 'he said "hi"', 'line\nbreak'],
      ['1', '2', '3'],
    ])
  })

  it('reads semicolon files (Excel in many locales)', () => {
    expect(parseCsv('type;external_id\nprice;A1')).toEqual([
      ['type', 'external_id'],
      ['price', 'A1'],
    ])
  })
})

describe('readImportRows', () => {
  it('needs the type and external_id columns', () => {
    expect(readImportRows('name,cost\nx,1').errors).toEqual([{ line: 1, code: 'header' }])
  })

  it('reads each kind of row and reports bad lines with their line number', () => {
    const text = [
      'type,external_id,name,cost,currency,date,slot,capacity,closed',
      'product,KAY-01,Ayung rafting,,,,,,',
      'price,KAY-01,,45.50,usd,,,,',
      'availability,KAY-01,,,,2026-11-03,,12,no',
      'availability,KAY-01,,,,2026-11-04,08:00,,yes',
      'price,KAY-02,,abc,USD,,,,',
      'price,KAY-03,,10,,,,,',
      'availability,KAY-01,,,,03/11/2026,,,',
      'availability,KAY-01,,,,2026-11-05,25:00,,',
      'availability,KAY-01,,,,2026-11-06,,,',
      'refund,KAY-01,,,,,,,',
      'price,,,1,USD,,,,',
    ].join('\n')
    const { rows, errors } = readImportRows(text)
    expect(rows.map((row) => [row.line, row.kind])).toEqual([
      [2, 'product'],
      [3, 'price'],
      [4, 'availability'],
      [5, 'availability'],
    ])
    expect(rows[1]).toMatchObject({ costMinor: 4550, currency: 'USD' })
    expect(rows[2]).toMatchObject({ date: '2026-11-03', slot: '', capacity: 12, closed: false })
    expect(rows[3]).toMatchObject({ slot: '08:00', capacity: null, closed: true })
    expect(errors).toEqual([
      { line: 6, code: 'cost' },
      { line: 7, code: 'currency' },
      { line: 8, code: 'date' },
      { line: 9, code: 'slot' },
      { line: 10, code: 'empty_availability' },
      { line: 11, code: 'type' },
      { line: 12, code: 'external_id' },
    ])
  })

  it('uses the currency’s own minor units', () => {
    const { rows } = readImportRows('type,external_id,cost,currency\nprice,A,150000,IDR')
    expect(rows[0]?.costMinor).toBe(15_000_000)
  })
})

const LAST_IMPORT = new Date('2026-10-01T00:00:00Z')
const BEFORE = new Date('2026-09-01T00:00:00Z')
const AFTER = new Date('2026-10-05T00:00:00Z')

function context(overrides: Partial<PlanContext> = {}): PlanContext {
  const mappings = new Map<string, MappingState>([
    [
      'KAY-01',
      { externalId: 'KAY-01', offerId: 'offer-1', label: 'Rafting', lastImportedAt: LAST_IMPORT },
    ],
    [
      'KAY-02',
      { externalId: 'KAY-02', offerId: 'offer-2', label: null, lastImportedAt: LAST_IMPORT },
    ],
    ['NEW-01', { externalId: 'NEW-01', offerId: 'offer-3', label: null, lastImportedAt: null }],
  ])
  const offers = new Map<string, OfferState>([
    [
      'offer-1',
      { id: 'offer-1', activityId: 'act-1', costMinor: 4000, currency: 'USD', updatedAt: BEFORE },
    ],
    // Edited here after the last import.
    [
      'offer-2',
      { id: 'offer-2', activityId: 'act-2', costMinor: 9000, currency: 'USD', updatedAt: AFTER },
    ],
    [
      'offer-3',
      { id: 'offer-3', activityId: 'act-3', costMinor: 1000, currency: 'USD', updatedAt: AFTER },
    ],
  ])
  const availability = new Map<string, AvailabilityState>([
    [
      availabilityKey('act-1', '2026-11-03', ''),
      { capacity: 20, booked: 15, isClosed: false, updatedAt: BEFORE },
    ],
    [
      availabilityKey('act-1', '2026-11-04', ''),
      { capacity: 10, booked: 0, isClosed: false, updatedAt: BEFORE },
    ],
    [
      availabilityKey('act-2', '2026-11-03', ''),
      { capacity: 8, booked: 0, isClosed: false, updatedAt: AFTER },
    ],
  ])
  return { mappings, offers, availability, policy: 'flag', ...overrides }
}

const FILE = [
  'type,external_id,name,cost,currency,date,slot,capacity,closed',
  'product,KAY-01,Ayung rafting,,,,,,', // 2 label update
  'price,KAY-01,,45.00,USD,,,,', // 3 update
  'price,KAY-02,,95.00,USD,,,,', // 4 changed here → policy
  'price,NEW-01,,12.00,USD,,,,', // 5 never imported → update
  'price,GHOST,,1.00,USD,,,,', // 6 not linked
  'availability,KAY-01,,,,2026-11-03,,10,no', // 7 below booked (15 sold)
  'availability,KAY-01,,,,2026-11-04,,10,no', // 8 same
  'availability,KAY-01,,,,2026-11-05,,6,no', // 9 new day
  'availability,KAY-02,,,,2026-11-03,,4,no', // 10 changed here → policy
  'price,KAY-01,,46.00,USD,,,,', // 11 duplicate of line 3
].join('\n')

function plan(policy: PlanContext['policy']) {
  const { rows, errors } = readImportRows(FILE)
  return planImport(rows, context({ policy }), errors.length)
}

describe('planImport (the preview diff)', () => {
  it('says what applying would do, row by row', () => {
    const { changes, summary } = plan('flag')
    expect(changes.map((change) => [change.line, change.status, change.reason ?? null])).toEqual([
      [2, 'update', null],
      [3, 'update', null],
      [4, 'conflict', 'changed_here'],
      [5, 'update', null],
      [6, 'unmapped', null],
      [7, 'conflict', 'below_booked'],
      [8, 'same', null],
      [9, 'create', null],
      [10, 'conflict', 'changed_here'],
      [11, 'duplicate', null],
    ])
    expect(summary).toEqual({
      create: 1,
      update: 3,
      same: 1,
      unmapped: 1,
      conflict: 3,
      kept: 0,
      duplicate: 1,
      invalid: 0,
    })
    expect(changes[1]).toMatchObject({
      offerId: 'offer-1',
      before: { costMinor: 4000, currency: 'USD' },
      after: { costMinor: 4500, currency: 'USD' },
    })
    expect(changes[7]).toMatchObject({
      activityId: 'act-1',
      date: '2026-11-05',
      after: { capacity: 6 },
    })
  })

  it('follows the conflict policy, but never takes away places already sold', () => {
    const theirs = plan('take_theirs').changes
    expect(theirs.find((change) => change.line === 4)?.status).toBe('update')
    expect(theirs.find((change) => change.line === 10)?.status).toBe('update')
    expect(theirs.find((change) => change.line === 7)?.status).toBe('conflict')

    const ours = plan('keep_ours').changes
    expect(ours.find((change) => change.line === 4)).toMatchObject({
      status: 'kept',
      reason: 'changed_here',
    })
    expect(ours.find((change) => change.line === 7)?.status).toBe('conflict')
  })

  it('writes only create and update rows', () => {
    const applied = plan('flag')
      .changes.filter(isApplied)
      .map((change) => change.line)
    expect(applied).toEqual([2, 3, 5, 9])
  })

  it('counts unreadable lines in the summary', () => {
    const { rows, errors } = readImportRows('type,external_id,cost,currency\nprice,KAY-01,x,USD')
    expect(planImport(rows, context(), errors.length).summary.invalid).toBe(1)
  })
})
