import { relations } from 'drizzle-orm'
import {
  type AnyPgColumn,
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import {
  currency,
  localized,
  moneyMinor,
  priceMinor,
  publishing,
  softDelete,
  timestamps,
  type Localized,
} from './_shared'
import { plans } from './product'

// ---------------------------------------------------------------------------
// Taxonomy
// ---------------------------------------------------------------------------

/**
 * المناطق والأحياء (الوثيقة 7). مستويان:
 *  - مناطق عامة (جنوب بالي، وسط بالي…) تستخدمها الجداول والباقات.
 *  - أحياء داخلها (Kuta، Seminyak، Ubud…) `parent_id` ← المنطقة العامة،
 *    تُربط بها أماكن الخريطة. فلترة منطقة عامة تشمل أحياءها.
 * `center_lat/lon` + `radius_km` = "حدود أو إحداثيات تقريبية".
 */
export const regions = pgTable('regions', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: varchar('key', { length: 64 }).notNull().unique(),
  label: localized('label').notNull(),
  description: localized('description'),
  /** active | inactive — غير المفعّلة لا تظهر في فلاتر الخريطة والاقتراحات. */
  status: varchar('status', { length: 16 }).notNull().default('active'),
  parentId: uuid('parent_id').references((): AnyPgColumn => regions.id, { onDelete: 'set null' }),
  centerLat: doublePrecision('center_lat'),
  centerLon: doublePrecision('center_lon'),
  radiusKm: real('radius_km'),
  sortOrder: integer('sort_order').notNull().default(0),
  ...timestamps,
})

export const categories = pgTable('categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: varchar('key', { length: 64 }).notNull().unique(),
  label: localized('label').notNull(),
  description: localized('description'),
  /** active | inactive (الوثيقة: الحالة). */
  status: varchar('status', { length: 16 }).notNull().default('active'),
  /** Icon name from the design's ~45-glyph set. */
  icon: varchar('icon', { length: 32 }),
  sortOrder: integer('sort_order').notNull().default(0),
  /**
   * The map's two levels (client, Oct 2026): 'free' or 'vip'. NULL = not a map
   * category (activity-only). A place's access follows its main category.
   */
  mapTier: varchar('map_tier', { length: 8 }),
  /** Order of the category chips on the map. */
  mapOrder: integer('map_order').notNull().default(0),
  /**
   * Card photo for the home «free Bali guide» (owner, Oct 2026; migration 0031).
   */
  imageId: uuid('image_id').references(() => media.id, { onDelete: 'set null' }),
  ...timestamps,
})

// ---------------------------------------------------------------------------
// Media — replaces the prototype's flickr(query) placeholder helper entirely
// ---------------------------------------------------------------------------

export const media = pgTable('media', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** Object key in the Spaces bucket. */
  objectKey: text('object_key').notNull().unique(),
  mimeType: varchar('mime_type', { length: 64 }).notNull(),
  width: integer('width').notNull(),
  height: integer('height').notNull(),
  bytes: integer('bytes').notNull(),
  /** Low-quality placeholder for layout-stable loading. */
  blurhash: text('blurhash'),
  /** Alt text is per-locale — it is content, not metadata. */
  alt: localized('alt'),
  credit: text('credit'),
  ...timestamps,
  ...softDelete,
})

// ---------------------------------------------------------------------------
// Activities
// ---------------------------------------------------------------------------

