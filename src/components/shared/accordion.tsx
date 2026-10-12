'use client'

/**
 * Accordion — one panel open at a time.
 *
 * Ported from `Accordion` in design/handoff/sections-bt/page-activities.jsx,
 * where it backs the FAQ on activity detail pages.
 *
 * The visual behaviour is unchanged: the open item's border turns
 * `var(--orange)` via `.bt-acc-item.on`, and its chevron rotates 180° via
 * `.bt-acc-item.on .bt-acc-q svg`. Both live in components.css.
 *
 * What the handoff did not have:
 *  - `aria-expanded` on the trigger, so nothing announced open or closed;
 *  - `aria-controls` / `role="region"` linking trigger to panel;
 *  - a heading wrapper, so the FAQ never appeared in a screen reader's
 *    heading list;
 *  - a panel in the DOM at all when closed — it was conditionally rendered,
 *    which breaks the `aria-controls` reference and hides answer text from
 *    in-page search. It is rendered here and toggled with `hidden`.
 */

import { useId, useState } from 'react'
import type { ReactNode } from 'react'

import { Icon } from '@/components/ui'

export type AccordionItem = {
  /** Stable identity. Falls back to the index when omitted. */
  id?: string
  /** Already-translated question. */
  question: string
  /** Already-translated answer. Rich content is allowed. */
  answer: ReactNode
}

export type AccordionProps = {
  items: AccordionItem[]
  /**
   * Index open on first render. `-1` starts fully collapsed. Defaults to 0,
   * matching the handoff — an FAQ whose first answer is already visible reads
   * as content rather than as a row of closed boxes.
   */
  defaultOpen?: number
  /** Level for the wrapper heading. Pick what the page outline needs. */
  headingLevel?: 'h2' | 'h3' | 'h4'
  className?: string
}

export function Accordion({
  items,
  defaultOpen = 0,
  headingLevel: Heading = 'h3',
  className,
}: AccordionProps) {
  const [open, setOpen] = useState(defaultOpen)
  const baseId = useId()

  if (items.length === 0) return null

  return (
    <div className={['bt-accordion', className].filter(Boolean).join(' ')}>
      {items.map((item, index) => {
        const isOpen = index === open
        const key = item.id ?? String(index)
        const triggerId = `${baseId}-t-${key}`
        const panelId = `${baseId}-p-${key}`

        return (
          <div
            key={key}
            className={['bt-acc-item', isOpen ? 'on' : null].filter(Boolean).join(' ')}
          >
            {/* Heading exists for the outline only; base.css gives h2–h4 an
                800 weight and negative tracking, which the trigger must not
                inherit. */}
            <Heading style={{ margin: 0, font: 'inherit', letterSpacing: 'normal' }}>
              <button
                type="button"
                id={triggerId}
                className="bt-acc-q"
                aria-expanded={isOpen}
                aria-controls={panelId}
                // Clicking the open item collapses it, so the section can be
                // fully closed. One open at a time, never two.
                onClick={() => setOpen(isOpen ? -1 : index)}
              >
                <span>{item.question}</span>
                <Icon name="chevron" size={18} />
              </button>
            </Heading>

            <div
              id={panelId}
              role="region"
              aria-labelledby={triggerId}
              className="bt-acc-a"
              hidden={!isOpen}
            >
              {item.answer}
            </div>
          </div>
        )
      })}
    </div>
  )
}
