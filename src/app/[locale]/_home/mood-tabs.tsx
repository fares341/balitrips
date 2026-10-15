'use client'

/**
 * "What are you in the mood for?" — category chips over server-rendered
 * panels of place cards (home.html `#fs-chips` / `#fs-grid`).
 *
 * Every panel is rendered on the server and kept in the HTML (inactive ones
 * `hidden`), so the cards are crawlable and switching a chip costs no
 * request. This component owns one piece of state: which category is shown.
 *
 * Also used by "Most requested" (service-type tabs with a count each); `id`
 * keeps the two sets of panel ids apart.
 */

import { useState, type ReactNode } from 'react'

import { Chip } from '@/components/bt/chip'

export type MoodTab = {
  /** Map category key. */
  key: string
  /** Already resolved for the active locale. */
  label: string
  /** Optional item count shown in the chip (LTR digits). */
  count?: number
}

export type MoodTabsProps = {
  tabs: readonly MoodTab[]
  panels: Record<string, ReactNode>
  /** Accessible name for the chip group. */
  label: string
  /** Prefix for the panel ids (default `fs`). */
  id?: string
  /** Extra class on the chip row. */
  className?: string
  /** Class of each panel (default `fs-panel`). */
  panelClassName?: string
}

export function MoodTabs({
  tabs,
  panels,
  label,
  id = 'fs',
  className = 'fs-chips',
  panelClassName = 'fs-panel',
}: MoodTabsProps) {
  const [selected, setSelected] = useState(tabs[0]?.key ?? '')

  return (
    <>
      <div className={`chips scroll ${className}`} role="group" aria-label={label}>
        {tabs.map((tab) => (
          <Chip
            key={tab.key}
            active={tab.key === selected}
            aria-controls={`${id}-panel-${tab.key}`}
            count={tab.count}
            onClick={() => setSelected(tab.key)}
          >
            {tab.label}
          </Chip>
        ))}
      </div>
      {tabs.map((tab) => (
        <div
          key={tab.key}
          id={`${id}-panel-${tab.key}`}
          className={panelClassName}
          hidden={tab.key !== selected}
        >
          {panels[tab.key]}
        </div>
      ))}
    </>
  )
}
