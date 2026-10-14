/** Sort keys of the activities toolbar (prototype `#sort`). */
export const ACTIVITY_SORTS = ['rating', 'price-asc', 'price-desc', 'region'] as const
export type ExplorerSort = (typeof ACTIVITY_SORTS)[number]
