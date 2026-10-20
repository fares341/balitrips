/**
 * Read-side DTOs.
 *
 * These are the shapes the queries in `./queries.ts` return and the shapes the
 * cards and pages consume. They are deliberately *not* the Drizzle row types:
 *
 *  - Localized columns stay as `Record<Locale, string>` and are resolved at
 *    render time with `pick()`, so one query result serves all three locales
 *    and nothing has to be re-fetched when the language switches.
 *  - Money is always a `priceMinor` + `currency` pair. There is no `price`
 *    number anywhere and no implied dollar.
 *  - Media is flattened to a URL plus intrinsic size, because that is what
 *    `<Photo>` needs; callers never see `objectKey`.
 *  - Every addressable entity carries its own `href`, already locale-agnostic
 *    (the next-intl `Link` adds the prefix). The prototype had no URLs at all,
 *    so this is the field that makes the catalogue crawlable.
 *
 * Nothing here imports the database, so pages, cards and tests can depend on
 * these types without pulling a connection into the bundle.
 */

import type { AddonPricing, PackagePricing } from '@/lib/booking/price'
import type { SeasonalPrice } from '@/lib/booking/seasonal'
import type { IconName } from '@/components/ui/icon'
import type { Locale } from '@/i18n/config'
import type { VehicleClass } from '@/lib/booking-rules'
import type { LocalizedText } from './localize'
import type { ActivityStatus } from './activity-status'
import type { ParsedVideo } from './video'

export type { LocalizedText }

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export type EntityType = 'activity' | 'itinerary' | 'package' | 'article' | 'landmark' | 'place'

/**
 * Index route per entity type. Detail pages hang off these, so the segment is
 * declared exactly once and the cards, the search overlay and the footer
 * cannot drift apart.
 */
export const ENTITY_PATHS: Record<EntityType, string> = {
  activity: '/activities',
  itinerary: '/itineraries',
  package: '/packages',
  article: '/blog',
  landmark: '/explore',
  place: '/map',
}

/**
 * Canonical path for one record, without a locale prefix — pass it to the
 * next-intl `Link`, which adds `/ar` or `/id` as needed.
 *
 * Landmarks and map places have no detail page of their own: a landmark is a
 * card that points at its linked activity (handled by the caller) or at the
 * explore index, and a place is a pin the map opens by slug.
 */
export function entityHref(type: EntityType, slug: string): string {
  const base = ENTITY_PATHS[type]
  if (type === 'place') return `${base}?place=${encodeURIComponent(slug)}`
  if (type === 'landmark') return `${base}#${encodeURIComponent(slug)}`
  return `${base}/${slug}`
}

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

export interface MediaDto {
  id: string
  /** Absolute CDN URL, built from `media.objectKey`. */
  url: string
  /** Alt text is content, so it is localized like everything else. */
  alt: LocalizedText | null
  width: number
  height: number
  blurhash: string | null
  credit: string | null
  /**
   * Responsive candidates, best format first. Null when the object was stored
   * without a ladder, in which case `url` is the original and no srcset may
   * be emitted.
   */
  srcSetAvif: string | null
  srcSetWebp: string | null
}

export interface RegionRef {
  id: string
  key: string
  label: LocalizedText
}

export interface RegionDto extends RegionRef {
  sortOrder: number
}

export interface CategoryRef {
  id: string
  key: string
  label: LocalizedText
  /** Validated against the icon set; unknown names become null, not a crash. */
  icon: IconName | null
}

export interface CategoryDto extends CategoryRef {
  sortOrder: number
}

export interface ArticleCategoryDto {
  id: string
  key: string
  label: LocalizedText
  sortOrder: number
}

export interface FaqEntry {
  q: LocalizedText
  a: LocalizedText
}

// ---------------------------------------------------------------------------
// Activities
// ---------------------------------------------------------------------------

export interface ActivitySummary {
  id: string
  slug: string
  href: string
  name: LocalizedText
  area: LocalizedText | null
  duration: LocalizedText | null
  region: RegionRef | null
  categories: CategoryRef[]
  priceMinor: number
  currency: string
  rating: number | null
  reviewCount: number
  hero: MediaDto | null
  /** Card line under the title (the description, clamped by CSS). */
  blurb?: LocalizedText | null
  /** Written for cards in the Studio; wins over a line cut from `blurb`. */
  shortDescription?: LocalizedText | null
  /** Owner flag: draws the "Most popular" badge on the card. */
  mostPopular?: boolean
  /** Listed, but booking is switched off for now. */
  unavailable?: boolean
}

/**
 * A service level of one activity: Basic, Couples, Comprehensive, Premium.
 *
 * Carries only what differs between levels. Departure times, location and lead
 * time belong to the activity and are read from it, so four tiers can never
 * disagree about where the tour leaves from.
 */
