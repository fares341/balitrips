/**
 * Who opens «فعاليات جدولي» — one check for the page and its actions.
 * Server-only.
 */

import { can } from '@/lib/auth/roles'
import { getUser } from '@/lib/auth/session'
import { ownsItinerary } from '@/lib/content/extra-queries'

import { buyerAccess, type BuyerAccess } from './bundle'
import { findItineraryIdBySlug } from './buyer'

export interface BuyerViewer {
  access: BuyerAccess | 'missing'
  userId: string | null
  itineraryId: string | null
  owns: boolean
  /** Staff previewing (not the owner): may look, never book. */
  preview: boolean
}

export async function resolveBuyerViewer(slug: string): Promise<BuyerViewer> {
  const itineraryId = await findItineraryIdBySlug(slug)
  if (itineraryId === null)
    return { access: 'missing', userId: null, itineraryId: null, owns: false, preview: false }
  const user = await getUser()
  const owns = user !== null && (await ownsItinerary(user.id, itineraryId))
  const staff = user !== null && can(user.role, 'content.read')
  return {
    access: buyerAccess({ signedIn: user !== null, owns, staff }),
    userId: user?.id ?? null,
    itineraryId,
    owns,
    preview: !owns && staff,
  }
}
