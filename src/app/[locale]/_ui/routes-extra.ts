/**
 * Two destinations the shared route table does not (yet) declare.
 *
 * `src/components/layout/routes.ts` is the site's route table and is owned by
 * another agent. These two paths are referenced by the pages in this bundle and
 * belong there once the ownership boundary allows — they are declared here so
 * there is exactly one place to change when the routes land, rather than six
 * string literals scattered through the marketing pages.
 *
 *  - `/custom` is the custom-trip questionnaire: the homepage's second hero CTA
 *    and the sixth services pillar both point at it. It is a named screen in
 *    design/handoff/README.md.
 *  - `/checkout` is where a paid plan goes. The handoff's "Choose plan" button
 *    called `unlockMap()` directly — it granted entitlement in client state
 *    with no payment, no order and no record. Nothing in this bundle unlocks
 *    anything; the button is a link to checkout and a later phase wires the
 *    payment behind it.
 */

export const CUSTOM_HREF = '/custom'

export const CHECKOUT_HREF = '/checkout'

/** Checkout URL for an access plan, e.g. `/checkout?plan=map`. */
export function checkoutHref(plan: string): string {
  return `${CHECKOUT_HREF}?plan=${encodeURIComponent(plan)}`
}
