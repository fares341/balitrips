import { randomUUID } from 'node:crypto'

import { and, eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'

import { db } from '@/db'
import { entitlements, orderItems, orders, payments, plans } from '@/db/schema'
import { loadPermissions } from '@/lib/entitlements/plans'
import { deviceLimitFor } from '@/lib/security/devices'
import { processWebhookEvent } from '@/lib/orders/webhook'
import {
  FIXTURE_PREFIX,
  createTestUser,
  deleteFixtureWebhookEvents,
  deleteTestOrder,
  deleteTestUser,
  fixtureId,
} from '@/test/integration/support'

/**
 * شراء باقة من البداية للنهاية على قاعدة بيانات حقيقية:
 * طلب معلّق ← webhook "نجح الدفع" ← صلاحية بمدة الباقة وحد أجهزتها.
 */

const orderIds: string[] = []
const userIds: string[] = []
const planIds: string[] = []

async function seed(durationDays: number | null, deviceLimit: number) {
  const user = await createTestUser()
  userIds.push(user.id)

  const [plan] = await db
    .insert(plans)
    .values({
      slug: `it-${randomUUID().slice(0, 8)}`,
      name: { en: 'IT plan', ar: 'IT', id: 'IT' },
      priceMinor: 1900,
      currency: 'USD',
      entitlementKind: 'vip',
      durationDays,
      deviceLimit,
      canUseTrip: false,
      status: 'published',
    })
    .returning()
  if (!plan) throw new Error('plan')
  planIds.push(plan.id)

  const [order] = await db
    .insert(orders)
    .values({
      orderNumber: `BT-IT-${randomUUID().slice(0, 12)}`,
      userId: user.id,
      status: 'pending',
      presentmentCurrency: 'USD',
      subtotalMinor: 1900,
      totalMinor: 1900,
      customerSnapshot: { name: 'Fixture', email: user.email, locale: 'en' },
      placedAt: new Date(),
    })
    .returning({ id: orders.id })
  if (!order) throw new Error('order')
  orderIds.push(order.id)

  await db.insert(orderItems).values({
    orderId: order.id,
    kind: 'plan',
    refId: plan.id,
    nameSnapshot: plan.name,
    unitPriceMinor: 1900,
    quantity: 1,
    lineTotalMinor: 1900,
  })

  const providerPaymentId = `sbx_${fixtureId().slice(0, 40)}`
  await db.insert(payments).values({
    orderId: order.id,
    provider: 'sandbox',
    providerPaymentId,
    status: 'requires_action',
    amountMinor: 1900,
    currency: 'USD',
    idempotencyKey: fixtureId(),
  })
  return { user, plan, orderId: order.id, providerPaymentId }
}

const paid = (providerPaymentId: string) => ({
  providerEventId: `${FIXTURE_PREFIX}-evt-${randomUUID()}`,
  type: 'payment.succeeded' as const,
  providerPaymentId,
  amountMinor: null,
  currency: null,
  raw: {},
})

afterAll(async () => {
  await deleteFixtureWebhookEvents()
  for (const id of orderIds) {
    await db.delete(entitlements).where(eq(entitlements.grantedByOrderId, id))
    await deleteTestOrder(id)
  }
  for (const id of userIds) await deleteTestUser(id)
  for (const id of planIds) await db.delete(plans).where(eq(plans.id, id))
})

describe('plan purchase', () => {
  it('grants the plan entitlement with its duration and device limit when payment settles', async () => {
    const { user, plan, orderId, providerPaymentId } = await seed(30, 4)
    const before = Date.now()

    await processWebhookEvent('sandbox', paid(providerPaymentId))

    const rows = await db
      .select()
      .from(entitlements)
      .where(eq(entitlements.grantedByOrderId, orderId))
    expect(rows).toHaveLength(1)
    const [grant] = rows
    expect(grant?.kind).toBe('vip')
    expect(grant?.planId).toBe(plan.id)
    expect(grant?.deviceLimit).toBe(4)
    const days = ((grant?.expiresAt?.getTime() ?? 0) - before) / 86_400_000
    expect(days).toBeGreaterThan(29.9)
    expect(days).toBeLessThan(30.1)

    // The effective limit is the larger of the plan's and the site default
    // (Studio → Protection), so the expectation follows the live setting.
    const { readSetting } = await import('@/app/(admin)/_lib/settings')
    const fallback = (await readSetting('security')).defaultDeviceLimit
    expect(await deviceLimitFor(user.id)).toBe(Math.max(4, fallback))
    const permissions = await loadPermissions(user.id)
    expect(permissions.entitlements.has('vip')).toBe(true)
    expect(permissions.entitlements.has('map_access')).toBe(true)
    // This plan excludes My Trip.
    expect(permissions.canUseTrip).toBe(false)
  })

  it('does not grant twice when the provider redelivers', async () => {
    const { orderId, providerPaymentId } = await seed(null, 2)
    await processWebhookEvent('sandbox', paid(providerPaymentId))
    // A different event id for the same payment (provider retry with a new id).
    await processWebhookEvent('sandbox', paid(providerPaymentId))
    const rows = await db
      .select()
      .from(entitlements)
      .where(and(eq(entitlements.grantedByOrderId, orderId)))
    expect(rows).toHaveLength(1)
    expect(rows[0]?.expiresAt).toBeNull()
  })
})
