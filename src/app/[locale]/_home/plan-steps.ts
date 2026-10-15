/**
 * Home "plan your trip in steps" cards — the single list to edit.
 *
 * Order = the number shown on the card (01, 02 …). Each entry needs two
 * message keys in messages/{ar,en,id}.json: `hv3_st_<key>_t` (title) and
 * `hv3_st_<key>_d` (two-line description). `art` picks the illustration from
 * src/components/bt/step-art.tsx. To add a card, append an entry here and add
 * its keys.
 */

import type { StepArtName } from '@/components/bt/step-art'

export type PlanStep = {
  key: string
  art: StepArtName
  href: string
}

export const PLAN_STEPS: PlanStep[] = [
  { key: 'itin', art: 'itinerary', href: '/itineraries' },
  { key: 'pkg', art: 'package', href: '/packages' },
  { key: 'act', art: 'activity', href: '/activities' },
  { key: 'drv', art: 'driver', href: '/driver' },
]
