/**
 * Site-wide default: free cancellation up to 1 hour before the activity.
 *
 * Applied only when an activity is CREATED (Studio "new" or a sheet import
 * without the column). Each activity's own `free_cancellation_hours` stays as
 * configured; null still means "no free cancellation".
 */
export const DEFAULT_FREE_CANCEL_HOURS = 1
