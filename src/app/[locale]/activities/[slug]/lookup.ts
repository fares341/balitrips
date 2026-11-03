/**
 * Per-request (React `cache`) lookups shared by the activity layout and page,
 * so the existence check in the layout costs no second query.
 */

import { cache } from 'react'

import { getActivityBySlug, mergedActivitySlug } from '@/lib/content/queries'

export const findPageActivity = cache((slug: string) => getActivityBySlug(slug))
export const findMergedSlug = cache((slug: string) => mergedActivitySlug(slug))
