import { describe, expect, it } from 'vitest'

import { messagesFor } from '../_i18n'
import { NAV_GROUPS } from '../_ui/nav'
import { HELP } from './registry'

describe('help registry titles', () => {
  it('a guide for a sidebar screen is titled exactly like its sidebar link (ar + en)', () => {
    const ar = messagesFor('ar')
    const en = messagesFor('en')
    const items = NAV_GROUPS.flatMap((group) => group.items)
    const mismatches: string[] = []
    for (const entry of HELP) {
      const item = items.find((candidate) => candidate.path === entry.href)
      if (!item) continue
      if (ar[item.labelKey] !== entry.title[0] || en[item.labelKey] !== entry.title[1]) {
        mismatches.push(`${entry.id}: ${entry.title[0]} ≠ ${ar[item.labelKey]}`)
      }
    }
    expect(mismatches).toEqual([])
  })

  it('has no placeholder guides left', () => {
    expect(HELP.filter((entry) => entry.placeholder).map((entry) => entry.id)).toEqual([])
  })
})
