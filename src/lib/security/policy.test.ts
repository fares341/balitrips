import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/db', () => ({ db: {} }))

import { isBanActive, isUserBanned } from './bans'
import {
  decideNewDevice,
  defaultDeviceLimit,
  effectiveDeviceLimit,
  newDevicePolicy,
} from './devices'

describe('decideNewDevice', () => {
  it('allows while under the limit regardless of policy', () => {
    expect(decideNewDevice({ activeCount: 1, limit: 2, policy: 'block' })).toBe('allow')
  })
  it('applies the policy at the limit', () => {
    expect(decideNewDevice({ activeCount: 2, limit: 2, policy: 'block' })).toBe('block')
    expect(decideNewDevice({ activeCount: 2, limit: 2, policy: 'evict_oldest' })).toBe('evict')
    // الوثيقة 14.2: "أو يحتاج موافقة الإدارة".
    expect(decideNewDevice({ activeCount: 2, limit: 2, policy: 'require_approval' })).toBe(
      'approval',
    )
    expect(decideNewDevice({ activeCount: 1, limit: 2, policy: 'require_approval' })).toBe('allow')
    expect(decideNewDevice({ activeCount: 5, limit: 2, policy: 'warn' })).toBe('warn')
  })
})

describe('effectiveDeviceLimit', () => {
  it('takes the highest live grant, treating null as the default', () => {
    expect(effectiveDeviceLimit([], 2)).toBe(2)
    expect(effectiveDeviceLimit([null, 1], 2)).toBe(2)
    expect(effectiveDeviceLimit([3, null, 5], 2)).toBe(5)
  })
  it('is capped', () => {
    expect(effectiveDeviceLimit([10_000], 2)).toBe(50)
  })
})

describe('env configuration', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('defaults to block / 2 and ignores bad values', () => {
    expect(newDevicePolicy()).toBe('block')
    expect(defaultDeviceLimit()).toBe(2)
    vi.stubEnv('SECURITY_NEW_DEVICE_POLICY', 'yolo')
    vi.stubEnv('DEFAULT_DEVICE_LIMIT', '-3')
    expect(newDevicePolicy()).toBe('block')
    expect(defaultDeviceLimit()).toBe(2)
  })
  it('reads valid values', () => {
    vi.stubEnv('SECURITY_NEW_DEVICE_POLICY', 'evict_oldest')
    vi.stubEnv('DEFAULT_DEVICE_LIMIT', '3')
    expect(newDevicePolicy()).toBe('evict_oldest')
    expect(defaultDeviceLimit()).toBe(3)
  })
})

describe('bans', () => {
  const now = new Date('2026-10-12T10:00:00Z')

  it('treats null until as permanent and expired temporary bans as lifted', () => {
    expect(isBanActive(null, now)).toBe(true)
    expect(isBanActive(new Date('2026-10-12T11:00:00Z'), now)).toBe(true)
    expect(isBanActive('2026-10-12T09:00:00Z', now)).toBe(false)
  })
  it('fails closed on an unparseable date', () => {
    expect(isBanActive('garbage', now)).toBe(true)
  })
  it('only bans status=banned users', () => {
    expect(isUserBanned({ status: 'active', bannedUntil: null }, now)).toBe(false)
    expect(isUserBanned({ status: 'banned', bannedUntil: null }, now)).toBe(true)
    // حساب معطّل إدارياً لا يدخل حتى يُفعَّل.
    expect(isUserBanned({ status: 'inactive', bannedUntil: null }, now)).toBe(true)
    expect(isUserBanned({ status: 'banned', bannedUntil: '2026-10-01T00:00:00Z' }, now)).toBe(false)
    expect(isUserBanned(null, now)).toBe(false)
  })
})

describe('rules', async () => {
  vi.mock('@/app/(admin)/_lib/settings', () => ({ readSetting: vi.fn() }))
  const { RULES, TRIGGER_ACTIONS, breaches } = await import('./rules')

  it('fires at the threshold, not before', () => {
    expect(breaches({ threshold: 20 }, 19)).toBe(false)
    expect(breaches({ threshold: 20 }, 20)).toBe(true)
  })
  it('never auto-bans an account for failed sign-ins (lockout DoS)', () => {
    const rule = RULES.find((r) => r.id === 'failed_logins_account')
    expect(rule?.autoAction).toBeNull()
  })
  it('only ever auto-bans temporarily', () => {
    for (const rule of RULES) expect([null, 'ban_ip_1h', 'ban_user_24h']).toContain(rule.autoAction)
  })
  it('never auto-bans for sign-in attempts from devices over the limit', () => {
    const churn = RULES.find((r) => r.id === 'device_churn')
    expect(churn?.counts).toEqual(['new_device'])
    expect(churn?.measure).toBe('distinct_device')
    expect(RULES.find((r) => r.id === 'device_limit_hits')?.autoAction).toBeNull()
  })
  it('keeps the trigger list in activity.ts in sync with the rules', async () => {
    const { RULE_TRIGGERS } = await import('./activity')
    expect([...RULE_TRIGGERS].sort()).toEqual([...TRIGGER_ACTIONS].sort())
  })
})
