/**
 * Where a customer is in their relationship with the business.
 *
 *   lead      — no paid order yet (an account, a trip request, a question)
 *   new       — first paid order in the last 30 days
 *   active    — has bought, most recently within a year
 *   repeat    — two or more paid orders, most recently within a year
 *   vip       — three or more paid orders, or a VIP map plan, within a year
 *   inactive  — bought before, but nothing for over a year
 *
 * Computed from the orders unless staff set a stage by hand
 * (`users.crm_stage`), which always wins.
 */

export const CRM_STAGES = ['lead', 'new', 'active', 'repeat', 'vip', 'inactive'] as const
export type CrmStage = (typeof CRM_STAGES)[number]

export function isCrmStage(value: unknown): value is CrmStage {
  return typeof value === 'string' && (CRM_STAGES as readonly string[]).includes(value)
}

export interface StageFacts {
  /** `users.crm_stage`, set by staff. */
  manual: string | null
  paidOrders: number
  firstPaidAt: Date | null
  lastPaidAt: Date | null
  hasVip: boolean
}

const DAY = 24 * 60 * 60 * 1000

export function computeStage(facts: StageFacts, now: Date = new Date()): CrmStage {
  if (isCrmStage(facts.manual)) return facts.manual
  if (facts.paidOrders <= 0 || facts.lastPaidAt === null) return 'lead'
  const sinceLast = now.getTime() - facts.lastPaidAt.getTime()
  if (sinceLast > 365 * DAY) return 'inactive'
  if (facts.paidOrders >= 3 || facts.hasVip) return 'vip'
  if (facts.paidOrders >= 2) return 'repeat'
  const sinceFirst = now.getTime() - (facts.firstPaidAt ?? facts.lastPaidAt).getTime()
  return sinceFirst <= 30 * DAY ? 'new' : 'active'
}

/** Tags are short labels: lower-case letters, digits and dashes (any script). */
export function normalizeTag(raw: string): string | null {
  const tag = raw
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^\p{L}\p{N}-]/gu, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
  return tag === '' ? null : tag
}
