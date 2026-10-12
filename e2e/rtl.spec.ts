import { type Page } from '@playwright/test'

import { expect, test } from './support/fixtures'

/**
 * The Arabic journey.
 *
 * Arabic is a first-class locale here, not a translation bolted on: the site
 * ships `messages/ar.json` at full parity and the layout sets `dir` from the
 * locale. That makes RTL a layout question, and layout questions are only
 * answerable in a browser at a real viewport — which is why this spec runs the
 * same browse journey as an Arabic reader and then measures.
 *
 * Two assertions, both structural:
 *
 *  1. `dir="rtl"` is actually on the document. Without it every logical
 *     property in the design system resolves the wrong way and the whole page
 *     is mirrored back to LTR.
 *  2. Nothing overflows the viewport horizontally. This is the classic RTL
 *     regression: a rule written with `margin-left` or `left:` instead of
 *     `margin-inline-start` / `inset-inline-start` looks perfect in English
 *     and pushes a column off the edge in Arabic. On the mobile project it is
 *     the difference between a usable page and one that scrolls sideways under
 *     the reader's thumb.
 */

const ARABIC_JOURNEY = ['/ar', '/ar/activities', '/ar/map', '/ar/itineraries', '/ar/cart'] as const

interface Overflow {
  tag: string
  className: string
  text: string
  left: number
  right: number
  viewport: number
}

/**
 * Elements whose box escapes the viewport in the inline direction.
 *
 * Two exclusions, both principled rather than convenient:
 *
 *  - **Anything clipped by an ancestor whose `overflow-x` is not `visible`.**
 *    A horizontally scrollable strip — a card rail, a wide table — is a
 *    deliberate design element. Its children are *supposed* to sit outside the
 *    box; they cannot make the page scroll, because the ancestor absorbs them.
 *  - **`position: fixed` elements.** A fixed box cannot extend the document's
 *    scrollable area by definition, so a closed off-canvas drawer parked at
 *    `translateX(-100%)` is correct behaviour, not a defect.
 *
 * The page-level `scrollWidth` check below is the authoritative one and has no
 * exclusions at all; this scan exists to name the culprit when it fails.
 */
async function findOverflow(page: Page): Promise<Overflow[]> {
  return page.evaluate(() => {
    const TOLERANCE = 1
    const viewport = document.documentElement.clientWidth
    const offenders: Overflow[] = []

    for (const element of Array.from(document.body.querySelectorAll('*'))) {
      const style = getComputedStyle(element)
      if (style.display === 'none' || style.visibility === 'hidden') continue
      if (style.position === 'fixed') continue

      const rect = element.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) continue
      if (rect.right <= viewport + TOLERANCE && rect.left >= -TOLERANCE) continue

      let ancestor = element.parentElement
      let clipped = false
      while (ancestor !== null && ancestor !== document.documentElement) {
        const overflowX = getComputedStyle(ancestor).overflowX
        if (overflowX !== 'visible') {
          clipped = true
          break
        }
        ancestor = ancestor.parentElement
      }
      if (clipped) continue

      offenders.push({
        tag: element.tagName.toLowerCase(),
        className: typeof element.className === 'string' ? element.className : '',
        text: (element.textContent ?? '').trim().slice(0, 60),
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        viewport,
      })
    }

    return offenders
  })
}

function describe(offenders: Overflow[]): string {
  return offenders
    .map(
      (one) =>
        `  • <${one.tag} class="${one.className}"> spans ${one.left}…${one.right} ` +
        `in a ${one.viewport}px viewport — "${one.text}"`,
    )
    .join('\n')
}

test.describe('Arabic (RTL)', () => {
  for (const path of ARABIC_JOURNEY) {
    test(`${path} renders right-to-left without horizontal overflow`, async ({ page }) => {
      await page.goto(path, { waitUntil: 'networkidle' })

      await expect(
        page.locator('html'),
        `${path} did not set dir="rtl" — every logical property resolves backwards`,
      ).toHaveAttribute('dir', 'rtl')
      await expect(page.locator('html')).toHaveAttribute('lang', 'ar')

      /*
       * The authoritative check: does the document scroll sideways?
       *
       * `scrollWidth` on the root element is the width of everything the
       * viewport can be scrolled across. If it exceeds the client width, the
       * reader has a horizontal scrollbar — which is the bug, whatever caused
       * it.
       */
      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }))

      const offenders = await findOverflow(page)

      expect(
        scrollWidth,
        `${path} scrolls horizontally: ${scrollWidth}px of content in a ${clientWidth}px ` +
          `viewport.\n${describe(offenders)}`,
      ).toBeLessThanOrEqual(clientWidth + 1)

      expect(
        offenders,
        `${path} has elements outside the viewport:\n${describe(offenders)}`,
      ).toEqual([])
    })
  }

  test('an Arabic reader can browse from the index into an activity', async ({ page }) => {
    await page.goto('/ar/activities', { waitUntil: 'domcontentloaded' })

    const link = page.locator('a[href^="/ar/activities/"]').first()
    await expect(link, 'the Arabic activities index lists nothing').toBeVisible()
    await link.click()
    await page.waitForURL(/\/ar\/activities\/[a-z0-9-]+$/)

    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }))
    const offenders = await findOverflow(page)

    expect(
      scrollWidth,
      `the Arabic activity detail page scrolls horizontally.\n${describe(offenders)}`,
    ).toBeLessThanOrEqual(clientWidth + 1)
    expect(offenders, `Arabic activity detail overflow:\n${describe(offenders)}`).toEqual([])
  })

  test('the Arabic pages are not silently rendering English', async ({ page }) => {
    // A guard on the guard: `dir="rtl"` with untranslated copy is a different
    // failure that would otherwise sail through every check above.
    await page.goto('/ar/activities', { waitUntil: 'domcontentloaded' })

    const text = (await page.textContent('body')) ?? ''
    const arabicCharacters = (text.match(/[؀-ۿ]/g) ?? []).length

    expect(
      arabicCharacters,
      'the Arabic page contains almost no Arabic script — the locale did not resolve',
    ).toBeGreaterThan(100)
  })
})