export const activities = pgTable(
  'activities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Stable slug used in the public URL. Never reuse across entities. */
    slug: varchar('slug', { length: 128 }).notNull().unique(),
    /** Original handoff id, kept so seed data can cross-reference. */
    legacyId: varchar('legacy_id', { length: 64 }),

    name: localized('name').notNull(),
    area: localized('area'),
    description: localized('description'),
    duration: localized('duration'),

    regionId: uuid('region_id').references(() => regions.id),

    priceMinor: priceMinor(),
    currency: currency(),

    rating: real('rating'),
    reviewCount: integer('review_count').notNull().default(0),

    heroImageId: uuid('hero_image_id').references(() => media.id),

    /**
     * Per-activity content. The prototype hard-coded ONE shared list of
     * inclusions, exclusions, FAQ and cancellation policy across all 15
     * activities — these are now genuinely per-item.
     */
    included: jsonb('included').$type<Localized[]>(),
    excluded: jsonb('excluded').$type<Localized[]>(),
    faq: jsonb('faq').$type<{ q: Localized; a: Localized }[]>(),
    cancellationPolicy: localized('cancellation_policy'),

    /** Bookable start times. Prototype hard-coded 09:00/11:30/14:00/16:30. */
    timeSlots: jsonb('time_slots').$type<string[]>(),

    /**
     * Hours before the slot after which booking closes. Without this a
     * 09:00 tour can be booked at 03:00 the same morning.
     */
    leadTimeHours: integer('lead_time_hours').notNull().default(24),
    maxGuests: integer('max_guests').notNull().default(20),

    /**
     * Multi-day activity (handoff `multi_day`): booked as a date range rather
     * than one day, and a driver added to it is hired for every day of the
     * range. False = the usual single-day activity, driver days = 1.
     */
    multiDay: boolean('multi_day').notNull().default(false),

    /**
     * فعالية بتاريخ (تصنيف `events`): البداية والنهاية. NULL = نشاط دائم بلا
     * تاريخ. صفحة الفعاليات تعرض القادمة أولاً وتخفي المنتهية.
     */
    eventStartsAt: timestamp('event_starts_at', { withTimezone: true }),
    eventEndsAt: timestamp('event_ends_at', { withTimezone: true }),

    // --- Phase 1 (migration 0017): content the Studio edits per activity ---

    /**
     * The main category, shown first on cards and used for "similar". The
     * many-to-many `activity_categories` keeps the extra ones; the primary is
     * always one of them as well. Null = the first of those (old behaviour).
     */
    primaryCategoryId: uuid('primary_category_id').references(() => categories.id, {
      onDelete: 'set null',
    }),
    /** Highlighted by the owner (shown first in Studio lists). */
    isFeatured: boolean('is_featured').notNull().default(false),
    /** Draws the "Most popular" badge on the activity's cards. */
    isMostPopular: boolean('is_most_popular').notNull().default(false),
    /** Picked for the home page section (in `sort_order`), before the top-rated fallback. */
    showOnHome: boolean('show_on_home').notNull().default(false),

    /** Marketing headline under the title. */
    headline: localized('headline'),
    /** Card text. Empty = a short line cut from the description. */
    shortDescription: localized('short_description'),
    /** Bullet highlights (ordered). The description itself is a safe markdown subset. */
    highlights: jsonb('highlights').$type<Localized[]>(),
    suitableFor: jsonb('suitable_for').$type<Localized[]>(),
    importantNotes: jsonb('important_notes').$type<Localized[]>(),
    whatToBring: jsonb('what_to_bring').$type<Localized[]>(),
    ageConditions: jsonb('age_conditions').$type<Localized[]>(),

    /** Meeting point: address text, optional exact position and a Google Maps link. */
    meetingPoint: localized('meeting_point'),
    meetingLat: doublePrecision('meeting_lat'),
    meetingLng: doublePrecision('meeting_lng'),
    meetingMapUrl: text('meeting_map_url'),
    meetingTimeNote: localized('meeting_time_note'),

    /** "Instant confirmation" shown on the page. Staff still confirm each booking. */
    instantConfirmation: boolean('instant_confirmation').notNull().default(false),
    /** "Free cancellation up to N hours" when set. The policy text stays separate. */
    freeCancellationHours: integer('free_cancellation_hours'),
    /** Smallest party that can book. */
    minGuests: integer('min_guests').notNull().default(1),

    /** Optional portrait hero used on phones (<picture>). */
    mobileHeroImageId: uuid('mobile_hero_image_id').references(() => media.id, {
      onDelete: 'set null',
    }),
    /** A YouTube or Vimeo link, played with a privacy-friendly embed after a click. */
    videoUrl: text('video_url'),

    // --- Phase 2 (migration 0018): capacity and child ages ---

    /**
     * Places per departure (per day when the activity has no time slots). Null
     * = unlimited, exactly as before 0018. Per-date overrides and closed dates
     * live in `activity_availability`; rules in `@/lib/availability/rules`.
     */
    capacityPerSlot: integer('capacity_per_slot'),
    /** Weekdays the activity never runs (0 = Sunday … 6 = Saturday). Null/empty = none. */
    closedWeekdays: jsonb('closed_weekdays').$type<number[]>(),
    /**
     * Child age band for packages with a child price (e.g. 4–11). Younger than
     * `childAgeMin` = infant, free. Null = the defaults (3–11, `@/lib/content/child-ages`).
     */
    childAgeMin: integer('child_age_min'),
    childAgeMax: integer('child_age_max'),

    /**
     * Set when this activity was folded into another one as one of its
     * packages (migration 0027): the old link answers with a permanent
     * redirect to that activity. The row is kept, hidden, never deleted.
     */
    mergedIntoId: uuid('merged_into_id').references((): AnyPgColumn => activities.id, {
      onDelete: 'set null',
    }),

    // --- Activity page v2 (migration 0030) ---

    /** Search-engine title / description per language. Empty = the name / short text. */
    seoTitle: localized('seo_title'),
    seoDescription: localized('seo_description'),
    /** Share picture. Null = the hero image. */
    ogImageId: uuid('og_image_id').references(() => media.id, { onDelete: 'set null' }),
    /** Canonical link when the page duplicates another one. Null = its own URL. */
    canonicalUrl: text('canonical_url'),
    /** Hand-picked «similar activities», in order; the rest is filled automatically. */
    relatedIds: jsonb('related_ids').$type<string[]>(),
    /** Content template the texts were started from (`@/lib/content/activity-templates`). */
    contentTemplate: varchar('content_template', { length: 32 }),
    /** Texts came from a template (or an import) and wait for a human check. */
    needsReview: boolean('needs_review').notNull().default(false),

    sortOrder: integer('sort_order').notNull().default(0),
    /**
     * draft | published | hidden | unavailable (`@/lib/content/activity-status`):
     * hidden = reachable by its link only; unavailable = page shown, booking off.
     */
    ...publishing,
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    index('activities_region_idx').on(t.regionId),
    index('activities_status_idx').on(t.status),
  ],
)

