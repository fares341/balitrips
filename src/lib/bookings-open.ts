/**
 * The bookings kill switch.
 *
 * balitrips.co is publicly browsable while PAYMENT_PROVIDER=sandbox — a
 * provider that reports success without money moving. Until a real PSP is
 * wired up, no order, order line, payment row or capacity reservation may be
 * written, or the owner sees confirmed bookings against real capacity for
 * trips nobody paid for.
 *
 * Opt-IN, exactly like ALLOW_SANDBOX_PAYMENTS and for the same reason: the
 * safe state is what happens when nobody configures anything. A droplet that
 * lost its env file, a rolled-back container, a fresh box or a typo in
 * app.env must all fail to *closed*. The worst case of any misconfiguration
 * is then "browsable but nobody can book", which is the state being asked
 * for — never "quietly taking orders that can never be charged".
 *
 * This is the opposite polarity to DISABLE_ADMIN_2FA, and deliberately so:
 * there the default (2FA on) is already safe and the flag weakens it, so it
 * is an opt-out. Here the dangerous capability is *taking an order*, so the
 * flag enables rather than weakens, and absence must refuse.
 *
 * Read per call, inside the function — never at module scope. Next evaluates
 * module scope during `next build`, so a module-level const would bake the
 * build machine's value into the image and stop responding to the env
 * entirely. For the same reason this must NEVER become NEXT_PUBLIC_: that
 * inlines it into the client bundle, puts the gate where the visitor can see
 * it, and turns flipping it into a rebuild instead of a restart.
 *
 * SERVER ONLY. Do not import from a 'use client' module.
 */

/** Thrown by every write path that would create or extend a booking. */
export class BookingsClosedError extends Error {
  readonly code = 'bookings_closed'

  constructor(where: string) {
    super(`Bookings are closed: ${where} refused. Set ALLOW_BOOKINGS=true to reopen.`)
    // Matched by `name` rather than `instanceof` at the action boundary: the
    // server action and this module can end up in different bundles, where
    // instanceof silently fails across the boundary.
    this.name = 'BookingsClosedError'
  }
}

/** True only when someone has deliberately opened bookings. */
export function bookingsOpen(): boolean {
  return process.env.ALLOW_BOOKINGS === 'true'
}

/**
 * Throwing guard, for service functions that already signal failure by
 * throwing. Server actions should use `bookingsOpen()` and return a typed
 * refusal instead — a thrown error in an action surfaces as an opaque digest
 * in production and tells the traveller nothing.
 *
 * `where` names the entry point in the server log, so it is provable which
 * paths are still being reached.
 */
export function assertBookingsOpen(where: string): void {
  if (!bookingsOpen()) throw new BookingsClosedError(where)
}
