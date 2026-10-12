/**
 * The three access tiers.
 *
 * Data, not markup, so the page renders one card component three times rather
 * than the handoff's three near-identical inline objects with a `best` flag
 * and hand-written feature arrays.
 *
 * Two things the handoff put here that are gone:
 *
 *  1. **The feature bullets were inline literals** — `L("Full interactive map
 *     unlocked", "الخريطة التفاعلية كاملة", "Peta interaktif penuh")` — three
 *     languages spliced into a component, invisible to translators and to
 *     every other locale-aware tool in the project. They are message keys now,
 *     resolved through next-intl like every other string on the site.
 *  2. **`active: mapUnlocked`** — a localStorage boolean. Whether a tier is
 *     active is not a property of the tier; the page asks `loadEntitlements`.
 *
 * `id` is also the `?plan=` value checkout receives, and `entitlement` is the
 * `entitlements.kind` that a settled payment for this tier must grant. Keeping
 * them adjacent is the point: the prototype's two paid tiers shared one
 * handler, so the $39 purchase granted the $19 tier's access and wrote no
 * record of its own.
 */

import type { IconName } from '@/components/ui'
import type { EntitlementKind } from '@/lib/entitlements'

/**
 * A price the site quotes but does not yet charge.
 *
 * Minor units plus an ISO 4217 code, like everything else in the pricing path
 * — never a bare integer with a `$` glued on at render time. These belong in a
 * products table once checkout is wired; until then this is the single place
 * the rate card is written down, and `/checkout?plan=…` must re-derive the
 * amount server-side rather than trusting anything the browser sends.
 */
export type PlanPrice = {
  amountMinor: number
  currency: string
}

export type PlanTier = {
  /** Also the `?plan=` value, and the slug checkout resolves a price from. */
  id: string
  icon: IconName
  titleKey: string
  bodyKey: string
  featureKeys: readonly string[]
  /** Null for the free tier — not zero, which would render as a price. */
  price: PlanPrice | null
  /** What a settled payment for this tier grants. Null for the free tier. */
  entitlement: EntitlementKind | null
  /** The design's featured column: 2px orange border, badge, scale at ≥720px. */
  featured: boolean
}

/** The design quotes $19 and $39; the catalogue is seeded in the same currency. */
const PLAN_CURRENCY = 'USD'

export const PLAN_TIERS: readonly PlanTier[] = [
  {
    id: 'free',
    icon: 'compass',
    titleKey: 'sub_free_t',
    bodyKey: 'sub_free_b',
    featureKeys: ['sub_free_f1', 'sub_free_f2', 'sub_free_f3'],
    price: null,
    entitlement: null,
    featured: false,
  },
  {
    id: 'map',
    icon: 'pin',
    titleKey: 'sub_map_t',
    bodyKey: 'sub_map_b',
    featureKeys: ['sub_map_f1', 'sub_map_f2', 'sub_map_f3', 'sub_map_f4'],
    price: { amountMinor: 1900, currency: PLAN_CURRENCY },
    entitlement: 'map_access',
    featured: true,
  },
  {
    id: 'vip',
    icon: 'gem',
    titleKey: 'sub_vip_t',
    bodyKey: 'sub_vip_b',
    featureKeys: ['sub_vip_f1', 'sub_vip_f2', 'sub_vip_f3', 'sub_vip_f4'],
    price: { amountMinor: 3900, currency: PLAN_CURRENCY },
    // Distinct from map_access, and the implication table in
    // `@/lib/entitlements` is what makes VIP also unlock the map — rather than
    // the prototype's shared handler, which made VIP unlock only the map.
    entitlement: 'vip',
    featured: false,
  },
]