export const activityCategories = pgTable(
  'activity_categories',
  {
    activityId: uuid('activity_id')
      .notNull()
      .references(() => activities.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.activityId, t.categoryId] })],
)

export const activityImages = pgTable(
  'activity_images',
  {
    activityId: uuid('activity_id')
      .notNull()
      .references(() => activities.id, { onDelete: 'cascade' }),
    mediaId: uuid('media_id')
      .notNull()
      .references(() => media.id, { onDelete: 'cascade' }),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.activityId, t.mediaId] })],
)

// ---------------------------------------------------------------------------
// Activity tiers
// ---------------------------------------------------------------------------

/**
 * Service levels for a single activity.
 *
 * An activity is sold at several levels -- Basic, Couples, Comprehensive,
 * Premium -- each with its own price and its own list of what is included.
 * They belong to ONE activity: the Mount Batur tiers are unrelated to the
 * Ubud ones, even when they share a name.
 *
 * Deliberately NOT the `packages` table. That holds standalone multi-day
 * bundles with their own slug, hero image and regions, sold on their own
 * pages. These are a price ladder on an existing product and have no page of
 * their own. Conflating the two would have forced every tier to carry fields
 * it has no use for, and made "show me the packages" ambiguous.
 *
 * Location, departure times and lead time are NOT repeated here -- they are
 * properties of the activity, and duplicating them per tier guarantees that
 * one day four tiers disagree about where the tour leaves from.
 */
export const activityTiers = pgTable(
  'activity_tiers',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    /**
     * Cascades: a tier has no meaning without its activity, and leaving
     * orphans would put unreachable rows in front of the pricing engine.
     */
    activityId: uuid('activity_id')
      .notNull()
      .references(() => activities.id, { onDelete: 'cascade' }),

    /** Unique per activity, not globally: every activity may have a "basic". */
    key: varchar('key', { length: 64 }).notNull(),

    name: localized('name').notNull(),
    /** One line under the title, e.g. "A complete experience with extras". */
    tagline: localized('tagline'),

    priceMinor: priceMinor(),
    currency: currency(),

    /**
     * How the package price applies (handoff "Package.pricing"):
     *  - `per_person`: price × people.
     *  - `per_group`:  price × ceil(people / group_max) — a family package
     *    covering up to four people costs one unit for 1–4 and two for 5–8.
     *  - `per_couple`: price × couples (two people per unit, "للزوجين").
     * Rows written before migration 0013 said `per_guest` / `flat`; the
     * migration rewrote them and `tierPricing()` still reads the old spelling.
     */
    pricingMode: varchar('pricing_mode', { length: 16 }).notNull().default('per_person'),
    /** People one unit of a `per_group` package covers. Ignored for per_person. */
    groupMax: integer('group_max'),

    /** Caps party size for this tier, e.g. a couples tier at 2. Null = the activity's own cap. */
    maxGuests: integer('max_guests'),
    /** Smallest party for this tier. Null = the activity's own minimum. */
    minGuests: integer('min_guests'),
    /**
     * Price per child (migration 0018), `per_person` packages only. Null = no
     * child price: children pay the adult price. Seasons may override it.
     */
    childPriceMinor: moneyMinor('child_price_minor'),

    // --- Activity page v2 (migration 0030) ---
    /** Price before the discount. Shown struck through only when above `priceMinor`. */
    compareAtPriceMinor: moneyMinor('compare_at_price_minor'),
    /** Ribbon text (e.g. «Best value»). Null = «Most popular» when `isPopular`. */
    badgeLabel: localized('badge_label'),
    /** Ribbon colour: a palette name (`sun`, `palm`, `forest`, `coral`, `sky`). */
    badgeColor: varchar('badge_color', { length: 16 }),
    /** Picture of the package. Null = the activity's hero. */
    imageId: uuid('image_id').references(() => media.id, { onDelete: 'set null' }),
    /** Duration of this package when it differs from the activity's. */
    duration: localized('duration'),
    /** Longer text for the selected-package card. */
    description: localized('description'),

    /** Package card: what this package includes / leaves out (localized lists). */
    includes: jsonb('includes').$type<Localized[]>(),
    excludes: jsonb('excludes').$type<Localized[]>(),
    /**
     * `activity_addons.id`s that come with this package. Shown as "included
     * in your package", locked, and never charged.
     */
    includesAddons: jsonb('includes_addons').$type<string[]>(),
    /** Bookable right now. False keeps the package visible but unselectable. */
    available: boolean('available').notNull().default(true),

    /** Draws the "Most popular" ribbon. At most one per activity, enforced in the admin. */
    isPopular: boolean('is_popular').notNull().default(false),

    /** The chips on the card: "Private guide", "Welcome drink", "Fast entry". */
    features: jsonb('features').$type<Localized[]>(),
    /** Expanded panel: what makes this tier worth the money. */
    highlights: jsonb('highlights').$type<Localized[]>(),
    /** Expanded panel: practicalities -- language, difficulty, suitability. */
    details: jsonb('details').$type<Localized[]>(),
    /** Expanded panel: what a traveller must know before booking. */
    notes: jsonb('notes').$type<Localized[]>(),

    sortOrder: integer('sort_order').notNull().default(0),
    ...publishing,
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    index('activity_tier_activity_idx').on(t.activityId, t.sortOrder),
    uniqueIndex('activity_tier_key_idx').on(t.activityId, t.key),
  ],
)

