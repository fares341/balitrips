/**
 * Trip line rendering, shared by the cart and the checkout review.
 *
 * Owned by the cart/checkout work rather than dropped into
 * `@/components/shared`, which another agent owns.
 */

export {
  NO_PRICE,
  TRIP_KIND_ICON,
  TripLine,
  TripThumb,
  tripLineMeta,
  type TripLineProps,
  type TripThumbProps,
} from './trip-line'
