'use server'

/**
 * «متابعة» on the itinerary page (phase 2): put the itinerary — and, for
 * «الجدول + الخريطة», the map product — in the existing cart. Nothing priced
 * here comes from the browser: the map product is resolved on the server from
 * the Studio settings, and the cart / checkout quote charges its bundle price
 * (`@/lib/pricing/quote` → `applyCoverage`) only while the itinerary is in the
 * same cart.
 */

import { revalidatePath } from 'next/cache'

import { bookingsOpen } from '@/lib/bookings-open'
import { addItem } from '@/lib/cart'
import { ITINERARY_TIERS } from '@/lib/itineraries/tiers'
import { getPublicItinerary, loadMapBundleOffer } from '@/lib/itineraries/public'
import { holdsMapAccess } from '@/lib/itineraries/queries'
import { getUser } from '@/lib/auth/session'

export interface BuyItineraryResult {
  ok: boolean
  reason?: 'bookings_closed' | 'invalid'
}

const SLUG = /^[a-z0-9][a-z0-9-]{0,120}$/

export async function buyItineraryAction(input: {
  slug: unknown
  withMap: unknown
  tier?: unknown
}): Promise<BuyItineraryResult> {
  if (!bookingsOpen()) return { ok: false, reason: 'bookings_closed' }
  if (typeof input.slug !== 'string' || !SLUG.test(input.slug))
    return { ok: false, reason: 'invalid' }
  const itinerary = await getPublicItinerary(input.slug)
  if (itinerary === null) return { ok: false, reason: 'invalid' }

  const tier =
    typeof input.tier === 'string' &&
    (ITINERARY_TIERS as readonly string[]).includes(input.tier) &&
    typeof itinerary.tierPrices[input.tier as 'economy'] === 'number'
      ? input.tier
      : null

  try {
    await addItem({ kind: 'itinerary', refId: itinerary.id, tier })
  } catch (error) {
    // An itinerary without a price is not for sale; anything else is a fault.
    if (error instanceof Error && error.name === 'CartRejectedError') {
      return { ok: false, reason: 'invalid' }
    }
    throw error
  }

  if (input.withMap === true && !itinerary.includesMap) {
    const user = await getUser()
    const offer = await loadMapBundleOffer()
    if (offer !== null && !(await holdsMapAccess(user?.id ?? null))) {
      await addItem({ kind: 'plan', refId: offer.planId })
    }
  }

  revalidatePath('/[locale]/my-trip', 'page')
  revalidatePath('/[locale]/checkout', 'page')
  return { ok: true }
}
