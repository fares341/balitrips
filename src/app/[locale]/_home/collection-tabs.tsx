'use client'

/**
 * Chip-filtered panel switcher.
 *
 * Drives two homepage sections that behave identically in the handoff: the
 * landmarks region filter (`HomeLandmarks`) and the "travelers love"
 * collections (`HomeLoved`).
 *
 * The panels are rendered on the *server* and handed in as props. That matters:
 * every card inside them is a Server Component reading from the content layer,
 * so switching a chip costs no request and pulls no query code into the browser
 * bundle. This component owns exactly one piece of state — which key is showing.
 *
 * Two fixes over the handoff:
 *
 *  1. **The chips report their state.** `className={active ? "active" : ""}`
 *     is a colour change and nothing else; a screen reader heard six identical
 *     unlabelled buttons. `Chip` sets `aria-pressed`, and each chip points at
 *     the panel it controls.
 *  2. **A filter that matches nothing says so.** The handoff rendered an empty
 *     grid, which reads as a broken page rather than an empty result.
 */

import { useState, type ReactNode } from 'react'

import { Chip } from '@/components/shared'
import { Icon, type IconName } from '@/components/ui'

export type CollectionTab = {
  /** Stable identity — a region key, a category key, or 'all'. */
  key: string
  /** Already resolved for the active locale by the server. */
  label: string
  icon?: IconName | null
}

export type CollectionTabsProps = {
  tabs: readonly CollectionTab[]
  /**
   * Server-rendered panel per tab key. A key with no entry renders `empty`,
   * so a category that lost its last published record degrades to a message.
   */
  panels: Record<string, ReactNode>
  /** Shown when the selected panel is missing or empty. Already translated. */
  empty: ReactNode
  /** Prefix for the generated panel ids; must be unique within the page. */
  idPrefix: string
}

export function CollectionTabs({ tabs, panels, empty, idPrefix }: CollectionTabsProps) {
  const [selected, setSelected] = useState(tabs[0]?.key ?? '')

  const panelId = `${idPrefix}-panel`
  const active = panels[selected]

  return (
    <>
      <div
        className="bt-filterchips"
        style={{ justifyContent: 'center', marginBottom: 28 }}
        role="group"
      >
        {tabs.map((tab) => (
          <Chip
            key={tab.key}
            active={tab.key === selected}
            aria-controls={panelId}
            onClick={() => setSelected(tab.key)}
          >
            {tab.icon != null && (
              <Icon
                name={tab.icon}
                size={15}
                color={tab.key === selected ? '#fff' : 'var(--forest)'}
              />
            )}
            {tab.label}
          </Chip>
        ))}
      </div>

      <div id={panelId}>{active ?? empty}</div>
    </>
  )
}