export interface ActivityTierDto {
  id: string
  key: string
  name: LocalizedText
  tagline: LocalizedText | null
  priceMinor: number
  currency: string
  /** v3 package pricing: per person, or per group of up to `groupMax`. */
  pricing: PackagePricing
  groupMax: number | null
  /** Null means "whatever the activity allows". */
  maxGuests: number | null
  /** Null means "whatever the activity allows". */
  minGuests: number | null
  isPopular: boolean
  /** Other activities that come with this package, in order. */
  includedActivities: IncludedActivityDto[]
  /** Package card lists. */
  includes: LocalizedText[]
  excludes: LocalizedText[]
  /** Add-on ids that come with this package (included, not charged). */
  includesAddons: string[]
  /** False = shown, not selectable. */
  available: boolean
  /** Chips on the card. */
  features: LocalizedText[]
  /** Expanded panel. */
  highlights: LocalizedText[]
  details: LocalizedText[]
  notes: LocalizedText[]
  /** Price per child (phase 2, per-person packages). Null = adult price. */
  childPriceMinor: number | null
  /** Seasonal prices (phase 2); the travel date picks one. */
  seasons: SeasonalPrice[]
}

/** An activity a package includes (same date; own slot or the package's time). */
export interface IncludedActivityDto {
  id: string
  slug: string
  href: string
  name: LocalizedText
  duration: LocalizedText | null
  timeSlots: string[]
  timing: 'same_slot' | 'own_slot'
}

export interface ActivityDetail extends ActivitySummary {
  status: ActivityStatus
  /** False for an `unavailable` activity: the page shows a contact message instead. */
  bookable: boolean
  /** Full description: a safe markdown subset (`@/lib/content/markdown`). */
  description: LocalizedText | null
  headline: LocalizedText | null
  highlights: LocalizedText[]
  suitableFor: LocalizedText[]
  importantNotes: LocalizedText[]
  whatToBring: LocalizedText[]
  ageConditions: LocalizedText[]
  meeting: {
    address: LocalizedText | null
    lat: number | null
    lng: number | null
    /** A Google Maps link: the owner's, or built from the position / address. */
    mapUrl: string | null
    timeNote: LocalizedText | null
  }
  instantConfirmation: boolean
  freeCancellationHours: number | null
  minGuests: number
  /** Child age band (phase 2); younger = infant, free. Null = no child pricing. */
  childAges: { min: number; max: number } | null
  /** Portrait hero for phones, when one is set. */
  mobileHero: MediaDto | null
  video: ParsedVideo | null
  tags: { id: string; key: string; label: LocalizedText }[]
  /** Per-activity, not the one shared list the prototype hard-coded. */
  included: LocalizedText[]
  excluded: LocalizedText[]
  faq: FaqEntry[]
  cancellationPolicy: LocalizedText | null
  /** Bookable start times as `HH:mm`. Empty means "no fixed slots". */
  timeSlots: string[]
  leadTimeHours: number
  maxGuests: number
  gallery: MediaDto[]
  /** Published service levels in the owner's order. Empty when none are defined. */
  tiers: ActivityTierDto[]
  /** Booked as a date range; a driver is then hired for every day of it. */
  multiDay: boolean
  /** Region centre for the location map (approximate by design). */
  location: { lat: number; lon: number } | null
  /** Optional extras, in display order (switched-off ones included, shown disabled). */
  addons: ActivityAddonDto[]
}

export interface ActivityAddonDto {
  id: string
  name: LocalizedText
  description: LocalizedText | null
  priceMinor: number
  currency: string
  pricing: AddonPricing
  maxQty: number | null
  onlyPackages: string[]
  requiresAddonId: string | null
  available: boolean
  /** Always part of the booking (library link marked required). */
  required: boolean
  /** Library add-ons: picture and unit label for the add-on card. */
  image: MediaDto | null
  unitLabel: LocalizedText | null
}

// ---------------------------------------------------------------------------
// Itineraries
// ---------------------------------------------------------------------------

export interface ItinerarySummary {
  id: string
  slug: string
  href: string
  name: LocalizedText
  blurb: LocalizedText | null
  /** Length of the plan in days. */
  days: number
  spots: number | null
  tripType: LocalizedText | null
  audience: LocalizedText[]
  regions: RegionRef[]
  priceMinor: number
  currency: string
  /** Pinned by an order, so a customer redownloads the version they bought. */
  version: number
  hero: MediaDto | null
}

/**
 * One authored day.
 *
 * The prototype had no day table and synthesized the plan by assigning
 * `acts[i]` to day `i`, so an 8-day itinerary with 5 linked activities
 * rendered three uneditable "Free day to explore & relax" cards. A free day is
 * now an explicit editorial choice carrying its own copy.
 */
export interface ItineraryDayDto {
  id: string
  dayNumber: number
  isFreeDay: boolean
  title: LocalizedText | null
  description: LocalizedText | null
  activity: ActivitySummary | null
  /** Sale mode B: the day's activity can be booked from the itinerary page. */
  bookable: boolean
}

