/**
 * StepCards — numbered feature cards (Bluuu-style, client reference video).
 *
 *   two-tone line illustration · bold title · 2-line description ·
 *   number (01, 02 …) in the top corner · the whole card opens its own page
 *
 * One card at a time is highlighted (number in brand colour + a line filling
 * along its top edge) by the StepCycle wrapper; with reduced motion the cards
 * simply sit still.
 *
 * Data-driven: pass any array of `StepCardItem`s (see `_home/plan-steps.ts`
 * for the home-page list). Numbers come from the array order, so they always
 * run 01, 02, 03 … without gaps.
 *
 * Mobile-first: a full-width row per card on phones, two columns from 600px,
 * four tiles from 1024px. Logical CSS only (bt.css "Step cards"), so RTL/LTR
 * mirror automatically.
 */

import { Link } from '@/i18n/routing'

import { StepArt, type StepArtName } from './step-art'
import { StepCycle } from './step-cycle'

export type StepCardItem = {
  /** Stable React key. */
  key: string
  art: StepArtName
  title: string
  /** Kept to two lines by CSS. */
  body: string
  /** Each card opens its own page. */
  href: string
  /** Small tag under the title, e.g. "قريبًا". Optional. */
  tag?: string
}

export function StepCards({ items, label }: { items: StepCardItem[]; label: string }) {
  if (items.length === 0) return null
  return (
    <StepCycle label={label}>
      {items.map((item, index) => (
        <li key={item.key}>
          <article className="stc">
            <span className="stc-num num" aria-hidden="true">
              {String(index + 1).padStart(2, '0')}
            </span>
            <span className="stc-art">
              <StepArt name={item.art} />
            </span>
            <div className="stc-copy">
              <h3 className="stc-t">
                <Link href={item.href} className="stc-link">
                  {item.title}
                </Link>
              </h3>
              <p className="stc-d">{item.body}</p>
              {item.tag ? <span className="stc-tag">{item.tag}</span> : null}
            </div>
          </article>
        </li>
      ))}
    </StepCycle>
  )
}