// ---------------------------------------------------------------------------
// Activity add-ons
// ---------------------------------------------------------------------------

/**
 * Optional extras sold with one activity (handoff "Addon"): a banana-boat
 * ride, a photo package, an extra parasailing round.
 *
 * Pricing (`@/lib/booking/price`, the only place that does the arithmetic):
 *  - `per_person`:  price × people
 *  - `per_booking`: price once
 *  - `per_qty`:     price × min(qty, max_qty)
 *
 * Rules, enforced on the server at add-to-cart AND at checkout:
 *  - listed in the chosen package's `includes_addons` → included, not charged;
 *  - `only_packages` non-empty and without the chosen package → rejected;
 *  - `requires_addon_id` set and that add-on not selected → rejected.
 */
export const activityAddons = pgTable(
  'activity_addons',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    activityId: uuid('activity_id')
      .notNull()
      .references(() => activities.id, { onDelete: 'cascade' }),

    name: localized('name').notNull(),
    description: localized('description'),

    priceMinor: priceMinor(),
    currency: currency(),
    /** per_person | per_booking | per_qty */
    pricing: varchar('pricing', { length: 16 }).notNull().default('per_booking'),
    /** Upper bound for a `per_qty` add-on. Null = 1. */
    maxQty: integer('max_qty'),

    /** `activity_tiers.id`s this add-on may be bought with. Empty/null = all. */
    onlyPackages: jsonb('only_packages').$type<string[]>(),
    /** Unit price by quantity for `tiered` pricing: the highest `minQty` reached wins. */
    priceTiers: jsonb('price_tiers').$type<{ minQty: number; priceMinor: number }[]>(),
    /** Add-on ids that cannot be booked together with this one. */
    incompatibleWith: jsonb('incompatible_with').$type<string[]>(),
    /** Another add-on of the same activity that must be selected first. */
    requiresAddonId: uuid('requires_addon_id').references((): AnyPgColumn => activityAddons.id, {
      onDelete: 'set null',
    }),

    available: boolean('available').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps,
    ...softDelete,
  },
  (t) => [index('activity_addons_activity_idx').on(t.activityId, t.sortOrder)],
)

/**
 * Other activities a package (tier) includes at no extra charge — e.g. a
 * "Full day" package that also covers the swing and the rice terraces.
 *
 * Booked on the same date as the package. `same_slot` = at the package's own
 * time; `own_slot` = the traveller picks one of that activity's time slots.
 * At checkout each becomes its own order item (price 0, parent = the package
 * line) so staff confirm it separately.
 */
export const tierIncludedActivities = pgTable(
  'tier_included_activities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tierId: uuid('tier_id')
      .notNull()
      .references(() => activityTiers.id, { onDelete: 'cascade' }),
    activityId: uuid('activity_id')
      .notNull()
      .references(() => activities.id, { onDelete: 'cascade' }),
    sortOrder: integer('sort_order').notNull().default(0),
    /** same_slot | own_slot */
    timing: varchar('timing', { length: 16 }).notNull().default('same_slot'),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('tier_included_unique').on(t.tierId, t.activityId),
    index('tier_included_tier_idx').on(t.tierId, t.sortOrder),
  ],
)

/**
 * The shared add-on library ("الخدمات الإضافية"): one row per extra, linked to
 * as many activities as sell it (`activity_addon_links`). The older
 * per-activity `activity_addons` keep working beside it; pricing reads both
 * (`@/lib/booking/addons`). A library add-on keeps its own id in carts and
 * orders, so the two sources can never collide.
 */
export const addonsLibrary = pgTable(
  'addons_library',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: localized('name').notNull(),
    description: localized('description'),
    imageId: uuid('image_id').references(() => media.id, { onDelete: 'set null' }),
    /** What one unit is, e.g. "per photo session". Shown under the price. */
    unitLabel: localized('unit_label'),
    priceMinor: priceMinor(),
    currency: currency(),
    /** per_person | per_booking | per_qty */
    pricing: varchar('pricing', { length: 16 }).notNull().default('per_booking'),
    maxQty: integer('max_qty'),
    priceTiers: jsonb('price_tiers').$type<{ minQty: number; priceMinor: number }[]>(),
    incompatibleWith: jsonb('incompatible_with').$type<string[]>(),
    available: boolean('available').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps,
    ...softDelete,
  },
  (t) => [index('addons_library_sort_idx').on(t.sortOrder)],
)

export const activityAddonLinks = pgTable(
  'activity_addon_links',
  {
    activityId: uuid('activity_id')
      .notNull()
      .references(() => activities.id, { onDelete: 'cascade' }),
    addonId: uuid('addon_id')
      .notNull()
      .references(() => addonsLibrary.id, { onDelete: 'cascade' }),
    /** Price for this activity only. Null = the library price. */
    priceMinor: moneyMinor('price_minor'),
    /** `activity_tiers.id`s this add-on may be bought with. Empty/null = all. */
    onlyPackages: jsonb('only_packages').$type<string[]>(),
    /** Always added to the booking and charged (cannot be unticked). */
    required: boolean('required').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps,
  },
  (t) => [
    primaryKey({ columns: [t.activityId, t.addonId] }),
    index('activity_addon_links_addon_idx').on(t.addonId),
  ],
)

