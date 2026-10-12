/**
 * The checks axe does not make.
 *
 * Axe is a rules engine over the accessibility tree; three of the promises
 * this product makes are not expressible as axe rules at all:
 *
 *  1. **44x44 CSS px minimum for every target.** WCAG 2.2 SC 2.5.8 asks for
 *     24x24 at AA, and axe has no target-size rule at all. The design commits
 *     to 44 — `.bt-iconbtn`, `.bt-burger` and the stepper buttons are all
 *     declared `width: 44px; height: 44px` in `src/styles/components.css` — so
 *     44 is what gets asserted. A commitment nobody measures is decoration.
 *  2. **Icon-only controls carry a name.** Axe's `button-name`/`link-name`
 *     cover the empty case, but they pass on a `title` attribute, which no
 *     touch user ever sees, and they say nothing about *which* controls are
 *     icon-only. Enumerating them is what makes the report useful.
 *  3. **Focus trap and focus restore.** These are behaviours over time. Axe
 *     scans a snapshot and cannot see either. See `focus-trap.spec.ts`.
 *
 * Everything below runs as a `page.evaluate` body, so each function must be
 * self-contained — no imports, no closures over module scope. That is why the
 * helpers are re-declared inside every probe rather than shared.
 */

import type { Page } from '@playwright/test'

/* --------------------------------------------------------------------------
   Shared shapes
   -------------------------------------------------------------------------- */

export interface ControlInfo {
  /** `button.bt-iconbtn` — enough to find it in devtools. */
  selector: string
  tag: string
  /** Trimmed, whitespace-collapsed outer HTML, clipped. */
  html: string
  /** Resolved accessible name, `''` when there is none. */
  name: string
}

export interface TapTarget extends ControlInfo {
  width: number
  height: number
  /**
   * True when the control is a plain inline element sitting inside running
   * text. WCAG 2.5.5 and 2.5.8 both exempt those, because a link in a sentence
   * cannot be 44px tall without wrecking the line box.
   */
  inline: boolean
  /**
   * Resolved destination for anchors, `null` for everything else.
   *
   * Carried so the spec can apply the "equivalent control" exception that both
   * SC 2.5.5 and SC 2.5.8 grant: a small target is conformant when the same
   * function is reachable from another control on the same page that does meet
   * the size. A card whose title link is 23px tall and whose "View" button next
   * to it is 44px tall is the canonical example, and it is all over this
   * catalogue.
   */
  href: string | null
}

export interface HeadingInfo {
  level: number
  text: string
  selector: string
}

/* --------------------------------------------------------------------------
   The probe body, as a string of source shared by every evaluate call.

   Playwright serialises the evaluated function, so anything it references must
   be declared inside it. Rather than duplicate 80 lines of accessible-name
   logic three times, each probe declares the helpers it needs at the top of
   its own body.
   -------------------------------------------------------------------------- */

/**
 * Interactive things, by selector.
 *
 * `[tabindex]` is included and then filtered on value, because a positive or
 * zero tabindex makes a `<div>` a tab stop and therefore a target, while
 * `tabindex="-1"` is a programmatic focus target and not something a finger
 * ever aims at.
 */
const INTERACTIVE_SELECTOR = [
  'a[href]',
  'button',
  'input',
  'select',
  'textarea',
  'summary',
  '[role="button"]',
  '[role="link"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="switch"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[role="menuitemcheckbox"]',
  '[role="menuitemradio"]',
  '[role="option"]',
  '[tabindex]',
].join(',')

/* --------------------------------------------------------------------------
   Headings
   -------------------------------------------------------------------------- */

/**
 * Every heading in the document, in document order.
 *
 * Headings inside an `aria-hidden` subtree are excluded — they are not in the
 * accessibility tree, so they are not headings as far as this matters — but
 * visually hidden ones (clipped, `sr-only`) are kept, because a screen reader
 * announces those and they count towards the h1 total.
 */
export async function collectHeadings(page: Page): Promise<HeadingInfo[]> {
  return page.evaluate(() => {
    function describe(el: Element): string {
      const id = el.id !== '' ? `#${el.id}` : ''
      const cls =
        el instanceof HTMLElement && el.className !== ''
          ? `.${String(el.className).trim().split(/\s+/).slice(0, 3).join('.')}`
          : ''
      return `${el.tagName.toLowerCase()}${id}${cls}`
    }

    function rendered(el: Element): boolean {
      if (el.closest('[aria-hidden="true"]') !== null) return false
      if (el.closest('[hidden]') !== null) return false
      const style = getComputedStyle(el)
      // `display: none` collapses the box; `visibility: hidden` removes the
      // element from the accessibility tree. Clipped `sr-only` text does
      // neither, and is deliberately still counted.
      if (style.display === 'none' || style.visibility === 'hidden') return false
      return true
    }

    const out: { level: number; text: string; selector: string }[] = []
    for (const el of Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6'))) {
      if (!rendered(el)) continue
      out.push({
        level: Number.parseInt(el.tagName.slice(1), 10),
        text: (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 120),
        selector: describe(el),
      })
    }

    // `role="heading"` is rare here but would still be announced as one.
    for (const el of Array.from(document.querySelectorAll('[role="heading"]'))) {
      if (!rendered(el)) continue
      const level = Number.parseInt(el.getAttribute('aria-level') ?? '2', 10)
      out.push({
        level: Number.isFinite(level) ? level : 2,
        text: (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 120),
        selector: describe(el),
      })
    }

    return out
  })
}

