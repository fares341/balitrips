/**
 * Shared frame of the translated policies centre (English, Indonesian): the
 * hero, the table of contents and the section header, with the same ids,
 * icons and class names as the Arabic original (policies-content.tsx), so the
 * anchors (`#terms`, `#cancellation`, …), the scroll-spy and the styles are
 * identical in every language. The wording lives in policies-content.<locale>.tsx.
 */

import type { ReactNode } from 'react'

import s from './policies.module.css'

/** Section ids, in the document's order. The anchors are public links. */
export const POLICY_IDS = [
  'terms',
  'booking',
  'cancellation',
  'digital',
  'payment',
  'fulfillment',
  'privacy',
  'cookies',
  'safety',
  'complaints',
] as const

export type PolicyId = (typeof POLICY_IDS)[number]

const ICONS: Record<PolicyId, string> = {
  terms: 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6',
  booking: 'M4 6h16v14H4zM4 10h16M9 3v5M15 3v5M9 15l2 2 4-4',
  cancellation: 'M4 12a8 8 0 1 0 2.3-5.6M4 4v4h4M9 12h6',
  digital: 'M12 3v12M7 10l5 5 5-5M5 21h14',
  payment: 'M3 6h18v12H3zM3 10h18M7 15h3',
  fulfillment: 'M5 13l4 4L19 7',
  privacy: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  cookies: 'M12 3a9 9 0 1 0 9 9 4 4 0 0 1-5-5 4 4 0 0 1-4-4zM8.5 12h.01M12 16h.01M15 13h.01',
  safety: 'M12 3l9 16H3zM12 10v4M12 17h.01',
  complaints: 'M4 5h16v11H8l-4 4z',
}

function PolicyIcon({ id }: { id: PolicyId }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={ICONS[id]} />
    </svg>
  )
}

export function PolicyHero({
  eyebrow,
  title,
  lede,
  updated,
}: {
  eyebrow: string
  title: string
  lede: string
  updated: string
}) {
  return (
    <div className={s['hero']}>
      <div className={s['in']}>
        <span className={s['eyebrow']}>{eyebrow}</span>
        <h1>{title}</h1>
        <p>{lede}</p>
        <div className={s['meta']}>{updated}</div>
      </div>
    </div>
  )
}

/** Table of contents + the sections column. */
export function PolicyBody({
  tocTitle,
  titles,
  children,
}: {
  tocTitle: string
  titles: Record<PolicyId, string>
  children: ReactNode
}) {
  return (
    <div className={s['wrap']}>
      <nav className={s['toc']} data-toc aria-label={tocTitle}>
        <h2>{tocTitle}</h2>
        {POLICY_IDS.map((id) => (
          <a key={id} href={`#${id}`}>
            <PolicyIcon id={id} />
            <span>{titles[id]}</span>
          </a>
        ))}
      </nav>
      <div className={s['content']}>{children}</div>
    </div>
  )
}

export function PolicySection({
  id,
  title,
  backToTop,
  children,
}: {
  id: PolicyId
  title: string
  backToTop: string
  children: ReactNode
}) {
  return (
    <section id={id}>
      <div className={s['sec-h']}>
        <div className={s['ic']}>
          <PolicyIcon id={id} />
        </div>
        <h2>{title}</h2>
      </div>
      {children}
      <a className={s['totop']} href="#top">
        ↑ {backToTop}
      </a>
    </section>
  )
}

export function PolicyTable({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className={s['tbl']}>
      <table>
        <thead>
          <tr>
            {head.map((cell) => (
              <th key={cell}>{cell}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {row.map((cell, at) => (
                <td key={at}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function PolicyCta({ children }: { children: ReactNode }) {
  return <div className={s['cta']}>{children}</div>
}

export const cookieButtonClass = s['cookieBtn']
