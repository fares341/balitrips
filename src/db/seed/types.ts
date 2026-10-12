/**
 * Shape of `content.json`, produced by `scripts/extract-content.mjs` from
 * `design/handoff/bt-data.jsx`.
 *
 * The field names are the handoff's, verbatim — this file describes the
 * source data, not the database. The mapping to schema columns happens once,
 * in `index.ts`, so the two vocabularies never blur together.
 */

import type { Localized } from '@/db/schema'

/** A `{ key, label }` chip: activity categories, sorts, blog categories, map filters. */
export interface HandoffChip {
  key: string
  label: Localized
}

/** A "Travelers love" collection: a category key plus the icon it renders with. */
export interface HandoffCollection extends HandoffChip {
  ic: string
}

export interface HandoffActivity {
  id: string
  cats: string[]
  region: string
  name: Localized
  area: Localized
  /** loremflickr query for the placeholder image. Not seeded. */
  flickr: string
  gallery: string[]
  rating: number
  reviews: number
  /** Whole US dollars. */
  price: number
  dur: Localized
  desc: Localized
}

export interface HandoffItinerary {
  id: string
  days: number
  /** Whole US dollars. */
  price: number
  flickr: string
  region: string
  spots: number
  type: Localized
  regions: string[]
  name: Localized
  blurb: Localized
  audience: Localized[]
  /** Activity ids, in day order. */
  acts: string[]
}

export interface HandoffPackage {
  id: string
  /** Whole US dollars. */
  price: number
  days: number
  maxGuests: number
  flickr: string
  driver: boolean
  name: Localized
  blurb: Localized
  regions: string[]
  amenities: string[]
  acts: string[]
}

export interface HandoffLandmark {
  id: string
  region: string
  flickr: string
  actId: string
  name: Localized
  type: Localized
  blurb: Localized
}

export interface HandoffArticle {
  id: string
  cat: string
  /** Reading time, e.g. "6 min". No column — see the note in index.ts. */
  read: string
  flickr: string
  bridge: string
  title: Localized
  excerpt: Localized
  related: string[]
}

export interface HandoffMapPlace {
  id: string
  actId: string
  free: boolean
  tags: string[]
  flickr: string
  name: Localized
  cat: Localized
  region: string
  hours: string
  rating: number
  lat: number
  lon: number
  /** Hand-tuned card anchor percentages. Deliberately not seeded. */
  ax: number
  ay: number
  side: string
}

export interface HandoffReview {
  name: string
  from: Localized
  stars: number
  /** Mixed activity ids and category keys. */
  tags: string[]
  text: Localized
}

/** Geographic bounds of the map canvas. No column — see the note in index.ts. */
export interface HandoffMapBbox {
  w: number
  e: number
  n: number
  s: number
}

export interface ContentData {
  ACT_CATS: HandoffChip[]
  ACT_SORTS: HandoffChip[]
  REGIONS: Record<string, Localized>
  ACTIVITIES: HandoffActivity[]
  ITINERARIES: HandoffItinerary[]
  PACKAGES: HandoffPackage[]
  LOVED: HandoffCollection[]
  LANDMARKS: HandoffLandmark[]
  BLOG_CATS: HandoffChip[]
  ARTICLES: HandoffArticle[]
  MAP_BBOX: HandoffMapBbox
  MAP_PLACES: HandoffMapPlace[]
  MAP_FILTERS: HandoffChip[]
  REVIEW_POOL: HandoffReview[]
}
