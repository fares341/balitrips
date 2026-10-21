import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

import { describe, expect, it } from 'vitest'

import { ROLES } from '@/lib/auth/roles'

import { NAV_GROUPS } from '../_ui/nav'
import { canOpen, studioPathCapabilities } from './route-access'

const STUDIO = join(process.cwd(), 'src', 'app', '(admin)', 'studio')

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return walk(full)
    return name === 'page.tsx' || name === 'route.ts' ? [full] : []
  })
}

/** `studio/plans/[id]/page.tsx` → `/plans/sample`. */
function samplePath(file: string): string {
  const parts = relative(STUDIO, file).split(sep).slice(0, -1)
  return parts
    .map((part) => (part === '[report]' ? 'bookings' : part.startsWith('[') ? 'sample' : part))
    .map((part) => `/${part}`)
    .join('')
}

describe('Studio route table', () => {
  const files = walk(STUDIO)

  it('finds the Studio pages', () => {
    expect(files.length).toBeGreaterThan(60)
  })

  for (const file of files) {
    const path = samplePath(file)
    const first = readFileSync(file, 'utf8').match(/requireCapability\('([a-z.]+)'\)/)?.[1]
    it(`${path || '/'} matches the capability its code requires`, () => {
      const table = studioPathCapabilities(path)
      expect(table, `no entry for ${path}`).not.toBeNull()
      // /security has no capability gate of its own (it is the 2FA screen).
      if (first) expect(table).toContain(first)
    })
  }

  it('agrees with the sidebar', () => {
    for (const group of NAV_GROUPS) {
      for (const item of group.items) {
        expect(studioPathCapabilities(item.path), item.path).toEqual([item.capability])
      }
    }
  })

  it('hides plan editors from every role but the admin (VIP settings stay open to operations)', () => {
    for (const role of ROLES) {
      expect(canOpen(role, '/plans/abc')).toBe(role === 'admin')
    }
    expect(canOpen('operations_manager', '/plans/vip')).toBe(true)
    expect(canOpen('operations_manager', '/plans')).toBe(false)
    expect(canOpen('marketing_manager', '/plans')).toBe(true)
  })

  it('ignores the query string and fragment', () => {
    expect(canOpen('support_agent', '/orders?status=paid#x')).toBe(true)
    expect(canOpen('support_agent', '/reports?period=7d')).toBe(false)
    expect(canOpen('accountant', '/reports/financial?period=30d')).toBe(true)
    expect(canOpen('marketing_manager', '/reports/financial')).toBe(false)
  })

  it('shows an unknown path only to the admin', () => {
    expect(canOpen('admin', '/nowhere')).toBe(true)
    expect(canOpen('staff', '/nowhere')).toBe(false)
  })
})