/* --------------------------------------------------------------------------
   Icon-only controls
   -------------------------------------------------------------------------- */

/**
 * Controls that render no text — only an `<svg>` or an `<img>` — together with
 * the accessible name each one resolves to.
 *
 * The name resolution here is a deliberate subset of the full accname
 * algorithm: `aria-labelledby`, `aria-label`, associated `<label>`, subtree
 * text, `img[alt]`, `svg > title`, then `title`. It covers every naming
 * mechanism this codebase actually uses, and its failure mode is
 * conservative — an exotic naming path would be reported as unnamed and
 * investigated, not silently passed.
 */
export async function collectIconOnlyControls(page: Page): Promise<ControlInfo[]> {
  return page.evaluate((selector) => {
    function describe(el: Element): string {
      const id = el.id !== '' ? `#${el.id}` : ''
      const cls =
        el instanceof HTMLElement && el.className !== ''
          ? `.${String(el.className).trim().split(/\s+/).slice(0, 3).join('.')}`
          : ''
      return `${el.tagName.toLowerCase()}${id}${cls}`
    }

    function clip(el: Element): string {
      const html = el.outerHTML.replace(/\s+/g, ' ').trim()
      return html.length > 200 ? `${html.slice(0, 199)}…` : html
    }

    /** Subtree text, minus anything hidden from assistive technology. */
    function visibleText(el: Element): string {
      const clone = el.cloneNode(true) as Element
      for (const hidden of Array.from(
        clone.querySelectorAll('[aria-hidden="true"],[hidden],svg,img,style,script'),
      )) {
        hidden.remove()
      }
      return (clone.textContent ?? '').replace(/\s+/g, ' ').trim()
    }

    function accessibleName(el: Element): string {
      const labelledBy = el.getAttribute('aria-labelledby')
      if (labelledBy !== null && labelledBy.trim() !== '') {
        const text = labelledBy
          .trim()
          .split(/\s+/)
          .map((id) => document.getElementById(id)?.textContent ?? '')
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim()
        if (text !== '') return text
      }

      const label = el.getAttribute('aria-label')
      if (label !== null && label.trim() !== '') return label.trim()

      if (el instanceof HTMLInputElement) {
        if (el.type === 'button' || el.type === 'submit' || el.type === 'reset') {
          if (el.value.trim() !== '') return el.value.trim()
        }
        if (el.type === 'image' && el.alt.trim() !== '') return el.alt.trim()
      }

      if (
        el instanceof HTMLInputElement ||
        el instanceof HTMLSelectElement ||
        el instanceof HTMLTextAreaElement
      ) {
        for (const l of Array.from(el.labels ?? [])) {
          const text = (l.textContent ?? '').replace(/\s+/g, ' ').trim()
          if (text !== '') return text
        }
      }

      const own = visibleText(el)
      if (own !== '') return own

      const alt = Array.from(el.querySelectorAll('img[alt]'))
        .map((img) => img.getAttribute('alt') ?? '')
        .join(' ')
        .trim()
      if (alt !== '') return alt

      const svgTitle = Array.from(el.querySelectorAll('svg > title'))
        .map((node) => node.textContent ?? '')
        .join(' ')
        .trim()
      if (svgTitle !== '') return svgTitle

      const title = el.getAttribute('title')
      if (title !== null && title.trim() !== '') return title.trim()

      return ''
    }

    const out: { selector: string; tag: string; html: string; name: string }[] = []

    for (const el of Array.from(document.querySelectorAll(selector))) {
      if (el.closest('[aria-hidden="true"]') !== null) continue
      if (el.closest('[hidden]') !== null) continue
      if (el.hasAttribute('disabled')) continue

      const tabindex = el.getAttribute('tabindex')
      const hasRole = el.hasAttribute('role')
      const nativelyInteractive = /^(a|button|input|select|textarea|summary)$/i.test(el.tagName)
      if (!nativelyInteractive && !hasRole && tabindex === '-1') continue

      if (el instanceof HTMLInputElement && el.type === 'hidden') continue

      const rect = el.getBoundingClientRect()
      if (rect.width === 0 && rect.height === 0) continue

      // Icon-only means: nothing but a graphic inside.
      const hasGraphic = el.querySelector('svg,img') !== null
      if (!hasGraphic) continue
      if (visibleText(el) !== '') continue

      out.push({
        selector: describe(el),
        tag: el.tagName.toLowerCase(),
        html: clip(el),
        name: accessibleName(el),
      })
    }

    return out
  }, INTERACTIVE_SELECTOR)
}

