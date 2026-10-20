/**
 * Support tickets — the state machine and the timing rules, pure.
 *
 *   open ──staff reply──▶ pending_customer ──customer reply──▶ open
 *     │                        │
 *     └──────resolve───────────┴──▶ resolved ──rate / close──▶ closed
 *                                      │
 *                     customer reply ◀─┘ (reopens: back to open)
 *
 * A closed ticket stays closed: the customer opens a new one. Staff may
 * close from any state (spam, duplicate) and reopen a resolved one.
 */

export const TICKET_STATUSES = ['open', 'pending_customer', 'resolved', 'closed'] as const
export type TicketStatus = (typeof TICKET_STATUSES)[number]

export type TicketEvent =
  | 'staff_reply'
  | 'customer_reply'
  | 'internal_note'
  | 'resolve'
  | 'close'
  | 'reopen'
  | 'rate'

export function isTicketStatus(value: unknown): value is TicketStatus {
  return typeof value === 'string' && (TICKET_STATUSES as readonly string[]).includes(value)
}

/** The status after an event, or null when the event is not allowed in that status. */
export function nextTicketStatus(status: TicketStatus, event: TicketEvent): TicketStatus | null {
  switch (event) {
    case 'internal_note':
      // A note between staff changes nothing the customer sees.
      return status
    case 'staff_reply':
      if (status === 'closed') return null
      // Answering a resolved ticket keeps it resolved (a follow-up "you're welcome").
      return status === 'resolved' ? 'resolved' : 'pending_customer'
    case 'customer_reply':
      if (status === 'closed') return null
      return 'open'
    case 'resolve':
      return status === 'open' || status === 'pending_customer' ? 'resolved' : null
    case 'close':
      return status === 'closed' ? null : 'closed'
    case 'reopen':
      return status === 'resolved' || status === 'closed' ? 'open' : null
    case 'rate':
      return status === 'resolved' || status === 'closed' ? 'closed' : null
  }
}

/** Timestamps an event sets (only the first response is ever recorded once). */
export function ticketTimestamps(
  current: { firstResponseAt: Date | null },
  event: TicketEvent,
  next: TicketStatus,
  now: Date,
): {
  firstResponseAt?: Date
  resolvedAt?: Date | null
  closedAt?: Date | null
  lastCustomerMessageAt?: Date
} {
  const out: ReturnType<typeof ticketTimestamps> = {}
  if (event === 'staff_reply' && current.firstResponseAt === null) out.firstResponseAt = now
  if (event === 'customer_reply') out.lastCustomerMessageAt = now
  if (next === 'resolved' && event === 'resolve') out.resolvedAt = now
  if (next === 'closed') out.closedAt = now
  if (next === 'open' && (event === 'reopen' || event === 'customer_reply')) {
    out.resolvedAt = null
    out.closedAt = null
  }
  return out
}

/** Escalate: high or urgent, still open, no answer yet, waiting longer than `hours`. */
export function needsEscalation(
  ticket: {
    priority: string
    status: string
    firstResponseAt: Date | null
    escalatedAt: Date | null
    createdAt: Date
  },
  hours: number,
  now: Date,
): boolean {
  if (ticket.priority !== 'high' && ticket.priority !== 'urgent') return false
  if (ticket.status !== 'open') return false
  if (ticket.firstResponseAt !== null || ticket.escalatedAt !== null) return false
  return now.getTime() - ticket.createdAt.getTime() > hours * 60 * 60 * 1000
}

/** BT-T-000123 from a sequence value. */
export function formatTicketNumber(sequence: number): string {
  return `BT-T-${String(sequence).padStart(6, '0')}`
}

/** Average of durations in hours, one decimal; null when there is nothing to average. */
export function averageHours(pairs: readonly { from: Date; to: Date | null }[]): number | null {
  const spans = pairs
    .filter((pair): pair is { from: Date; to: Date } => pair.to !== null)
    .map((pair) => pair.to.getTime() - pair.from.getTime())
    .filter((ms) => ms >= 0)
  if (spans.length === 0) return null
  const mean = spans.reduce((sum, ms) => sum + ms, 0) / spans.length
  return Math.round((mean / 3_600_000) * 10) / 10
}
