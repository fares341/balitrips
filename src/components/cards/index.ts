/**
 * Catalogue cards.
 *
 * One card per content type, each rendering the markup and classes from
 * design/handoff/bt-ui.jsx. They are Server Components: every one is driven
 * entirely by a DTO from '@/lib/content/types', holds no state, and links with
 * the locale-aware next-intl `Link` rather than the prototype's
 * `onClick={navigate}` buttons.
 *
 * Where the handoff wired a cart mutation straight into the card
 * (`addToTrip`), these expose an `action` slot instead — the page passes an
 * interactive Client Component in, and the card stays on the server.
 */

export { ActivityCard } from './activity-card'
export type { ActivityCardProps } from './activity-card'

export { ItineraryCard } from './itinerary-card'
export type { ItineraryCardProps } from './itinerary-card'

export { PackageCard } from './package-card'
export type { PackageCardProps } from './package-card'

export { LandmarkCard } from './landmark-card'
export type { LandmarkCardProps } from './landmark-card'

export { ArticleCard } from './article-card'
export type { ArticleCardProps } from './article-card'

export { PlaceCard } from './place-card'
export type { PlaceCardProps } from './place-card'

export { ReviewCard } from './review-card'
export type { ReviewCardProps } from './review-card'