// ---------------------------------------------------------------------------
// Itineraries
// ---------------------------------------------------------------------------

export const itineraries = pgTable('itineraries', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: varchar('slug', { length: 128 }).notNull().unique(),
  legacyId: varchar('legacy_id', { length: 64 }),

  name: localized('name').notNull(),
  blurb: localized('blurb'),

  days: integer('days').notNull(),
  spots: integer('spots'),
  tripType: localized('trip_type'),
  audience: jsonb('audience').$type<Localized[]>(),

  priceMinor: priceMinor(),
  currency: currency(),

  heroImageId: uuid('hero_image_id').references(() => media.id),

  /** الوثيقة 4.2: وصف تفصيلي. */
  detailedDescription: localized('detailed_description'),
  /** الوثيقة 4.2: معرض صور (معرّفات media بالترتيب). */
  galleryImageIds: jsonb('gallery_image_ids').$type<string[]>(),
  /** الوثيقة 4.2: هل يشمل الخريطة؟ شراؤه يمنح الوصول للخريطة. */
  includesMap: boolean('includes_map').notNull().default(false),
  /** الوثيقة 4.2: جدول عادي أم VIP؟ (VIP + يشمل الخريطة ← صلاحية VIP). */
  isVip: boolean('is_vip').notNull().default(false),
  /** الوثيقة 4.2: ملاحظات داخلية للإدارة — لا تُرسل للعميل. */
  internalNotes: text('internal_notes'),
  /** الوثيقة 4.2: الأماكن المرتبطة بالجدول (معرّفات map_places). */
  linkedPlaceIds: jsonb('linked_place_ids').$type<string[]>(),
  /**
   * الوثيقة 4.2/2: "ملف PDF مرتبط بالجدول" يرفعه المدير. مفتاح تخزين خاص لكل
   * لغة؛ إن وُجد يُسلَّم بدل الملف المولّد تلقائياً (بنفس العلامة المائية).
   */
  uploadedPdfKeys: jsonb('uploaded_pdf_keys').$type<Partial<Record<string, string>>>(),

  // --- Phase 3 (migration 0019): how it is sold, and what it opens on the map ---

  /** A: the plan on its own (PDF + pages). On by default — what it always was. */
  saleDigital: boolean('sale_digital').notNull().default(true),
  /** B: the plan plus the day activities ticked "bookable", added with dates. */
  saleWithActivities: boolean('sale_with_activities').notNull().default(false),
  /** C: inside one of the linked packages (`itinerary_package_links`). */
  saleWithPackages: boolean('sale_with_packages').notNull().default(false),
  /** D: "build me something like this" — the custom trip request, prefilled. */
  saleCustomRequest: boolean('sale_custom_request').notNull().default(false),
  /**
   * `free_only` | `vip_included` | `vip_addon` | `vip_later` — see
   * `@/lib/itineraries/sale`. `vip_included` keeps the old behaviour exactly:
   * `includesMap` / `isVip` still decide the access granted on payment.
   */
  mapAccess: varchar('map_access', { length: 16 }).notNull().default('free_only'),
  /** The VIP plan offered as an extra at purchase (`vip_addon`) or later (`vip_later`). */
  vipPlanId: uuid('vip_plan_id').references((): AnyPgColumn => plans.id, {
    onDelete: 'set null',
  }),

  /**
   * Bumped on every publish that changes the plan. An order pins the
   * version it bought, so a customer who purchased the 7-day plan in March
   * still downloads the March version rather than a restructured one.
   */
  version: integer('version').notNull().default(1),

  ...publishing,
  ...timestamps,
  ...softDelete,
})

/**
 * Authored day plans.
 *
 * The prototype had NO day table — it synthesized the plan at render time by
 * assigning acts[i] to day i, so an 8-day itinerary with 5 linked activities
 * silently rendered three hard-coded "Free day to explore & relax" cards that
 * nobody could edit. This is that missing table.
 */
export const itineraryDays = pgTable(
  'itinerary_days',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    itineraryId: uuid('itinerary_id')
      .notNull()
      .references(() => itineraries.id, { onDelete: 'cascade' }),
    dayNumber: integer('day_number').notNull(),
    /** Null activity + isFreeDay is an explicit editorial choice, not a gap. */
    activityId: uuid('activity_id').references(() => activities.id),
    isFreeDay: boolean('is_free_day').notNull().default(false),
    title: localized('title'),
    description: localized('description'),
    /** Sale mode B: this day's activity can be booked from the itinerary page. */
    bookable: boolean('bookable').notNull().default(false),
  },
  (t) => [uniqueIndex('itinerary_day_unique').on(t.itineraryId, t.dayNumber)],
)

