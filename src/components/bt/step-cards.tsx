/**
 * StepCards — numbered feature cards (Bluuu-style).
 *
 *   big faint number (01, 02 …) in the corner · line icon · bold title ·
 *   2-line description · the whole card opens its own page
 *
 * Data-driven: pass any array of `StepCardItem`s (see `_home/plan-steps.ts`
 * for the home-page list). Adding a card = adding one entry there plus its
 * two message keys. Numbers come from the array order, so they always run
 * 01, 02, 03 … without gaps.
 *
 * Mobile-first: one column on phones, two from 600px, four from 1024px.
 * Logical CSS only (bt.css "Step cards"), so RTL/LTR mirror automatically.
 * No 'use client' — renders inside Server Components.
 */

import { Icon, type IconName } from '@/components/ui/icon'
import { Link } from '@/i18n/routing'

export type StepCardItem = {
  /** Stable React key. */
  key: string
  icon: IconName
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
    <ol className="stc-grid" aria-label={label}>
      {items.map((item, index) => (
        <li key={item.key}>
          <article className="stc">
            <span className="stc-num num" aria-hidden="true">
              {String(index + 1).padStart(2, '0')}
            </span>
            <span className="stc-ic" aria-hidden="true">
              <Icon name={item.icon} size={26} stroke={1.6} />
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
            <Icon name="arrow" size={18} className="stc-go flip" />
          </article>
        </li>
      ))}
    </ol>
  )
}
