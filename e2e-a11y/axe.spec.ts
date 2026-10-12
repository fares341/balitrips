/**
 * Axe sweep — nine routes across three locales, twenty-seven scans.
 *
 * All three locales, every time. Arabic is not a translation of the English
 * page, it is a mirrored layout: `dir="rtl"` changes which side the focus ring
 * starts on, which end of a card the price sits at, and whether an icon has
 * been flipped. A rule like `color-contrast` can pass in English and fail in
 * Arabic purely because a gradient overlay ran the other way.
 *
 * The bar is `serious` and `critical` — and it does not move. `moderate` and
 * `minor` are printed under an "advisory" heading and attached to the report,
 * so nothing is hidden, but they do not turn the build red.
 */

import { expect, test } from '@playwright/test'

import { formatViolations, runAxe } from './fixtures/axe'
import { gotoRoute, LOCALES, ROUTES } from './fixtures/routes'

for (const locale of LOCALES) {
  test.describe(`axe · ${locale}`, () => {
    for (const route of ROUTES) {
      test(`${route.id} — ${route.label}`, async ({ page }, testInfo) => {
        const url = await gotoRoute(page, route, locale)
        const report = await runAxe(page)

        // Advisory findings are attached whether or not the test passes —
        // that is the whole point of separating them from the threshold.
        if (report.advisory.length > 0) {
          const text = formatViolations(report.advisory)
          await testInfo.attach(`advisory-${locale}-${route.id}.txt`, {
            body: text,
            contentType: 'text/plain',
          })
          console.log(
            `\n  advisory (moderate/minor) — ${url}\n${text}\n` +
              `  ↑ reported, not failed. ${report.passCount} rules passed, ` +
              `${report.incompleteCount} need a human.\n`,
          )
        }

        // Asserted on a one-line-per-element projection rather than on the raw
        // violation objects. `toEqual` prints its whole diff, and an axe
        // `Result` carries every check it ran with `relatedNodes` attached —
        // a single `color-contrast` finding runs to hundreds of lines and
        // buries the message underneath it.
        const summary = report.blocking.flatMap((violation) =>
          violation.nodes.map(
            (node) =>
              `[${violation.impact ?? 'unscored'}] ${violation.id} @ ` +
              `${node.target.map((part) => (typeof part === 'string' ? part : part.join(' '))).join(' >>> ')}`,
          ),
        )

        expect(
          summary,
          `${url} has ${report.blocking.length} serious/critical axe violation(s):\n` +
            `${formatViolations(report.blocking)}\n`,
        ).toEqual([])
      })
    }
  })
}
