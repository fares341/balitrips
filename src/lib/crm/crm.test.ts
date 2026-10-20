import { describe, expect, it } from 'vitest'

import { canonicalEmail, editDistance, findDuplicateGroups, nameKey, phoneKey } from './duplicates'
import { checkMerge, tagsToMove, type MergeSide } from './merge'
import { computeStage, normalizeTag } from './stage'

const NOW = new Date('2026-10-20T00:00:00Z')
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000)

describe('customer stage', () => {
  const base = { manual: null, paidOrders: 0, firstPaidAt: null, lastPaidAt: null, hasVip: false }

  it('is computed from paid orders', () => {
    expect(computeStage(base, NOW)).toBe('lead')
    expect(
      computeStage(
        { ...base, paidOrders: 1, firstPaidAt: daysAgo(3), lastPaidAt: daysAgo(3) },
        NOW,
      ),
    ).toBe('new')
    expect(
      computeStage(
        { ...base, paidOrders: 1, firstPaidAt: daysAgo(90), lastPaidAt: daysAgo(90) },
        NOW,
      ),
    ).toBe('active')
    expect(
      computeStage(
        { ...base, paidOrders: 2, firstPaidAt: daysAgo(200), lastPaidAt: daysAgo(5) },
        NOW,
      ),
    ).toBe('repeat')
    expect(
      computeStage(
        { ...base, paidOrders: 3, firstPaidAt: daysAgo(200), lastPaidAt: daysAgo(5) },
        NOW,
      ),
    ).toBe('vip')
    expect(
      computeStage(
        { ...base, paidOrders: 1, firstPaidAt: daysAgo(10), lastPaidAt: daysAgo(10), hasVip: true },
        NOW,
      ),
    ).toBe('vip')
    expect(
      computeStage(
        { ...base, paidOrders: 4, firstPaidAt: daysAgo(900), lastPaidAt: daysAgo(400) },
        NOW,
      ),
    ).toBe('inactive')
  })

  it('a stage set by staff wins; junk is ignored', () => {
    expect(computeStage({ ...base, manual: 'vip' }, NOW)).toBe('vip')
    expect(computeStage({ ...base, manual: 'gold' }, NOW)).toBe('lead')
  })

  it('normalises tags', () => {
    expect(normalizeTag('  Honeymoon Couple ')).toBe('honeymoon-couple')
    expect(normalizeTag('عائلة كبيرة')).toBe('عائلة-كبيرة')
    expect(normalizeTag('!!!')).toBeNull()
  })
})

describe('duplicate detection', () => {
  it('normalises e-mail, phone and name', () => {
    expect(canonicalEmail('Sara.Ali+trip@GMAIL.com')).toBe('saraali@gmail.com')
    expect(canonicalEmail('x@phone.balitrips.invalid')).toBeNull()
    expect(phoneKey('+62 812-3456-7890')).toBe(phoneKey('0812 3456 7890'))
    expect(phoneKey('٠٨١٢٣٤٥٦٧٨٩٠')).toBe(phoneKey('0812 3456 7890'))
    expect(nameKey('  José  Ñúñez ')).toBe('jose nunez')
    expect(editDistance('mohammed', 'mohamed')).toBe(1)
  })

  it('groups the same mailbox, the same number, or a similar name with the same number', () => {
    const groups = findDuplicateGroups([
      { id: 'a', email: 'sara.ali@gmail.com', phone: null, name: 'Sara Ali' },
      { id: 'b', email: 'saraali+bali@gmail.com', phone: null, name: 'Sara' },
      { id: 'c', email: 'm1@example.com', phone: '+62 812 3456 7890', name: 'Mohammed Saleh' },
      { id: 'd', email: 'm2@example.com', phone: '0812 3456 7890', name: 'Mohamed Saleh' },
      { id: 'e', email: 'k1@example.com', phone: '+966 50 123 4567', name: 'Khalid Omar' },
      { id: 'f', email: 'k2@example.com', phone: '+971 55 123 4567', name: 'Khaled Omar' },
      { id: 'g', email: 'other@example.com', phone: '+971 56 123 4567', name: 'Someone Else' },
      { id: 'h', email: 'solo@example.com', phone: '+1 202 555 0100', name: 'Solo' },
    ])
    expect(groups).toContainEqual({ reason: 'email', ids: ['a', 'b'] })
    expect(groups).toContainEqual({ reason: 'phone', ids: ['c', 'd'] })
    expect(groups).toContainEqual({ reason: 'name_phone', ids: ['e', 'f'] })
    expect(groups.some((group) => group.ids.includes('h'))).toBe(false)
    // Different name on a matching short number is not suggested.
    expect(groups.some((g) => g.reason === 'name_phone' && g.ids.includes('g'))).toBe(false)
  })
})

describe('merge safety', () => {
  const side = (overrides: Partial<MergeSide> = {}): MergeSide => ({
    id: 'u1',
    role: 'customer',
    status: 'active',
    deletedAt: null,
    mergedIntoUserId: null,
    ...overrides,
  })

  it('refuses anything but two live, unmerged customer accounts', () => {
    expect(checkMerge(side(), side())).toBe('same_account')
    expect(checkMerge(side(), side({ id: 'u2', role: 'staff' }))).toBe('staff_account')
    expect(checkMerge(side({ role: 'admin' }), side({ id: 'u2' }))).toBe('staff_account')
    expect(checkMerge(side(), side({ id: 'u2', deletedAt: NOW }))).toBe('deleted')
    expect(checkMerge(side(), side({ id: 'u2', mergedIntoUserId: 'u9' }))).toBe('already_merged')
    expect(checkMerge(side(), side({ id: 'u2' }))).toBeNull()
  })

  it('moves only the tags the kept account lacks', () => {
    expect(tagsToMove(['vip', 'family'], ['family', 'diver', 'diver'])).toEqual(['diver'])
  })
})
