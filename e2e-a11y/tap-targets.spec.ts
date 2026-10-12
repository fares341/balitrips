/**
 * Every interactive target is at least 44x44 CSS px.
 *
 * The design commits to this explicitly — `.bt-iconbtn`, `.bt-burger`,
 * `.bt-modal-x` and the stepper buttons are all declared `width: 44px;
 * height: 44px` in `src/styles/components.css`, and `.bt-input` carries
 * `min-height: 44px`. A commitment stated in a stylesheet and never measured
 * is a commitment that erodes the first time somebody adds a compact variant.
 *
 * 44 is the Apple HIG figure and is stricter than WCAG 2.2 SC 2.5.8 (24x24,
 * level AA) and equal to SC 2.5.5 (level AAA). Axe implements neither, so
 * without this spec nothing in the toolchain checks it at all.
 *
 * Runs at two viewports, because the header swaps its desktop nav for a drawer
 * at 900px and the two layouts have entirely different controls: measuring
 * only the wide one leaves every phone control unmeasured, and phones are
 * where the finger is.
 *
 * Two of the guideline's own exceptions are honoured, and both are listed in
 * the attachment rather than swallowed:
 *
 *  - **Inline.** A link inside a sentence cannot be 44px tall without breaking
 *    the line box.
 *  - **Equivalent.** A small control whose destination is also reachable from
 *    a full-size control on the same page. Every card in this catalogue has a
 *    23px title link and a 44px "View" button pointing at the same activity;
 *    counting the title as a failure would report one target three times and
 *    bury the findings that matter under the ones that do not.
 *
 * Nothing else is excused. In particular the threshold itself is never
 * lowered — if a run is red, the markup is what changes.
 */

import { expect, test } from '@playwright/test'

import { collectTapTargets, formatTargets } from './fixtures/dom-audit'
import { gotoRoute, LOCALES, ROUTES } from './fixtures/routes'

/** The design's own figure. Do not lower it to make a run go green. */
const MIN_PX = 44

/**
 * Sub-pixel slack.
 *
 * A control laid out at `43.99px` by fractional-scaling arithmetic is a
 * rounding artifact, not a design defect. Anything genuinely undersized —
 * a 36px icon button, a 24px close cross — is nowhere near this margin.
 */
const EPSILON = 0.5

for (const locale of LOCALES) {
  test.describe(`tap targets · ${locale}`, () => {
    for (const route of ROUTES) {
      test(`${route.id} targets are ${MIN_PX}x${MIN_PX}`, async ({ page }, testInfo) => {
        const url = await gotoRoute(page, route, locale)
        const targets = await collectTapTargets(page)

        const meets = (target: (typeof targets)[number]) =>
          target.width >= MIN_PX - EPSILON && target.height >= MIN_PX - EPSILON

        /**
         * Destinations that already have one control big enough to press.
         *
         * A card is a link on its image, a link on its title and a 44px
         * "View" button, all pointing at the same activity. The button
         * satisfies the guideline for that destination; failing the title as
         * well would be reporting the same target three times.
         */
        const servedBigEnough = new Set(
          targets.filter((target) => target.href !== null && meets(target)).map((t) => t.href),
        )

        const inlineExempt = targets.filter((target) => target.inline)
        const measured = targets.filter((target) => !target.inline)
        const small = measured.filter((target) => !meets(target))

        const equivalentExempt = small.filter(
          (target) => target.href !== null && servedBigEnough.has(target.href),
        )
        const undersized = small.filter((target) => !equivalentExempt.includes(target))

        await testInfo.attach(`tap-targets-${locale}-${route.id}.txt`, {
          body:
            `${targets.length} interactive element(s) — ${measured.length} measured, ` +
            `${inlineExempt.length} exempt as inline text links, ` +
            `${equivalentExempt.length} exempt via an equivalent full-size control.\n\n` +
            `UNDERSIZED (${undersized.length}):\n${formatTargets(undersized)}\n\n` +
            `EQUIVALENT CONTROL EXISTS (${equivalentExempt.length}):\n` +
            `${formatTargets(equivalentExempt)}\n\n` +
            `INLINE, EXEMPT (${inlineExempt.length}):\n${formatTargets(inlineExempt)}\n`,
          contentType: 'text/plain',
        })

        expect(
          undersized.map((target) => `${target.selector} ${target.width}x${target.height}`),
          `${url} (${testInfo.project.name}) has ${undersized.length} target(s) under ` +
            `${MIN_PX}x${MIN_PX} CSS px with no equivalent full-size control:\n` +
            `${formatTargets(undersized)}\n`,
        ).toEqual([])
      })
    }
  })
}
