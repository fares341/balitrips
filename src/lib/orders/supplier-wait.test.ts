import { describe, expect, it } from 'vitest'

import { AUTHORIZATION_DAYS } from './capture'
import {
  dueReminderStage,
  hoursLeft,
  isUrgent,
  releaseDeadline,
  timeLeftParts,
} from './supplier-wait'

const H = 60 * 60 * 1000
const at = new Date('2026-10-01T00:00:00Z')
const after = (hours: number) => new Date(at.getTime() + hours * H)

describe('supplier wait', () => {
  it('releases six days after the authorisation', () => {
    expect(AUTHORIZATION_DAYS).toBe(6)
    expect(releaseDeadline(at).toISOString()).toBe('2026-10-07T00:00:00.000Z')
  })

  it('counts the hours left, never below zero', () => {
    expect(hoursLeft(at, at)).toBe(144)
    expect(hoursLeft(at, after(1.5))).toBe(142)
    expect(hoursLeft(at, after(144))).toBe(0)
    expect(hoursLeft(at, after(200))).toBe(0)
  })

  it('splits days and hours', () => {
    expect(timeLeftParts(at, after(10))).toEqual({ days: 5, hours: 14 })
    expect(timeLeftParts(at, after(143.5))).toEqual({ days: 0, hours: 0 })
  })

  it('is urgent in the last day', () => {
    expect(isUrgent(at, after(119))).toBe(false)
    expect(isUrgent(at, after(121))).toBe(true)
  })

  it('reminds after 24 hours, then after 4 days, and not after the release', () => {
    expect(dueReminderStage(at, after(23))).toBeNull()
    expect(dueReminderStage(at, after(24))).toBe('24h')
    expect(dueReminderStage(at, after(95))).toBe('24h')
    expect(dueReminderStage(at, after(96))).toBe('4d')
    expect(dueReminderStage(at, after(143))).toBe('4d')
    expect(dueReminderStage(at, after(144))).toBeNull()
  })
})
