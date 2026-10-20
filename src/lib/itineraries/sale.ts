/**
 * How an itinerary is sold, and what it gives on the map (phase 3) — pure.
 *
 * Four sale modes, each switched on in Studio; customers only ever see the
 * enabled ones:
 *  - `digital`     A: the plan on its own (PDF + pages);
 *  - `activities`  B: the plan plus the day activities marked bookable, added
 *                  to the trip with dates counted from the trip's start date;
 *  - `packages`    C: inside one of the linked packages;
 *  - `custom`      D: a custom trip request, prefilled from this plan.
 *
 * Map access is one of four rules. The map has only Free and VIP:
 *  - `free_only`    the plan opens nothing on the map;
 *  - `vip_included` buying it opens VIP (the pre-phase-3 `includesMap` rule —
 *                   `includesMap` / `isVip` still decide the exact access);
 *  - `vip_addon`    VIP is offered as a separate, optional line at purchase
 *                   (a `plan` cart line — priced, granted and refunded as any
 *                   plan);
 *  - `vip_later`    nothing at purchase; My Trip offers the upgrade.
 * VIP is never granted without one of these explicit rules.
 */

export const SALE_MODES = ['digital', 'activities', 'packages', 'custom'] as const
export type SaleMode = (typeof SALE_MODES)[number]

export const MAP_ACCESS = ['free_only', 'vip_included', 'vip_addon', 'vip_later'] as const
export type MapAccess = (typeof MAP_ACCESS)[number]

export const PACKAGE_PRICE_RULES = ['included', 'extra', 'deducted_on_upgrade'] as const
export type PackagePriceRule = (typeof PACKAGE_PRICE_RULES)[number]

export function isMapAccess(value: unknown): value is MapAccess {
  return typeof value === 'string' && (MAP_ACCESS as readonly string[]).includes(value)
}

export function isPackagePriceRule(value: unknown): value is PackagePriceRule {
  return typeof value === 'string' && (PACKAGE_PRICE_RULES as readonly string[]).includes(value)
}

/**
 * The stored rule, read safely. An unknown value (a hand edit, a rolled-back
 * deploy) falls back to what the legacy flag says rather than to VIP: access
 * is only ever given by a rule that was clearly chosen.
 */
export function mapAccessOf(row: { mapAccess?: string | null; includesMap?: boolean }): MapAccess {
  if (isMapAccess(row.mapAccess)) return row.mapAccess
  return row.includesMap === true ? 'vip_included' : 'free_only'
}

/** The legacy flags kept in step with the rule when Studio saves it. */
export function legacyFlagsFor(access: MapAccess): { includesMap: boolean; isVip: boolean } {
  return access === 'vip_included'
    ? { includesMap: true, isVip: true }
    : { includesMap: false, isVip: false }
}

export interface SaleFlags {
  saleDigital: boolean
  saleWithActivities: boolean
  saleWithPackages: boolean
  saleCustomRequest: boolean
}

export interface SaleContext {
  /** Day activities ticked "bookable" that are still on sale. */
  bookableActivities: number
  /** Linked packages that are published. */
  livePackages: number
  /** The custom trip request form is available. */
  customAvailable?: boolean
}

/**
 * The modes a customer is shown, in display order. A mode is shown only when
 * Studio switched it on AND it has something to sell — "add the activities"
 * with no bookable activity, or "inside a package" with no live package,
 * would be a button that leads nowhere.
 *
 * Nothing on: the plan is still sold digitally — an itinerary that cannot be
 * bought at all is a configuration mistake, not a choice, and hiding the only
 * buy button would silently stop sales.
 */
export function visibleSaleModes(flags: SaleFlags, context: SaleContext): SaleMode[] {
  const out: SaleMode[] = []
  if (flags.saleDigital) out.push('digital')
  if (flags.saleWithActivities && context.bookableActivities > 0) out.push('activities')
  if (flags.saleWithPackages && context.livePackages > 0) out.push('packages')
  if (flags.saleCustomRequest && context.customAvailable !== false) out.push('custom')
  if (!out.includes('digital') && !out.includes('activities') && !out.includes('packages')) {
    // B sells the plan too; only when neither A, B nor C is left does A come back.
    out.unshift('digital')
  }
  return out
}

/** Can the plan itself be added to the trip from its page? (A and B sell it.) */
export function sellsPlanDirectly(modes: readonly SaleMode[]): boolean {
  return modes.includes('digital') || modes.includes('activities')
}

const PLAIN_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * The calendar date of day `dayNumber` (1 = the start date) of a trip, or
 * null for a malformed start. Pure date arithmetic in UTC, so the server's
 * zone cannot shift it.
 */
export function dateOfTripDay(start: string, dayNumber: number): string | null {
  const match = PLAIN_DATE.exec(start)
  if (!match || !Number.isInteger(dayNumber) || dayNumber < 1) return null
  const base = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  // 2026-02-31 rolls over in Date.UTC; refuse it rather than move the trip.
  if (Number.isNaN(base) || new Date(base).toISOString().slice(0, 10) !== start) return null
  return new Date(base + (dayNumber - 1) * 86_400_000).toISOString().slice(0, 10)
}

/** `HH:MM`, 00:00–23:59, or null. */
export function normaliseVisitTime(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return null
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}
