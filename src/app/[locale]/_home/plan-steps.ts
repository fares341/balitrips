/**
 * Home "plan your trip in steps" cards — the single list to edit.
 *
 * Order = the number shown on the card (01, 02 …). Each entry needs two
 * message keys in messages/{ar,en,id}.json: `hv3_st_<key>_t` (title) and
 * `hv3_st_<key>_d` (two-line description). To add a card (e.g. a future
 * driver variant), append an entry here and add its keys.
 */

import type { IconName } from '@/components/ui/icon'

export type PlanStep = {
  key: string
  icon: IconName
  href: string
}

export const PLAN_STEPS: PlanStep[] = [
  { key: 'itin', icon: 'route', href: '/itineraries' },
  { key: 'pkg', icon: 'suitcase', href: '/packages' },
  { key: 'act', icon: 'compass', href: '/activities' },
  { key: 'drv', icon: 'car', href: '/driver' },
]