/**
 * Map places on one day of an itinerary, in visiting order (phase 3).
 *
 * The day's places are paid content like the rest of the plan, and each place
 * keeps its own map gate: a locked place is shown to a viewer without access
 * as a lock — never its name, coordinates or the note written about it.
 */
export const itineraryDayPlaces = pgTable(
  'itinerary_day_places',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    dayId: uuid('day_id')
      .notNull()
      .references(() => itineraryDays.id, { onDelete: 'cascade' }),
    placeId: uuid('place_id')
      .notNull()
      .references((): AnyPgColumn => mapPlaces.id, { onDelete: 'cascade' }),
    sortOrder: integer('sort_order').notNull().default(0),
    /** Short tip for this stop ("go before 9, it gets busy"). */
    note: localized('note'),
    /** Optional suggested time, `HH:MM`. */
    visitTime: varchar('visit_time', { length: 5 }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('itinerary_day_places_unique').on(t.dayId, t.placeId),
    index('itinerary_day_places_order_idx').on(t.dayId, t.sortOrder),
    index('itinerary_day_places_place_idx').on(t.placeId),
  ],
)

export const itineraryRegions = pgTable(
  'itinerary_regions',
  {
    itineraryId: uuid('itinerary_id')
      .notNull()
      .references(() => itineraries.id, { onDelete: 'cascade' }),
    regionId: uuid('region_id')
      .notNull()
      .references(() => regions.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.itineraryId, t.regionId] })],
)

/**
 * Generated PDF per itinerary version per locale.
 *
 * Built at publish time rather than per-order, so Chromium never runs on the
 * request path — it peaks around 1.5 GiB and would not coexist with Postgres
 * on the 4 GiB droplet.
 */
export const itineraryDocuments = pgTable(
  'itinerary_documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    itineraryId: uuid('itinerary_id')
      .notNull()
      .references(() => itineraries.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    locale: varchar('locale', { length: 5 }).notNull(),
    /** Key in the PRIVATE bucket. Served only by presigned URL. */
    objectKey: text('object_key').notNull(),
    bytes: integer('bytes'),
    ...timestamps,
  },
  (t) => [uniqueIndex('itinerary_doc_unique').on(t.itineraryId, t.version, t.locale)],
)

// ---------------------------------------------------------------------------
// Packages
// ---------------------------------------------------------------------------

export const packages = pgTable('packages', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: varchar('slug', { length: 128 }).notNull().unique(),
  legacyId: varchar('legacy_id', { length: 64 }),

  name: localized('name').notNull(),
  blurb: localized('blurb'),

  days: integer('days').notNull(),
  maxGuests: integer('max_guests').notNull(),
  driverIncluded: boolean('driver_included').notNull().default(false),

  /**
   * Base price. The prototype displayed "from $X" but charged a flat X
   * regardless of guest count, while collecting guests and dates and then
   * discarding them into a display string. pricingMode resolves that
   * contradiction explicitly rather than leaving it ambiguous.
   */
  priceMinor: priceMinor(),
  currency: currency(),
  /** 'flat' = price as-is; 'per_guest' = price x guests. */
  pricingMode: varchar('pricing_mode', { length: 16 }).notNull().default('flat'),

  amenities: jsonb('amenities').$type<string[]>(),
  included: jsonb('included').$type<Localized[]>(),
  excluded: jsonb('excluded').$type<Localized[]>(),

  heroImageId: uuid('hero_image_id').references(() => media.id),

  // --- Phase 3 (migration 0019) ---

  /** An itinerary that comes with the package (its files and pages). */
  itineraryId: uuid('itinerary_id').references((): AnyPgColumn => itineraries.id, {
    onDelete: 'set null',
  }),
  /** VIP map access comes with the package — granted on payment from `vipPlanId`. */
  includesVip: boolean('includes_vip').notNull().default(false),
  vipPlanId: uuid('vip_plan_id').references((): AnyPgColumn => plans.id, {
    onDelete: 'set null',
  }),

  ...publishing,
  ...timestamps,
  ...softDelete,
})

export const packageActivities = pgTable(
  'package_activities',
  {
    packageId: uuid('package_id')
      .notNull()
      .references(() => packages.id, { onDelete: 'cascade' }),
    activityId: uuid('activity_id')
      .notNull()
      .references(() => activities.id, { onDelete: 'cascade' }),
    sortOrder: integer('sort_order').notNull().default(0),
    /**
     * Day of the trip it happens on, 0 = the start date. Null = not fixed: the
     * booking is created without a date and the team arranges it.
     */
    dayOffset: integer('day_offset'),
  },
  (t) => [primaryKey({ columns: [t.packageId, t.activityId] })],
)

/**
 * Packages an itinerary is sold inside (sale mode C).
 *
 * `priceRule`: `included` — the package price already covers the plan;
 * `extra` — the plan is offered next to the package at its own price;
 * `deducted_on_upgrade` — a customer who already bought the plan pays the
 * package minus what they paid for it.
 */