export interface ItineraryDetail extends ItinerarySummary {
  dayPlans: ItineraryDayDto[]
  /** الوثيقة 4.2: وصف تفصيلي ومعرض صور، وهل يشمل الخريطة / VIP. */
  detailedDescription: LocalizedText | null
  gallery: MediaDto[]
  includesMap: boolean
  isVip: boolean
  /** Phase 3: the sale modes switched on in Studio (`@/lib/itineraries/sale`). */
  saleDigital: boolean
  saleWithActivities: boolean
  saleWithPackages: boolean
  saleCustomRequest: boolean
  /** `free_only` | `vip_included` | `vip_addon` | `vip_later`. */
  mapAccess: string
  vipPlanId: string | null
}

// ---------------------------------------------------------------------------
// Packages
// ---------------------------------------------------------------------------

/** `flat` charges the price as-is; `per_guest` multiplies it by guest count. */
export type PricingMode = 'flat' | 'per_guest'

export interface PackageSummary {
  id: string
  slug: string
  href: string
  name: LocalizedText
  blurb: LocalizedText | null
  days: number
  maxGuests: number
  driverIncluded: boolean
  priceMinor: number
  currency: string
  pricingMode: PricingMode
  /** Amenity glyphs, filtered to names the icon set actually has. */
  amenities: IconName[]
  regions: RegionRef[]
  hero: MediaDto | null
}

export interface PackageDetail extends PackageSummary {
  included: LocalizedText[]
  excluded: LocalizedText[]
  activities: ActivitySummary[]
  /** Phase 3: day of the trip per activity id (0 = first day); absent = not fixed. */
  activityDays: Record<string, number>
  /** An itinerary that comes with the package (live ones only). */
  itinerary: ItinerarySummary | null
  /** VIP map access comes with the package. */
  includesVip: boolean
  /** Draft or published — the staff preview shows drafts. */
  status: string
}

// ---------------------------------------------------------------------------
// Landmarks, articles, reviews
// ---------------------------------------------------------------------------

export interface LandmarkDto {
  id: string
  slug: string
  href: string
  name: LocalizedText
  type: LocalizedText | null
  blurb: LocalizedText | null
  region: RegionRef | null
  /** Set when the landmark has a bookable activity behind it. */
  activitySlug: string | null
  hero: MediaDto | null
}

export interface ArticleSummary {
  id: string
  slug: string
  href: string
  title: LocalizedText
  excerpt: LocalizedText | null
  category: ArticleCategoryDto | null
  /** Where the in-article CTA points: 'map' | 'activities' | 'driver'. */
  bridge: string | null
  publishedAt: string | null
  hero: MediaDto | null
}

export interface ArticleDetail extends ArticleSummary {
  /** The body the prototype never had — it reused three lorem paragraphs. */
  body: LocalizedText | null
}

export interface ReviewDto {
  id: string
  authorName: string
  authorCountry: LocalizedText | null
  stars: number
  body: LocalizedText | null
  /** True once the review is tied to a real order. */
  isVerified: boolean
  createdAt: string
}

// ---------------------------------------------------------------------------
// Driver fleet
// ---------------------------------------------------------------------------

export interface DriverVehicleDto {
  id: string
  vehicleClass: VehicleClass
  label: LocalizedText
  description: LocalizedText | null
  minPassengers: number
  maxPassengers: number
  dayRateMinor: number
  currency: string
  fleetSize: number
  sortOrder: number
}

// ---------------------------------------------------------------------------
// Query options
// ---------------------------------------------------------------------------

export type ActivitySort = 'top' | 'price' | 'region'

export interface ListActivitiesOptions {
  /** `categories.key`. Omit or pass 'all' for no category filter. */
  categoryKey?: string | null
  sort?: ActivitySort | null
  limit?: number
  offset?: number
  /**
   * Required for `sort: 'region'`, which orders by the *translated* region
   * label. The handoff sorted by the raw English key, so Arabic and
   * Indonesian readers got an order that matched neither their alphabet nor
   * anything visible on screen.
   */
  locale?: Locale
}

export interface ListLandmarksOptions {
  /** `regions.key`. Omit or pass 'all' for every region. */
  regionKey?: string | null
  limit?: number
}

export interface ListArticlesOptions {
  /** `article_categories.key`. Omit or pass 'all' for every category. */
  categoryKey?: string | null
  /** Free-text query, matched against the title and excerpt. */
  q?: string | null
  limit?: number
  offset?: number
  locale?: Locale
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export type SearchHitType = 'activity' | 'place' | 'itinerary' | 'package' | 'article'

export interface SearchHit {
  type: SearchHitType
  id: string
  slug: string
  href: string
  title: LocalizedText
  /** Area, category or excerpt — whatever identifies the hit at a glance. */
  subtitle: LocalizedText | null
  /** Set for itineraries and packages so the UI can render "N days". */
  days: number | null
  hero: MediaDto | null
}
