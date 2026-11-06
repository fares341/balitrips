import { randomBytes } from 'node:crypto'

import { eq, inArray } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'

import { db } from '@/db'
import { cartItems, cartReminders, carts, leadContacts, orders } from '@/db/schema'
import {
  createAnonymousCart,
  createCartForUser,
  createTestUser,
  deleteCart,
  deleteTestUser,
} from '@/test/integration/support'

import { runAbandonedCartSweep, type AbandonedCandidate, type SweepDeps } from './abandoned'
import { upsertLead } from './capture'
import { parseLeadSettings } from './settings'

const cleanup: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const task of cleanup.splice(0).reverse()) await task()
})

const settings = parseLeadSettings({ abandonedEnabled: true, abandonedDelayMinutes: 60 })

function recorder() {
  const sent: { channel: 'whatsapp' | 'email'; cartId: string }[] = []
  const deps: SweepDeps = {
    async sendWhatsapp(c: AbandonedCandidate) {
      sent.push({ channel: 'whatsapp', cartId: c.cart_id })
    },
    async sendEmail(c: AbandonedCandidate) {
      sent.push({ channel: 'email', cartId: c.cart_id })
    },
  }
  return { sent, deps }
}

async function staleCart(cartId: string, minutesAgo = 90): Promise<void> {
  const at = new Date(Date.now() - minutesAgo * 60_000)
  await db.insert(cartItems).values({ cartId, kind: 'place', unitPriceMinor: 1000 })
  await db.execute(
    // Backdate both the cart and its line past the reminder delay.
    (await import('drizzle-orm'))
      .sql`update carts set updated_at = ${at.toISOString()}::timestamptz where id = ${cartId}`,
  )
  await db.update(cartItems).set({ updatedAt: at }).where(eq(cartItems.cartId, cartId))
}

async function guestLead(consent: boolean) {
  const token = randomBytes(16).toString('hex')
  const cartId = await createAnonymousCart(token)
  const suffix = randomBytes(4).readUInt32BE(0) % 10_000_000
  const lead = await upsertLead({
    source: 'popup',
    name: 'Fixture Lead',
    phone: `+9665${String(suffix).padStart(8, '0')}`,
    email: `lead-${token.slice(0, 8)}@example.test`,
    locale: 'ar',
    cartToken: token,
    whatsappConsent: consent,
    emailConsent: consent,
    consentText: 'fixture consent',
  })
  cleanup.push(async () => {
    await db.delete(cartReminders).where(eq(cartReminders.cartId, cartId))
    await deleteCart(cartId)
    if (lead) await db.delete(leadContacts).where(eq(leadContacts.id, lead.id))
  })
  return { cartId, lead }
}

describe('abandoned-cart reminder', () => {
  it('reminds a consenting lead exactly once per cart', async () => {
    const { cartId, lead } = await guestLead(true)
    expect(lead?.whatsappConsentAt).toBeInstanceOf(Date)
    expect(lead?.consentText).toBe('fixture consent')
    await staleCart(cartId)
    const first = recorder()
    await runAbandonedCartSweep({ settings, deps: first.deps })
    expect(
      first.sent
        .filter((s) => s.cartId === cartId)
        .map((s) => s.channel)
        .sort(),
    ).toEqual(['email', 'whatsapp'])
    const second = recorder()
    await runAbandonedCartSweep({ settings, deps: second.deps })
    expect(second.sent.filter((s) => s.cartId === cartId)).toEqual([])
    const rows = await db.select().from(cartReminders).where(eq(cartReminders.cartId, cartId))
    expect(rows).toHaveLength(1)
  })

  it('sends nothing to a lead without consent', async () => {
    const { cartId } = await guestLead(false)
    await staleCart(cartId)
    const run = recorder()
    await runAbandonedCartSweep({ settings, deps: run.deps })
    expect(run.sent.filter((s) => s.cartId === cartId)).toEqual([])
  })

  it('waits for the delay', async () => {
    const { cartId } = await guestLead(true)
    await staleCart(cartId, 10)
    const run = recorder()
    await runAbandonedCartSweep({ settings, deps: run.deps })
    expect(run.sent.filter((s) => s.cartId === cartId)).toEqual([])
  })

  it('stops once an order was placed', async () => {
    const user = await createTestUser()
    await db
      .update((await import('@/db/schema')).users)
      .set({ marketingConsent: true, marketingConsentAt: new Date() })
      .where(eq((await import('@/db/schema')).users.id, user.id))
    const cartId = await createCartForUser(user.id)
    cleanup.push(async () => {
      await db.delete(cartReminders).where(eq(cartReminders.cartId, cartId))
      await db.delete(leadContacts).where(eq(leadContacts.userId, user.id))
      await deleteCart(cartId)
      await deleteTestUser(user.id)
    })
    await staleCart(cartId)
    const [order] = await db
      .insert(orders)
      .values({
        orderNumber: `BT-IT-${randomBytes(4).toString('hex')}`,
        userId: user.id,
        status: 'paid',
        presentmentCurrency: 'SAR',
        subtotalMinor: 1000,
        totalMinor: 1000,
        customerSnapshot: { name: 'Fixture', email: user.email, locale: 'en' },
      } as typeof orders.$inferInsert)
      .returning({ id: orders.id })
    cleanup.push(async () => {
      if (order) await db.delete(orders).where(inArray(orders.id, [order.id]))
    })
    const run = recorder()
    await runAbandonedCartSweep({ settings, deps: run.deps })
    expect(run.sent.filter((s) => s.cartId === cartId)).toEqual([])
  })

  it('does nothing while switched off', async () => {
    const { cartId } = await guestLead(true)
    await staleCart(cartId)
    const run = recorder()
    const count = await runAbandonedCartSweep({ settings: parseLeadSettings({}), deps: run.deps })
    expect(count).toBe(0)
    expect(run.sent).toEqual([])
    void carts
  })
})

describe('lead records', () => {
  it('keeps consent once given and returns the same single-use code', async () => {
    const { lead } = await guestLead(true)
    expect(lead).not.toBeNull()
    // Same person again, no tick: consent is not withdrawn by absence.
    const again = await upsertLead({ source: 'checkout', phone: lead!.phone, locale: 'en' })
    expect(again?.id).toBe(lead!.id)
    expect(again?.whatsappConsent).toBe(true)
    expect(again?.source).toBe('popup')
    const { ensureLeadCoupon } = await import('./capture')
    const { coupons } = await import('@/db/schema')
    const first = await ensureLeadCoupon(again!, settings)
    const [fresh] = await db.select().from(leadContacts).where(eq(leadContacts.id, lead!.id))
    const second = await ensureLeadCoupon(fresh!, settings)
    expect(second?.code).toBe(first?.code)
    const [coupon] = await db.select().from(coupons).where(eq(coupons.code, first!.code))
    expect(coupon?.maxUses).toBe(1)
    expect(coupon?.value).toBe(1000)
    cleanup.push(async () => {
      await db.update(leadContacts).set({ couponId: null }).where(eq(leadContacts.id, lead!.id))
      await db.delete(coupons).where(eq(coupons.code, first!.code))
    })
  })
})
