/**
 * Lead capture — the pure rules (no database, no clock, no browser), so the
 * tests can pin them: when the offer may appear, and which channel a cart
 * reminder may use.
 *
 * The owner's brief: name + WhatsApp are collected only when the visitor
 * chooses to give them. Nothing is forced, the normal site flow is unchanged,
 * and nothing promotional goes to anyone who did not tick consent.
 */

export const OFFER_STORAGE_KEY = 'bt_lead_offer'
/** After a close, the offer stays away this long. */
export const OFFER_SNOOZE_DAYS = 14
const DAY_MS = 24 * 60 * 60 * 1000

/** Paths (without the locale prefix) where the offer never appears. */
const EXCLUDED_PREFIXES = [
  '/checkout',
  '/cart',
  '/account',
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/studio',
  '/my-trip',
  '/trip',
  '/privacy',
  '/terms',
  '/cookies',
]

/** `/ar/checkout/x` → `/checkout/x`. */
export function stripLocale(pathname: string): string {
  const match = /^\/(ar|en|id)(?=\/|$)/.exec(pathname)
  const rest = match ? pathname.slice(match[0].length) : pathname
  return rest === '' ? '/' : rest
}

export function isExcludedPath(pathname: string): boolean {
  const path = stripLocale(pathname)
  return EXCLUDED_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
}

/** What the browser remembers (one small JSON value). */
export interface OfferMemory {
  /** The offer was shown at least once (ms). */
  shownAt?: number
  /** The visitor closed it (ms). */
  closedAt?: number
  /** The visitor sent the form — never ask again. */
  doneAt?: number
}

export function parseOfferMemory(raw: string | null | undefined): OfferMemory {
  if (!raw) return {}
  try {
    const value = JSON.parse(raw) as unknown
    if (value === null || typeof value !== 'object') return {}
    const out: OfferMemory = {}
    for (const key of ['shownAt', 'closedAt', 'doneAt'] as const) {
      const n = (value as Record<string, unknown>)[key]
      if (typeof n === 'number' && Number.isFinite(n)) out[key] = n
    }
    return out
  } catch {
    return {}
  }
}

/**
 * Once per visitor: shown once, then never again unless it was closed and
 * the 14-day snooze has run out (and then once more). Sent = never again.
 */
export function mayShowOffer(memory: OfferMemory, now: number): boolean {
  if (memory.doneAt !== undefined) return false
  if (memory.closedAt !== undefined) return now - memory.closedAt >= OFFER_SNOOZE_DAYS * DAY_MS
  return memory.shownAt === undefined
}

/** Desktop: after the delay or on exit intent. Phone: at half the page. */
export const MOBILE_SCROLL_RATIO = 0.5

export function reachedScrollTrigger(
  scrollY: number,
  viewport: number,
  docHeight: number,
): boolean {
  const scrollable = docHeight - viewport
  if (scrollable <= 0) return false
  return scrollY / scrollable >= MOBILE_SCROLL_RATIO
}

/* ---------------- Reminder consent gating ---------------- */

export interface ReminderContact {
  phone: string | null
  email: string | null
  whatsappConsent: boolean
  emailConsent: boolean
}

export type ReminderChannel = 'whatsapp' | 'email' | 'both' | 'none'

/** A channel is used only with its own consent and a usable address. */
export function reminderChannel(contact: ReminderContact): ReminderChannel {
  const wa =
    contact.whatsappConsent &&
    typeof contact.phone === 'string' &&
    /^\+\d{8,15}$/.test(contact.phone)
  const mail =
    contact.emailConsent &&
    typeof contact.email === 'string' &&
    contact.email.includes('@') &&
    !contact.email.endsWith('.invalid')
  if (wa && mail) return 'both'
  if (wa) return 'whatsapp'
  if (mail) return 'email'
  return 'none'
}

/** Coupon code: unambiguous characters only. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export function couponCodeFrom(random: Uint8Array): string {
  let out = ''
  for (let i = 0; i < 6; i += 1) out += CODE_ALPHABET[(random[i] ?? 0) % CODE_ALPHABET.length]
  return `BALI-${out}`
}
