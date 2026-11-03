/**
 * Site-wide default: free cancellation up to 1 hour before the activity.
 *
 * Applied only when an activity is CREATED in Studio ("new"). A sheet import
 * keeps the sheet's value (a blank cell stays blank, so re-importing the same
 * file changes nothing). Each activity's own `free_cancellation_hours` stays
 * as configured; null still means "no free cancellation".
 */
export const DEFAULT_FREE_CANCEL_HOURS = 1
