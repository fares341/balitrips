/**
 * Every icon-only control carries an accessible name.
 *
 * The header alone has six: burger, account, search, cart, language and the
 * mobile account duplicate. Rendered, they are a `<button>` or an `<a>`
 * wrapping a single `aria-hidden` `<svg>` — which is correct, and which means
 * the *only* thing standing between a screen-reader user and an unlabelled
 * "button, button, button, button" is the `aria-label`. There is no fallback:
 * the icon contributes nothing, by design.
 *
 * Overlaps with axe's `button-name` and `link-name` on purpose, and goes
 * further in two ways. It enumerates the icon-only controls it found — the
 * list is the useful artifact, because a control that stops being icon-only
 * silently drops out of axe's radar — and it does not accept a bare `title`
 * attribute as sufficient, since a tooltip is invisible on a touch device.
 */

import { expect, test } from '@playwright/test'

import { collectIconOnlyControls, formatControls } from './fixtures/dom-audit'
import { gotoRoute, LOCALES, ROUTES } from './fixtures/routes'

for (const locale of LOCALES) {
  test.describe(`icon-only controls · ${locale}`, () => {
    for (const route of ROUTES) {
      test(`${route.id} names every icon-only control`, async ({ page }, testInfo) => {
        const url = await gotoRoute(page, route, locale)
        const controls = await collectIconOnlyControls(page)

        const inventory = controls
          .map(
            (control) =>
              `${control.name === '' ? '(unnamed)' : control.name} — ${control.selector}`,
          )
          .join('\n')

        await testInfo.attach(`icon-controls-${locale}-${route.id}.txt`, {
          body: `${controls.length} icon-only control(s)\n${inventory}`,
          contentType: 'text/plain',
        })

        const unnamed = controls.filter((control) => control.name === '')

        expect(
          unnamed.map((control) => control.selector),
          `${url} has ${unnamed.length} icon-only control(s) with no accessible name.\n` +
            `A screen reader announces these as an unlabelled button:\n` +
            `${formatControls(unnamed)}\n`,
        ).toEqual([])
      })
    }
  })
}
