/**
 * Exactly one `<h1>` per page.
 *
 * Not a stylistic preference. Screen-reader users navigate by heading, and the
 * h1 is the answer to "what page am I on" — two of them means the answer is
 * ambiguous, none means there is no answer at all. Axe's `page-has-heading-one`
 * is best-practice and scored `moderate`, so it would never fail a run at this
 * suite's threshold; that is exactly why the assertion lives here instead.
 *
 * The heading outline is reported alongside, because when this fails the next
 * question is always "which two?".
 */

import { expect, test } from '@playwright/test'

import { collectHeadings } from './fixtures/dom-audit'
import { gotoRoute, LOCALES, ROUTES } from './fixtures/routes'

for (const locale of LOCALES) {
  test.describe(`headings · ${locale}`, () => {
    for (const route of ROUTES) {
      test(`${route.id} has exactly one h1`, async ({ page }, testInfo) => {
        const url = await gotoRoute(page, route, locale)
        const headings = await collectHeadings(page)
        const h1s = headings.filter((heading) => heading.level === 1)

        const outline = headings
          .map((heading) => `${'  '.repeat(heading.level - 1)}h${heading.level} ${heading.text}`)
          .join('\n')

        await testInfo.attach(`outline-${locale}-${route.id}.txt`, {
          body: outline,
          contentType: 'text/plain',
        })

        expect(
          h1s.map((heading) => `${heading.selector} — "${heading.text}"`),
          `${url} should have exactly one <h1>, found ${h1s.length}.\n` +
            `Heading outline:\n${outline}\n`,
        ).toHaveLength(1)
      })
    }
  })
}
