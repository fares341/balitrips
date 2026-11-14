/**
 * The shared `ItineraryCard` takes an `ItinerarySummary`; the public pages
 * hold the allow-list DTO. This narrows one into the other with no regions
 * (no place names before purchase) and no media alt text.
 */

import type { ItinerarySummary } from '@/lib/content/types'
import type { PublicItinerarySummary } from '@/lib/itineraries/public-dto'

export function toCardItinerary(itinerary: PublicItinerarySummary): ItinerarySummary {
  return {
    id: itinerary.id,
    slug: itinerary.slug,
    href: itinerary.href,
    name: itinerary.name,
    blurb: itinerary.blurb,
    days: itinerary.days,
    spots: null,
    tripType: itinerary.tripType,
    audience: itinerary.audience,
    regions: [],
    priceMinor: itinerary.priceMinor,
    currency: itinerary.currency,
    version: 0,
    hero:
      itinerary.hero === null
        ? null
        : {
            id: '',
            url: itinerary.hero.url,
            alt: null,
            width: itinerary.hero.width,
            height: itinerary.hero.height,
            blurhash: null,
            credit: null,
            srcSetAvif: itinerary.hero.srcSetAvif,
            srcSetWebp: itinerary.hero.srcSetWebp,
          },
    tierPrices: itinerary.tierPrices,
    includesMap: itinerary.includesMap,
  }
}
