import { describe, expect, it } from 'vitest'

import {
  assignableRoles,
  canAssignRole,
  CAPABILITIES,
  capabilitiesOf,
  can,
  covers,
  isElevated,
  isRole,
  ROLES,
  STUDIO_ROLES,
  TEAM_ROLES,
  type Capability,
  type Role,
} from './roles'

/**
 * Phase 6: the capability matrix, written out in full. Changing a role's
 * access must change this table too — on purpose, in review.
 */
const MATRIX: Record<Exclude<Role, 'admin'>, readonly Capability[]> = {
  customer: [],
  staff: [
    'admin.access',
    'content.read',
    'content.write',
    'content.publish',
    'media.upload',
    'translations.write',
    'orders.read',
    'orders.fulfil',
    'payments.read',
    'capacity.write',
    'customers.read',
    'leads.read',
    'audit.read',
    'security.read',
    'crm.write',
    'bookings.confirm',
    'prices.write',
    'reports.read',
  ],
  operations_manager: [
    'admin.access',
    'orders.read',
    'orders.fulfil',
    'bookings.confirm',
    'payments.read',
    'capacity.write',
    'customers.read',
    'leads.read',
    'crm.write',
    'audit.read',
    'security.read',
    'prices.write',
    'vip.manage',
    'reports.read',
  ],
  booking_agent: [
    'admin.access',
    'orders.read',
    'orders.fulfil',
    'bookings.confirm',
    'capacity.write',
    'customers.read',
    'leads.read',
    'crm.write',
  ],
  support_agent: ['admin.access', 'orders.read', 'customers.read', 'leads.read', 'crm.write'],
  content_editor: [
    'admin.access',
    'content.read',
    'content.write',
    'content.publish',
    'media.upload',
    'translations.write',
  ],
  marketing_manager: [
    'admin.access',
    'content.read',
    'content.write',
    'content.publish',
    'media.upload',
    'translations.write',
    'leads.read',
    'customers.read',
    'discounts.write',
    'reports.read',
  ],
  accountant: [
    'admin.access',
    'orders.read',
    'payments.read',
    'finance.read',
    'suppliers.write',
    'customers.read',
    'audit.read',
    'reports.read',
  ],
  bookings_operator: [
    'admin.access',
    'orders.read',
    'orders.fulfil',
    'bookings.confirm',
    'leads.read',
  ],
  supplier_portal: [],
}

describe('capability matrix', () => {
  it('lists every role', () => {
    expect([...ROLES].sort()).toEqual([...Object.keys(MATRIX), 'admin'].sort())
    for (const role of ROLES) expect(isRole(role)).toBe(true)
    expect(isRole('operations-manager')).toBe(false)
  })

  it('matches the table exactly for every role and capability', () => {
    for (const [role, held] of Object.entries(MATRIX) as [Role, readonly Capability[]][]) {
      for (const capability of CAPABILITIES) {
        expect({ role, capability, granted: can(role, capability) }).toEqual({
          role,
          capability,
          granted: held.includes(capability),
        })
      }
    }
  })

  it('gives the admin (Super Admin) everything', () => {
    for (const capability of CAPABILITIES) expect(can('admin', capability)).toBe(true)
    expect(capabilitiesOf('admin').length).toBe(CAPABILITIES.length)
  })

  it('keeps the dangerous capabilities with the admin alone', () => {
    const adminOnly: Capability[] = [
      'roles.write',
      'users.manage',
      'config.write',
      'orders.refund',
      'entitlements.grant',
      'customers.export',
      'customers.merge',
      'security.write',
      'integrations.write',
      'system.read',
    ]
    for (const capability of adminOnly) {
      const holders = ROLES.filter((role) => can(role, capability))
      expect({ capability, holders }).toEqual({ capability, holders: ['admin'] })
    }
  })

  it('keeps prices away from the content editor and the support agent', () => {
    expect(can('content_editor', 'content.write')).toBe(true)
    expect(can('content_editor', 'prices.write')).toBe(false)
    expect(can('support_agent', 'orders.fulfil')).toBe(false)
    expect(can('booking_agent', 'finance.read')).toBe(false)
    expect(can('accountant', 'orders.refund')).toBe(false)
  })

  it('lets the bookings operator run bookings and nothing else', () => {
    for (const capability of [
      'orders.read',
      'orders.fulfil',
      'bookings.confirm',
      'leads.read',
    ] as const) {
      expect(can('bookings_operator', capability)).toBe(true)
    }
    for (const capability of [
      'content.read',
      'content.write',
      'content.publish',
      'media.upload',
      'translations.write',
      'prices.write',
      'config.write',
      'users.manage',
      'roles.write',
      'orders.refund',
      'payments.read',
      'finance.read',
      'suppliers.write',
      'discounts.write',
      'customers.read',
      'customers.export',
      'reports.read',
      'integrations.write',
      'system.read',
    ] as const) {
      expect({ capability, granted: can('bookings_operator', capability) }).toEqual({
        capability,
        granted: false,
      })
    }
    expect(isElevated('bookings_operator')).toBe(true)
    expect(covers('booking_agent', 'bookings_operator')).toBe(false)
    expect(covers('staff', 'bookings_operator')).toBe(true)
  })

  it('gives the supplier portal role no Studio access at all', () => {
    expect(capabilitiesOf('supplier_portal')).toEqual([])
    expect(isElevated('supplier_portal')).toBe(false)
    expect(STUDIO_ROLES).not.toContain('supplier_portal')
    expect(TEAM_ROLES).toContain('supplier_portal')
    expect(TEAM_ROLES).not.toContain('customer')
  })

  it('returns a copy, so callers cannot widen a role', () => {
    const list = capabilitiesOf('support_agent')
    list.push('orders.refund')
    expect(can('support_agent', 'orders.refund')).toBe(false)
  })
})

describe('no escalation', () => {
  it('only a role that manages users can assign roles (today: admin)', () => {
    for (const actor of ROLES) {
      for (const target of ROLES) {
        if (actor !== 'admin') expect(canAssignRole(actor, target)).toBe(false)
      }
    }
    expect(assignableRoles('admin')).toEqual([...ROLES])
    expect(assignableRoles('staff')).toEqual([])
    expect(assignableRoles('operations_manager')).toEqual([])
  })

  it('never lets a role hand out a role above its own', () => {
    for (const actor of ROLES) {
      for (const target of ROLES) {
        if (canAssignRole(actor, target)) expect(covers(actor, target)).toBe(true)
      }
    }
    // A role that does not cover admin can never grant admin.
    for (const actor of ROLES.filter((role) => role !== 'admin')) {
      expect(covers(actor, 'admin')).toBe(false)
      expect(canAssignRole(actor, 'admin')).toBe(false)
    }
  })

  it('compares roles by what they hold', () => {
    expect(covers('admin', 'staff')).toBe(true)
    expect(covers('staff', 'support_agent')).toBe(true)
    expect(covers('staff', 'content_editor')).toBe(true)
    expect(covers('support_agent', 'staff')).toBe(false)
    expect(covers('content_editor', 'marketing_manager')).toBe(false)
    for (const role of ROLES) expect(covers(role, 'customer')).toBe(true)
  })
})