export const itineraryPackageLinks = pgTable(
  'itinerary_package_links',
  {
    itineraryId: uuid('itinerary_id')
      .notNull()
      .references(() => itineraries.id, { onDelete: 'cascade' }),
    packageId: uuid('package_id')
      .notNull()
      .references(() => packages.id, { onDelete: 'cascade' }),
    isDefault: boolean('is_default').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    priceRule: varchar('price_rule', { length: 24 }).notNull().default('included'),
    ...timestamps,
  },
  (t) => [
    primaryKey({ columns: [t.itineraryId, t.packageId] }),
    index('itinerary_package_links_package_idx').on(t.packageId),
  ],
)

export const packageRegions = pgTable(
  'package_regions',
  {
    packageId: uuid('package_id')
      .notNull()
      .references(() => packages.id, { onDelete: 'cascade' }),
    regionId: uuid('region_id')
      .notNull()
      .references(() => regions.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.packageId, t.regionId] })],
)

// ---------------------------------------------------------------------------
// Map places — the freemium surface
// ---------------------------------------------------------------------------

export const mapPlaces = pgTable(
  'map_places',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: varchar('slug', { length: 128 }).notNull().unique(),
    legacyId: varchar('legacy_id', { length: 64 }),

    name: localized('name').notNull(),
    category: localized('category'),
    description: localized('description'),

    /**
     * Real coordinates are the ONLY coordinate system. The prototype carried
     * both projected lat/lon (nx/ny) for pins and hand-tuned ax/ay
     * percentages for the floating cards; card anchoring now derives from
     * the projection so places can be added without hand-authoring pixels.
     */
    lat: doublePrecision('lat').notNull(),
    lon: doublePrecision('lon').notNull(),

    regionId: uuid('region_id').references(() => regions.id),
    /** التصنيف الرئيسي للفلترة (مطاعم، كافيهات، شواطئ…). `category` النصي يبقى للعرض. */
    categoryId: uuid('category_id').references(() => categories.id),
    activityId: uuid('activity_id').references(() => activities.id),

    /**
     * Freemium gate. Locked places must be REDACTED server-side: an
     * unentitled client receives a count and a marker, never the name,
     * coordinates, rating or image. The prototype shipped all of it and
     * merely masked it with a CSS blur.
     */
    isFree: boolean('is_free').notNull().default(false),
    /** Free on the map even though its category is VIP (client: Sekumpul waterfall). */
    freeOverride: boolean('free_override').notNull().default(false),
    /** Which entitlement unlocks it: 'map_access' or 'vip'. */
    requiredEntitlement: varchar('required_entitlement', { length: 32 })
      .notNull()
      .default('map_access'),

    /**
     * نصوص حرة قديمة. المصدر الآن جدول `place_tags` (./product)، وهذا العمود
     * يبقى للتوافق مع البيانات الحالية ويُملأ منه مرة واحدة في الهجرة.
     */
    tags: jsonb('tags').$type<string[]>(),

    /** Hidden Gem: مكان حصري يُميّز في الخريطة ويُفلتر به. لا يغيّر الصلاحية وحده. */
    isHiddenGem: boolean('is_hidden_gem').notNull().default(false),
    /**
     * مخفي عن الخريطة والبحث تماماً (حتى للمشتركين) دون إلغاء نشره —
     * لمكان مغلق مؤقتاً، أو قيد المراجعة. يختلف عن `status = 'draft'`.
     */
    isHidden: boolean('is_hidden').notNull().default(false),
    canFavorite: boolean('can_favorite').notNull().default(true),
    canAddToTrip: boolean('can_add_to_trip').notNull().default(true),
    /** ترتيب يدوي من الإدارة (الأقل أولاً). */
    sortOrder: integer('sort_order').notNull().default(0),
    /** أولوية الظهور في نتائج البحث (الأعلى أولاً) — "أماكن مميزة". */
    priority: integer('priority').notNull().default(0),
    detailedDescription: localized('detailed_description'),
    /** روابط فيديو (YouTube/Vimeo/mp4) — أو ملف مرفوع من لوحة التحكم. */
    videos: jsonb('videos').$type<string[]>(),
    /** الوثيقة 6.3: "الصور" — معرض (معرّفات media بالترتيب) فوق الصورة الرئيسية. */
    galleryImageIds: jsonb('gallery_image_ids').$type<string[]>(),
    /** الوثيقة 6.3: "تصنيفات فرعية" — معرّفات categories إضافية للفلترة والبحث. */
    subCategoryIds: jsonb('sub_category_ids').$type<string[]>(),
    /** ملاحظات داخلية — لا تُرسل للعميل أبداً. */
    internalNotes: text('internal_notes'),

    openingHours: varchar('opening_hours', { length: 64 }),
    rating: real('rating'),

    /**
     * فعالية بتاريخ (تصنيف `events`): البداية والنهاية. NULL = مكان دائم.
     * صفحة الفعاليات تعرض القادمة أولاً وتخفي المنتهية.
     */
    eventStartsAt: timestamp('event_starts_at', { withTimezone: true }),
    eventEndsAt: timestamp('event_ends_at', { withTimezone: true }),

    heroImageId: uuid('hero_image_id').references(() => media.id),

    ...publishing,
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    index('map_places_free_idx').on(t.isFree),
    index('map_places_coords_idx').on(t.lat, t.lon),
    index('map_places_region_idx').on(t.regionId),
  ],
)

// ---------------------------------------------------------------------------
// Landmarks, articles, reviews
// ---------------------------------------------------------------------------

