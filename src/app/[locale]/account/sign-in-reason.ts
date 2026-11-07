/**
 * Why /account asks the visitor to sign in. Kept out of `signed-out-pane.tsx`
 * ('use client'): the account page calls `reasonFor` on the server, and a
 * function exported from a client module is a client reference there — it
 * threw and turned every signed-out /account visit into a 500 (final QA,
 * Nov 2026).
 */

export type SignInReason = 'favorites' | 'account' | 'trip'

/** The reason implied by where the visitor was going (an internal path). */
export function reasonFor(next: string | null): SignInReason {
  if (next === null) return 'account'
  if (next.startsWith('/account/favorites')) return 'favorites'
  if (/^\/(?:my-trip|trip|cart|checkout|account\/trip)(?:[/?#]|$)/.test(next)) return 'trip'
  return 'account'
}