/* --------------------------------------------------------------------------
   Tap targets
   -------------------------------------------------------------------------- */

/**
 * Every visible interactive element with its rendered box.
 *
 * Two judgement calls, both recorded on the result rather than applied
 * silently:
 *
 *  - **The inline exception.** A link inside a paragraph is marked
 *    `inline: true` and reported separately instead of failing, because both
 *    SC 2.5.5 and SC 2.5.8 exempt it and there is no way to satisfy 44px in a
 *    line box without breaking the paragraph.
 *  - **The measured box is the border box.** Hit areas enlarged by an
 *    absolutely positioned `::before` are invisible to this probe and would be
 *    reported as failures. None of the components in `src/styles` use that
 *    trick, so a finding here is a real finding — but that is the one false
 *    positive to check for before filing a bug.
 */
export async function collectTapTargets(page: Page): Promise<TapTarget[]> {
  return page.evaluate((selector) => {
    function describe(el: Element): string {
      const id = el.id !== '' ? `#${el.id}` : ''
      const cls =
        el instanceof HTMLElement && el.className !== ''
          ? `.${String(el.className).trim().split(/\s+/).slice(0, 3).join('.')}`
          : ''
      return `${el.tagName.toLowerCase()}${id}${cls}`
    }

    function clip(el: Element): string {
      const html = el.outerHTML.replace(/\s+/g, ' ').trim()
      return html.length > 160 ? `${html.slice(0, 159)}…` : html
    }

    function visibleText(el: Element): string {
      const clone = el.cloneNode(true) as Element
      for (const hidden of Array.from(
        clone.querySelectorAll('[aria-hidden="true"],[hidden],svg,img,style,script'),
      )) {
        hidden.remove()
      }
      return (clone.textContent ?? '').replace(/\s+/g, ' ').trim()
    }

    /** Does the element sit inside running text, rather than on its own? */
    function isInlineInProse(el: Element): boolean {
      const display = getComputedStyle(el).display
      if (display !== 'inline') return false

      const parent = el.parentElement
      if (parent === null) return false

      // Any non-whitespace text directly beside it in the same block means it
      // is part of a sentence.
      for (const node of Array.from(parent.childNodes)) {
        if (node === el) continue
        if (node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim() !== '') return true
      }
      return false
    }

    const out: {
      selector: string
      tag: string
      html: string
      name: string
      width: number
      height: number
      inline: boolean
      href: string | null
    }[] = []

    for (const el of Array.from(document.querySelectorAll(selector))) {
      if (el.closest('[aria-hidden="true"]') !== null) continue
      if (el.closest('[hidden]') !== null) continue
      if (el.hasAttribute('disabled')) continue
      if (el.getAttribute('aria-disabled') === 'true') continue

      if (el instanceof HTMLInputElement && el.type === 'hidden') continue

      const tabindex = el.getAttribute('tabindex')
      const hasRole = el.hasAttribute('role')
      const nativelyInteractive = /^(a|button|input|select|textarea|summary)$/i.test(el.tagName)
      if (!nativelyInteractive && !hasRole && tabindex === '-1') continue
      // A `tabindex="-1"` on a native control is a programmatic focus target,
      // not a pointer target — the roving-tabindex pattern relies on it.
      if (nativelyInteractive && tabindex === '-1' && !hasRole) continue

      const style = getComputedStyle(el)
      if (style.display === 'none' || style.visibility === 'hidden') continue
      if (style.pointerEvents === 'none') continue
      if (Number.parseFloat(style.opacity) === 0) continue

      const rect = el.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) continue

      out.push({
        selector: describe(el),
        tag: el.tagName.toLowerCase(),
        html: clip(el),
        name: visibleText(el) || (el.getAttribute('aria-label') ?? ''),
        // Round to a tenth: subpixel layout should not decide a pass.
        width: Math.round(rect.width * 10) / 10,
        height: Math.round(rect.height * 10) / 10,
        inline: isInlineInProse(el),
        // `.href` rather than the attribute, so `/en/cart` and an absolute URL
        // to the same page compare equal.
        href: el instanceof HTMLAnchorElement ? el.href : null,
      })
    }

    return out
  }, INTERACTIVE_SELECTOR)
}

/* --------------------------------------------------------------------------
   Reporting
   -------------------------------------------------------------------------- */

export function formatControls(controls: readonly ControlInfo[]): string {
  return controls.map((c) => `    · ${c.selector}\n      ${c.html}`).join('\n')
}

export function formatTargets(targets: readonly TapTarget[]): string {
  return targets
    .map(
      (t) =>
        `    · ${t.width}x${t.height} — ${t.selector}` +
        `${t.name === '' ? '' : ` ("${t.name.slice(0, 40)}")`}\n      ${t.html}`,
    )
    .join('\n')
}
