/**
 * Modal dialogs trap focus, and give it back.
 *
 * Neither behaviour is visible to a rules engine: axe scans one snapshot of
 * the tree, and both of these are properties of what happens *next*. They are
 * also the two that break silently — a dialog with no trap looks completely
 * correct until somebody presses Tab, and then the keyboard is inside a page
 * that is covered by a scrim and cannot be seen.
 *
 * `src/components/shared/modal.tsx` implements both, and its own header notes
 * that all three call sites in the handoff had neither. This spec is the thing
 * that keeps that true.
 *
 * Two dialogs, chosen because they exercise different halves of `<Modal>`:
 *
 *  - **The auth dialog** on `/account` has a real opener — a button that stays
 *    mounted — so it can prove focus *restore*, which is the half a portal
 *    most often gets wrong.
 *  - **The search overlay** at `/search` is open on arrival, uses
 *    `initialFocus` to put the caret in the field, and sits over a header and
 *    footer full of tabbable links. If the trap leaks, Tab lands on one of
 *    them and this notices.
 */

import { expect, test, type Locator, type Page } from '@playwright/test'

import { gotoPath, localePath, LOCALES } from './fixtures/routes'

/** Focusable descendants, matching the selector list `<Modal>` traps on. */
const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

/** Is the keyboard currently somewhere inside `dialog`? */
async function focusIsInside(dialog: Locator): Promise<boolean> {
  return dialog.evaluate((node) => {
    const active = document.activeElement
    return active !== null && (node === active || node.contains(active))
  })
}

/** What currently has focus, for a failure message that names the culprit. */
async function activeDescription(page: Page): Promise<string> {
  return page.evaluate(() => {
    const active = document.activeElement
    if (active === null) return '(nothing)'
    const cls =
      active instanceof HTMLElement && active.className !== ''
        ? `.${String(active.className).trim().split(/\s+/).slice(0, 2).join('.')}`
        : ''
    const label =
      active.getAttribute('aria-label') ?? (active.textContent ?? '').trim().slice(0, 40)
    return `${active.tagName.toLowerCase()}${cls}${label === '' ? '' : ` "${label}"`}`
  })
}

/**
 * Tab all the way round the dialog, twice, in both directions.
 *
 * Two extra presses past the focusable count is what catches an off-by-one at
 * the wrap: a trap that handles the last element but not the dialog container
 * itself leaks on exactly that press.
 */
async function expectFocusTrapped(page: Page, dialog: Locator, what: string): Promise<void> {
  const count = await dialog.locator(FOCUSABLE).count()
  const presses = count + 2

  for (const keys of ['Tab', 'Shift+Tab'] as const) {
    for (let index = 0; index < presses; index += 1) {
      await page.keyboard.press(keys)
      const inside = await focusIsInside(dialog)
      expect(
        inside,
        `${what}: focus escaped after ${index + 1} × ${keys} ` +
          `(${count} focusable elements inside). Focus is now on ${await activeDescription(page)}, ` +
          `which is behind the scrim and invisible to the person pressing the key.`,
      ).toBe(true)
    }
  }
}

for (const locale of LOCALES) {
  test.describe(`focus management · ${locale}`, () => {
    test('auth dialog traps focus and restores it to its opener', async ({ page }) => {
      await gotoPath(page, localePath(locale, '/account'))

      // The account page renders a card with a single button; the dialog is
      // controlled by it. `getByRole` rather than a label lookup, because the
      // label is a translated string and this runs in three languages.
      const opener = page.locator('.card button').first()
      await expect(opener).toBeVisible()

      const dialog = page.getByRole('dialog')

      // Retried, because the button is server-rendered and inert until the
      // client bundle hydrates. Clicking a not-yet-live button is a no-op, and
      // waiting on an arbitrary timeout instead would be flaky on a cold boot.
      await expect(async () => {
        await opener.click()
        await expect(dialog).toBeVisible({ timeout: 1000 })
      }).toPass({ timeout: 20_000 })

      await expect(dialog).toHaveAttribute('aria-modal', 'true')

      expect(
        await focusIsInside(dialog),
        'the auth dialog opened without moving focus into itself, so a screen ' +
          `reader stays on the page behind it. Focus is on ${await activeDescription(page)}.`,
      ).toBe(true)

      await expectFocusTrapped(page, dialog, 'auth dialog')

      await page.keyboard.press('Escape')
      await expect(dialog).toBeHidden()

      expect(
        await opener.evaluate((node) => node === document.activeElement),
        'closing the auth dialog did not return focus to the button that opened ' +
          `it — focus went to ${await activeDescription(page)}, which drops a ` +
          'keyboard user back at the top of the document.',
      ).toBe(true)
    })

    test('search overlay traps focus', async ({ page }) => {
      await gotoPath(page, localePath(locale, '/search'))

      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible({ timeout: 20_000 })
      await expect(dialog).toHaveAttribute('aria-modal', 'true')

      // `initialFocus` points at the query field: arriving at /search and
      // having to Tab to the search box would defeat the route.
      const field = dialog.locator('input[type="search"]')
      await expect(field).toBeFocused()

      await expectFocusTrapped(page, dialog, 'search overlay')
    })
  })
}
