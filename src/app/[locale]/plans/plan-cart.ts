/**
 * Puts one published plan in the cart (shared by the form action and the
 * plain link on /plans). Only the plan id travels; checkout prices it on the
 * server and access is granted only when the order is paid.
 */

import { readSetting } from '@/app/(admin)/_lib/settings'
import { addItem } from '@/lib/cart'
import { loadPlansById } from '@/lib/entitlements/plans'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** True when the plan was added; false for an unknown or not-for-sale plan. */
export async function addPlanToCart(raw: unknown): Promise<boolean> {
  const planId = typeof raw === 'string' && UUID.test(raw) ? raw : null
  const [plan] = planId === null ? [] : await loadPlansById([planId])
  // Phase 3: standalone VIP can be switched off in Studio → VIP settings.
  const standaloneOff =
    plan !== undefined &&
    plan.entitlementKind === 'vip' &&
    !(await readSetting('vip')).sellStandalone
  if (plan === undefined || standaloneOff) return false
  await addItem({ kind: 'plan', refId: plan.id })
  return true
}