export const landmarks = pgTable('landmarks', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: varchar('slug', { length: 128 }).notNull().unique(),
  legacyId: varchar('legacy_id', { length: 64 }),
  name: localized('name').notNull(),
  type: localized('type'),
  blurb: localized('blurb'),
  regionId: uuid('region_id').references(() => regions.id),
  activityId: uuid('activity_id').references(() => activities.id),
  heroImageId: uuid('hero_image_id').references(() => media.id),
  sortOrder: integer('sort_order').notNull().default(0),
  ...publishing,
  ...timestamps,
  ...softDelete,
})

export const articleCategories = pgTable('article_categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: varchar('key', { length: 64 }).notNull().unique(),
  label: localized('label').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  ...timestamps,
})

export const articles = pgTable('articles', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: varchar('slug', { length: 160 }).notNull().unique(),
  legacyId: varchar('legacy_id', { length: 64 }),

  title: localized('title').notNull(),
  excerpt: localized('excerpt'),

  /**
   * The body the prototype never had. bodyParas() returned the SAME three
   * lorem paragraphs for every article and ARTICLES carried no body field
   * at all — the blog was a shell.
   */
  body: jsonb('body').$type<Localized>(),

  categoryId: uuid('category_id').references(() => articleCategories.id),
  heroImageId: uuid('hero_image_id').references(() => media.id),

  /** Where the in-article CTA points: 'map' | 'activities' | 'driver'. */
  bridge: varchar('bridge', { length: 32 }),

  /**
   * الوثيقة 2.3/2.4 "مشاهدة محتوى حصري": من يقرأ النص الكامل.
   * NULL = الجميع، 'map_access' أو 'vip' = حاملو الصلاحية فقط (VIP يشمل
   * map_access). العنوان والمقتطف والصورة عامة دائماً؛ النص لا يُرسل لغير
   * المستحق. قيمة غير معروفة تُعامل كـ 'vip' (الإغلاق اتجاه الفشل الآمن).
   */
  requiredEntitlement: varchar('required_entitlement', { length: 32 }),

  ...publishing,
  ...timestamps,
  ...softDelete,
})

export const reviews = pgTable(
  'reviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    authorName: varchar('author_name', { length: 128 }).notNull(),
    authorCountry: localized('author_country'),
    stars: integer('stars').notNull(),
    body: localized('body'),

    /**
     * Reviews belong to something. The prototype filtered a shared pool by
     * tag overlap and fell back to slice(0,3) on no match, so unrelated
     * reviews displayed as though they were for the activity being viewed.
     */
    activityId: uuid('activity_id').references(() => activities.id),
    /** Set once reviews come from real bookings, enabling "verified". */
    orderId: uuid('order_id'),

    isPublished: boolean('is_published').notNull().default(false),
    ...timestamps,
    ...softDelete,
  },
  (t) => [index('reviews_activity_idx').on(t.activityId)],
)

// ---------------------------------------------------------------------------
// UI translations — the 597 keys, editable in admin
// ---------------------------------------------------------------------------

export const translations = pgTable('translations', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: varchar('key', { length: 128 }).notNull().unique(),
  values: localized('values').notNull(),
  ...timestamps,
})

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const activitiesRelations = relations(activities, ({ one, many }) => ({
  region: one(regions, { fields: [activities.regionId], references: [regions.id] }),
  heroImage: one(media, { fields: [activities.heroImageId], references: [media.id] }),
  categories: many(activityCategories),
  images: many(activityImages),
  reviews: many(reviews),
  tiers: many(activityTiers),
  addons: many(activityAddons),
}))

export const activityTiersRelations = relations(activityTiers, ({ one }) => ({
  activity: one(activities, {
    fields: [activityTiers.activityId],
    references: [activities.id],
  }),
}))

export const activityAddonsRelations = relations(activityAddons, ({ one }) => ({
  activity: one(activities, {
    fields: [activityAddons.activityId],
    references: [activities.id],
  }),
}))

export const itinerariesRelations = relations(itineraries, ({ one, many }) => ({
  heroImage: one(media, { fields: [itineraries.heroImageId], references: [media.id] }),
  days: many(itineraryDays),
  regions: many(itineraryRegions),
  documents: many(itineraryDocuments),
}))

export const itineraryDaysRelations = relations(itineraryDays, ({ one }) => ({
  itinerary: one(itineraries, {
    fields: [itineraryDays.itineraryId],
    references: [itineraries.id],
  }),
  activity: one(activities, { fields: [itineraryDays.activityId], references: [activities.id] }),
}))

export const packagesRelations = relations(packages, ({ one, many }) => ({
  heroImage: one(media, { fields: [packages.heroImageId], references: [media.id] }),
  activities: many(packageActivities),
  regions: many(packageRegions),
}))

export const mapPlacesRelations = relations(mapPlaces, ({ one }) => ({
  region: one(regions, { fields: [mapPlaces.regionId], references: [regions.id] }),
  activity: one(activities, { fields: [mapPlaces.activityId], references: [activities.id] }),
  heroImage: one(media, { fields: [mapPlaces.heroImageId], references: [media.id] }),
}))
