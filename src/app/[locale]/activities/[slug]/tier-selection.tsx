'use client'

/**
 * Which service level the visitor has chosen.
 *
 * The tier cards sit full-width in the main column and the booking box sits in
 * the sidebar — different branches of the page's grid. Lifting the state into
 * a wrapper would have meant restructuring the server-rendered layout around a
 * client component, so a small context carries it across instead.
 *
 * Context rather than a URL parameter: the choice is a step in a flow, not a
 * destination. A tier in the URL would make the back button undo a selection
 * rather than leave the page, and would need the server to validate a value
 * that only matters once something is added to the cart.
 */

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'

export interface SelectedTier {
  id: string
  priceMinor: number
  currency: string
  pricingMode: 'flat' | 'per_guest'
  maxGuests: number | null
}

interface TierSelectionValue {
  selected: SelectedTier | null
  select: (tier: SelectedTier | null) => void
}

const TierSelectionContext = createContext<TierSelectionValue | null>(null)

export function TierSelectionProvider({ children }: { children: ReactNode }) {
  const [selected, setSelected] = useState<SelectedTier | null>(null)
  const value = useMemo<TierSelectionValue>(() => ({ selected, select: setSelected }), [selected])
  return <TierSelectionContext.Provider value={value}>{children}</TierSelectionContext.Provider>
}

/**
 * Returns a no-op when there is no provider, so an activity with no tiers can
 * render the booking box exactly as before without a conditional hook.
 */
export function useTierSelection(): TierSelectionValue {
  return useContext(TierSelectionContext) ?? { selected: null, select: () => {} }
}
