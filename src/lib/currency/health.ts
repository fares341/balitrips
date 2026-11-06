import 'server-only'

import { sql } from 'drizzle-orm'

import { db } from '@/db'

import { BASE_CURRENCY } from './fx'

/**
 * «صحة العملة»: every catalog price that is not stored in SAR. After
 * migration 0043 this is empty; anything listed was added since (an import,
 * a restore) and is sold at the Studio rate until it is re-saved in SAR.
 * Orders are never listed — they keep the currency they were placed in.
 */
export interface NonSarPrice {
  kind: string
  id: string
  name: string
  currency: string
}

export async function listNonSarPrices(limit = 200): Promise<NonSarPrice[]> {
  const rows = await db.execute<{
    kind: string
    id: string
    name: string | null
    currency: string
  }>(sql`
    SELECT 'activity' AS kind, a.id::text AS id, coalesce(a.name->>'ar', a.name->>'en', a.slug) AS name, a.currency
      FROM activities a WHERE a.currency <> ${BASE_CURRENCY} AND a.deleted_at IS NULL
    UNION ALL
    SELECT 'activity_tier', t.id::text, coalesce(t.name->>'ar', t.name->>'en', ''), t.currency
      FROM activity_tiers t WHERE t.currency <> ${BASE_CURRENCY}
    UNION ALL
    SELECT 'addon', x.id::text, coalesce(x.name->>'ar', x.name->>'en', ''), x.currency
      FROM activity_addons x WHERE x.currency <> ${BASE_CURRENCY}
    UNION ALL
    SELECT 'addon_library', l.id::text, coalesce(l.name->>'ar', l.name->>'en', ''), l.currency
      FROM addons_library l WHERE l.currency <> ${BASE_CURRENCY}
    UNION ALL
    SELECT 'itinerary', i.id::text, coalesce(i.name->>'ar', i.name->>'en', i.slug), i.currency
      FROM itineraries i WHERE i.currency <> ${BASE_CURRENCY} AND i.deleted_at IS NULL
    UNION ALL
    SELECT 'package', p.id::text, coalesce(p.name->>'ar', p.name->>'en', p.slug), p.currency
      FROM packages p WHERE p.currency <> ${BASE_CURRENCY}
    UNION ALL
    SELECT 'plan', pl.id::text, coalesce(pl.name->>'ar', pl.name->>'en', pl.slug), pl.currency
      FROM plans pl WHERE pl.currency <> ${BASE_CURRENCY} AND pl.deleted_at IS NULL
    UNION ALL
    SELECT 'vehicle', v.id::text, coalesce(v.label->>'ar', v.label->>'en', v.vehicle_class), v.currency
      FROM driver_vehicles v WHERE v.currency <> ${BASE_CURRENCY}
    UNION ALL
    SELECT 'discount', c.id::text, c.code, c.currency
      FROM coupons c WHERE c.currency IS NOT NULL AND c.currency <> ${BASE_CURRENCY}
    LIMIT ${limit}
  `)
  return [...rows].map((row) => ({ ...row, name: row.name ?? '' }))
}
