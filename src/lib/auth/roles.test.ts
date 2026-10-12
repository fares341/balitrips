import { describe, expect, it } from 'vitest'

import {
  assertCan,
  can,
  isElevated,
  isRole,
  requiresTwoFactor,
  ROLES,
  type Capability,
} from './roles'

describe('role parsing', () => {
  it('accepts only known roles', () => {
    expect(isRole('customer')).toBe(true)
    expect(isRole('admin')).toBe(true)
    // A junk value in the database column must not become a valid role.
    expect(isRole('superuser')).toBe(false)
    expect(isRole('')).toBe(false)
    expect(isRole('Admin')).toBe(false)
  })
})

describe('customers', () => {
  it('cannot reach the admin at all', () => {
    expect(can('customer', 'admin.access')).toBe(false)
    expect(isElevated('customer')).toBe(false)
  })

  it('holds no capability whatsoever', () => {
    const held = (
      [
        'content.read',
        'orders.read',
        'orders.refund',
        'roles.write',
        'config.write',
      ] as Capability[]
    ).filter((c) => can('customer', c))
    expect(held).toEqual([])
  })
})

describe('staff', () => {
  it('can run day-to-day operations', () => {
    expect(can('staff', 'admin.access')).toBe(true)
    expect(can('staff', 'content.write')).toBe(true)
    expect(can('staff', 'content.publish')).toBe(true)
    expect(can('staff', 'orders.read')).toBe(true)
    expect(can('staff', 'orders.fulfil')).toBe(true)
    expect(can('staff', 'capacity.write')).toBe(true)
  })

  it('cannot move money or change who has access', () => {
    // The separation that matters: editing an activity is recoverable,
    // issuing a refund or granting yourself admin is not.
    expect(can('staff', 'orders.refund')).toBe(false)
    expect(can('staff', 'entitlements.grant')).toBe(false)
    expect(can('staff', 'roles.write')).toBe(false)
    expect(can('staff', 'config.write')).toBe(false)
    expect(can('staff', 'customers.export')).toBe(false)
  })
})

describe('admin', () => {
  it('holds every capability', () => {
    expect(can('admin', 'orders.refund')).toBe(true)
    expect(can('admin', 'roles.write')).toBe(true)
    expect(can('admin', 'config.write')).toBe(true)
    expect(can('admin', 'entitlements.grant')).toBe(true)
  })
})

describe('two-factor', () => {
  it('is mandatory for anyone who can reach the admin', () => {
    expect(requiresTwoFactor('staff')).toBe(true)
    expect(requiresTwoFactor('admin')).toBe(true)
  })

  it('is not forced on customers', () => {
    expect(requiresTwoFactor('customer')).toBe(false)
  })

  it('tracks admin.access rather than being a separate list', () => {
    for (const role of ROLES) {
      expect(requiresTwoFactor(role)).toBe(can(role, 'admin.access'))
    }
  })
})

describe('assertCan', () => {
  it('passes silently when permitted', () => {
    expect(() => assertCan('admin', 'orders.refund')).not.toThrow()
  })

  it('throws when not permitted', () => {
    expect(() => assertCan('staff', 'orders.refund')).toThrow(/orders.refund/)
    expect(() => assertCan('customer', 'admin.access')).toThrow()
  })
})
