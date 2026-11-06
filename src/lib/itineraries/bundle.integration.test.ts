import { randomUUID } from 'node:crypto'

import { eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'

import { db } from '@/db'
import { itineraries, itineraryDays, orderItems, orders } from '@/db/schema'
import type { Quote, QuoteRequestItem } from '@/lib/pricing/quote'
import {
  createTestActivity,
  createTestItinerary,
  createTestUser,
  deleteTestActivity,
  deleteTestItinerary,
  deleteTestUser,
  localizedFixture,
  testDay,
} from '@/test/integration/support'

import { bundleRuleFor, itineraryBundleDiscounts } from './bundle-server'

/**
 * «كل الفعاليات» against a real database: only the itinerary's owner gets
 * the discount, the percent is the itinerary's own, and a used discount is
 * not granted twice (usesPerPurchase = 1).
 */

const cleanup: (() => Promise<void>)[] = []
afterAll(async () => {
  for (const task of cleanup.reverse()) await task()
})

async function fixture() {
  const itinerary = await createTestItinerary()
  cleanup.push(() => deleteTestItinerary(itinerary.id))
  await db
    .update(itineraries)
    .set({ bundleDiscountPct: 20 })
    .where(eq(itineraries.id, itinerary.id))
  const a = await createTestActivity({ priceMinor: 10_000 })
  const b = await createTestActivity({ priceMinor: 5_000 })
  cleanup.push(
    () => deleteTestActivity(a.id),
    () => deleteTestActivity(b.id),
  )
  await db.insert(itineraryDays).values([
    { itineraryId: itinerary.id, dayNumber: 1, activityId: a.id, bookable: true },
    { itineraryId: itinerary.id, dayNumber: 2, activityId: b.id, bookable: true },
  ])
  cleanup.push(async () => {
    await db.delete(itineraryDays).where(eq(itineraryDays.itineraryId, itinerary.id))
  })
  return { itinerary, a, b }
}

async function buyer(itineraryId: string, adjustments: unknown = null) {
  const user = await createTestUser()
  cleanup.push(() => deleteTestUser(user.id))
  const [order] = await db
    .insert(orders)
    .values({
      orderNumber: `BT-IT-${randomUUID().slice(0, 12)}`,
      userId: user.id,
      status: 'paid',
      presentmentCurrency: 'SAR',
      subtotalMinor: 5_900,
      totalMinor: 5_900,
      customerSnapshot: { name: 'Fixture', email: user.email, locale: 'en' },
      placedAt: new Date(),
      adjustments: adjustments as never,
    })
    .returning({ id: orders.id })
  await db.insert(orderItems).values({
    orderId: order!.id,
    kind: 'itinerary',
    refId: itineraryId,
    nameSnapshot: localizedFixture('Fixture itinerary line'),
    unitPriceMinor: 5_900,
    quantity: 1,
    lineTotalMinor: 5_900,
  })
  return user
}

/**
 * A cart of the given activities, tagged for the itinerary, as the quote
 * engine would price it (2 guests × price). The pricing engine has its own
 * tests; this suite is about who gets the discount.
 */
function cartQuote(itineraryId: string, acts: { id: string; priceMinor: number }[]) {
  const items: QuoteRequestItem[] = acts.map((act, index) => ({
    id: `l${index}`,
    kind: 'activity',
    refId: act.id,
    quantity: 2,
    travelDate: testDay(60 + index),
    travelTime: '09:00',
    guests: 2,
    endDate: null,
    parentItemId: null,
    options: { itineraryBundle: itineraryId },
  }))
  const lines = items.map((item, index) => ({
    itemId: item.id,
    kind: item.kind,
    refId: item.refId,
    unitPriceMinor: acts[index]!.priceMinor,
    quantity: 2,
    lineTotalMinor: acts[index]!.priceMinor * 2,
    currency: 'SAR',
  }))
  const subtotalMinor = lines.reduce((sum, line) => sum + line.lineTotalMinor, 0)
  const quote: Quote = {
    lines,
    subtotalMinor,
    totalMinor: subtotalMinor,
    currency: 'SAR',
    issues: [],
    ok: true,
  }
  return { items, quote, snapshot: { activityTiers: new Map() } }
}

describe('«كل الفعاليات» — server checks', () => {
  it('gives the owner the itinerary percent on the full set, nobody else', async () => {
    const { itinerary, a, b } = await fixture()
    const owner = await buyer(itinerary.id)
    const stranger = await createTestUser()
    cleanup.push(() => deleteTestUser(stranger.id))

    const all = cartQuote(itinerary.id, [a, b])
    const granted = await itineraryBundleDiscounts(all.items, all.quote, all.snapshot, owner.id)
    expect(granted).toHaveLength(1)
    expect(granted[0]!.amountMinor).toBe(Math.floor((all.quote.subtotalMinor * 20 + 50) / 100))
    expect(granted[0]!.itineraryId).toBe(itinerary.id)

    // A stranger tagging the same lines gets nothing.
    expect(await itineraryBundleDiscounts(all.items, all.quote, all.snapshot, stranger.id)).toEqual(
      [],
    )
    expect(await itineraryBundleDiscounts(all.items, all.quote, all.snapshot, null)).toEqual([])

    // The owner with only part of the set: normal price.
    const part = cartQuote(itinerary.id, [a])
    expect(await itineraryBundleDiscounts(part.items, part.quote, part.snapshot, owner.id)).toEqual(
      [],
    )
  })

  it('is not granted again once a paid order used it', async () => {
    const { itinerary } = await fixture()
    const owner = await buyer(itinerary.id, [
      { kind: 'discount', amountMinor: 100, code: 'ALL-ACTIVITIES', itineraryId: itinerary.id },
    ])
    const rule = await bundleRuleFor(itinerary.id, owner.id)
    expect(rule.usesLeft).toBe(0)
    expect(rule.eligible).toBe(false)
  })
})
