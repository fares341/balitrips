'use client'

/**
 * "What are you in the mood for?" — category chips over server-rendered
 * panels of place cards (home.html `#fs-chips` / `#fs-grid`).
 *
 * Every panel is rendered on the server and kept in the HTML (inactive ones
 * `hidden`), so the cards are crawlable and switching a chip costs no
 * request. This component owns one piece of state: which category is shown.
 */

import { useState, type ReactNode } from 'react'

import { Chip } from '@/components/bt/chip'

export type MoodTab = {
  /** Map category key. */
  key: string
  /** Already resolved for the active locale. */
  label: string
}

export type MoodTabsProps = {
  tabs: readonly MoodTab[]
  panels: Record<string, ReactNode>
  /** Accessible name for the chip group. */
  label: string
}

export function MoodTabs({ tabs, panels, label }: MoodTabsProps) {
  const [selected, setSelected] = useState(tabs[0]?.key ?? '')

  return (
    <>
      <div className="chips scroll fs-chips" role="group" aria-label={label}>
        {tabs.map((tab) => (
          <Chip
            key={tab.key}
            active={tab.key === selected}
            aria-controls={`fs-panel-${tab.key}`}
            onClick={() => setSelected(tab.key)}
          >
            {tab.label}
          </Chip>
        ))}
      </div>
      {tabs.map((tab) => (
        <div
          key={tab.key}
          id={`fs-panel-${tab.key}`}
          className="fs-panel"
          hidden={tab.key !== selected}
        >
          {panels[tab.key]}
        </div>
      ))}
    </>
  )
}
