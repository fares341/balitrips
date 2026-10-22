/**
 * What an activity's status means, in one place (pure, no I/O).
 *
 *  - `draft`        not on the site at all;
 *  - `published`    listed everywhere, page open, bookable;
 *  - `hidden`       reachable by its link only: left out of every list, the
 *                   search, the home page and the sitemap, but the page opens
 *                   and it can be booked (a private offer sent to a client);
 *  - `unavailable`  page open and listed in the catalogue, but booking is off —
 *                   the page shows a clear message and a contact button. Never
 *                   picked for the home page.
 *
 * Unknown values read as `draft` (fail closed).
 */

export const ACTIVITY_STATUSES = ['draft', 'published', 'hidden', 'unavailable'] as const
export type ActivityStatus = (typeof ACTIVITY_STATUSES)[number]

export function activityStatus(value: string | null | undefined): ActivityStatus {
  return (ACTIVITY_STATUSES as readonly string[]).includes(value ?? '')
    ? (value as ActivityStatus)
    : 'draft'
}

/** Statuses whose page opens (by link, list or search). */
export const PAGE_STATUSES: readonly ActivityStatus[] = ['published', 'hidden', 'unavailable']
/** Statuses shown in lists, the catalogue and search results. */
export const LISTED_STATUSES: readonly ActivityStatus[] = ['published', 'unavailable']
/** Statuses that can be added to a trip and paid for. */
export const BOOKABLE_STATUSES: readonly ActivityStatus[] = ['published', 'hidden']

export interface ActivityVisibility {
  /** The page opens. */
  page: boolean
  /** Appears in lists, the catalogue and search. */
  listed: boolean
  /** May be picked for the home page section. */
  home: boolean
  /** Can be booked. */
  bookable: boolean
}

export function activityVisibility(value: string | null | undefined): ActivityVisibility {
  const status = activityStatus(value)
  return {
    page: PAGE_STATUSES.includes(status),
    listed: LISTED_STATUSES.includes(status),
    home: status === 'published',
    bookable: BOOKABLE_STATUSES.includes(status),
  }
}

/** Publishing-level statuses need the publish capability in the Studio. */
export function isPublicStatus(value: string | null | undefined): boolean {
  return activityStatus(value) !== 'draft'
}

/**
 * The `activities.max_guests` column default. A cap still at this value was
 * never set by the owner, so pages do not advertise it as "up to 20 people"
 * (it stays the booking limit all the same).
 */
export const DEFAULT_MAX_GUESTS = 20

/** Whether a party-size cap is worth showing as a fact on the page. */
export function showsGroupSize(max: number, min: number): boolean {
  return max !== DEFAULT_MAX_GUESTS || min > 1
}
