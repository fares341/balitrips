/**
 * Feature flags for the public website — one switch per postponed service.
 *
 * `driver`: the private driver service was taken off the public site by the
 * client (design package v3.2, `BT.FEAT.driver = false` in bt.js). While it is
 * `false`:
 *  - no menu, footer, home, services, map, booking, checkout, My Trip, FAQ,
 *    policy or package link/line mentions or sells a driver;
 *  - `/driver` answers 404;
 *  - the server refuses to add a driver line (booking box, checkout
 *    suggestion, assistant), so pricing and quotes simply have no driver line.
 * The page, the fleet data and the pricing code stay in place; the Studio
 * still shows and manages the fleet. To bring the service back, set it to
 * `true` (nothing else to change).
 */
export type FeatureName = 'driver'

// Typed as plain booleans (not literals) so flipping a value never changes
// how TypeScript narrows the code behind it.
export const FEATURES: Readonly<Record<FeatureName, boolean>> = {
  driver: false,
}

export function isFeatureOn(name: FeatureName): boolean {
  return FEATURES[name]
}
