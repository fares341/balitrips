import { describe, expect, it } from 'vitest'

import {
  averageHours,
  formatTicketNumber,
  needsEscalation,
  nextTicketStatus,
  ticketTimestamps,
  TICKET_STATUSES,
} from './tickets'

const NOW = new Date('2026-10-20T10:00:00Z')

describe('ticket state machine', () => {
  it('follows replies back and forth', () => {
    expect(nextTicketStatus('open', 'staff_reply')).toBe('pending_customer')
    expect(nextTicketStatus('pending_customer', 'customer_reply')).toBe('open')
    expect(nextTicketStatus('open', 'internal_note')).toBe('open')
    expect(nextTicketStatus('pending_customer', 'internal_note')).toBe('pending_customer')
  })

  it('resolves, reopens on a customer reply, closes on a rating', () => {
    expect(nextTicketStatus('open', 'resolve')).toBe('resolved')
    expect(nextTicketStatus('pending_customer', 'resolve')).toBe('resolved')
    expect(nextTicketStatus('resolved', 'customer_reply')).toBe('open')
    expect(nextTicketStatus('resolved', 'staff_reply')).toBe('resolved')
    expect(nextTicketStatus('resolved', 'rate')).toBe('closed')
    expect(nextTicketStatus('open', 'rate')).toBeNull()
  })

  it('a closed ticket takes no replies and cannot be resolved again', () => {
    expect(nextTicketStatus('closed', 'customer_reply')).toBeNull()
    expect(nextTicketStatus('closed', 'staff_reply')).toBeNull()
    expect(nextTicketStatus('closed', 'resolve')).toBeNull()
    expect(nextTicketStatus('closed', 'close')).toBeNull()
    expect(nextTicketStatus('closed', 'reopen')).toBe('open')
  })

  it('every status can be closed by staff', () => {
    for (const status of TICKET_STATUSES) {
      if (status !== 'closed') expect(nextTicketStatus(status, 'close')).toBe('closed')
    }
  })

  it('records the first response once, and clears resolution on reopen', () => {
    expect(
      ticketTimestamps({ firstResponseAt: null }, 'staff_reply', 'pending_customer', NOW),
    ).toMatchObject({ firstResponseAt: NOW })
    expect(
      ticketTimestamps({ firstResponseAt: new Date(0) }, 'staff_reply', 'pending_customer', NOW)
        .firstResponseAt,
    ).toBeUndefined()
    expect(ticketTimestamps({ firstResponseAt: null }, 'resolve', 'resolved', NOW)).toMatchObject({
      resolvedAt: NOW,
    })
    expect(
      ticketTimestamps({ firstResponseAt: null }, 'customer_reply', 'open', NOW),
    ).toMatchObject({ resolvedAt: null, closedAt: null, lastCustomerMessageAt: NOW })
  })
})

describe('escalation and stats', () => {
  const ticket = {
    priority: 'high',
    status: 'open',
    firstResponseAt: null,
    escalatedAt: null,
    createdAt: new Date(NOW.getTime() - 5 * 3_600_000),
  }

  it('escalates high/urgent tickets unanswered for longer than N hours, once', () => {
    expect(needsEscalation(ticket, 4, NOW)).toBe(true)
    expect(needsEscalation(ticket, 6, NOW)).toBe(false)
    expect(needsEscalation({ ...ticket, priority: 'normal' }, 4, NOW)).toBe(false)
    expect(needsEscalation({ ...ticket, firstResponseAt: NOW }, 4, NOW)).toBe(false)
    expect(needsEscalation({ ...ticket, escalatedAt: NOW }, 4, NOW)).toBe(false)
    expect(needsEscalation({ ...ticket, status: 'pending_customer' }, 4, NOW)).toBe(false)
  })

  it('numbers and averages', () => {
    expect(formatTicketNumber(42)).toBe('BT-T-000042')
    expect(
      averageHours([
        { from: new Date(0), to: new Date(3_600_000) },
        { from: new Date(0), to: new Date(2 * 3_600_000) },
        { from: new Date(0), to: null },
      ]),
    ).toBe(1.5)
    expect(averageHours([])).toBeNull()
  })
})
