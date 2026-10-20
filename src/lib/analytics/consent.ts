/**
 * Cookie consent — what the visitor allowed.
 *
 * Three groups, shown in the banner and on /cookies:
 *
 *  - necessary  always on: sign-in, cart, language, this choice itself.
 *  - analytics  our own first-party statistics (visitor id, pages, clicks)
 *               and Google Analytics 4.
 *  - marketing  advertising tools: Google Tag Manager, Meta Pixel, TikTok
 *               Pixel and their server APIs, and campaign reminders.
 *
 * Stored in one cookie, `bt_consent=1.a<0|1>.m<0|1>.<unix seconds>`. Pure and
 * dependency-free: read by the browser (banner, script loader) and by the
 * server (collect endpoint, checkout) with the same function.
 *
 * No cookie = no choice yet = nothing optional runs. A malformed cookie is
 * treated the same way, so a bad value can never switch tracking ON.
 */

export const CONSENT_COOKIE = 'bt_consent'
/** Ask again after about a year (and whenever the version changes). */
export const CONSENT_MAX_AGE_SECONDS = 365 * 24 * 60 * 60
const VERSION = '1'

export interface Consent {
  analytics: boolean
  marketing: boolean
  /** When the choice was made (unix seconds). */
  at: number
}

export function serializeConsent(consent: Consent): string {
  return `${VERSION}.a${consent.analytics ? 1 : 0}.m${consent.marketing ? 1 : 0}.${Math.floor(consent.at)}`
}

/** The stored choice, or null when there is none (or it is unreadable). */
export function parseConsent(value: string | null | undefined): Consent | null {
  if (typeof value !== 'string') return null
  const match = /^1\.a([01])\.m([01])\.(\d{1,12})$/.exec(value.trim())
  if (!match) return null
  return { analytics: match[1] === '1', marketing: match[2] === '1', at: Number(match[3]) }
}

export function allowsAnalytics(consent: Consent | null): boolean {
  return consent?.analytics === true
}

export function allowsMarketing(consent: Consent | null): boolean {
  return consent?.marketing === true
}

/** Compact form stored on an order: '' | 'a' | 'm' | 'am'. */
export function consentCode(consent: Consent | null): string {
  return `${allowsAnalytics(consent) ? 'a' : ''}${allowsMarketing(consent) ? 'm' : ''}`
}

/** Read one cookie out of a `Cookie` header / `document.cookie` string. */
export function readCookie(header: string | null | undefined, name: string): string | null {
  if (!header) return null
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    if (part.slice(0, eq).trim() !== name) continue
    try {
      return decodeURIComponent(part.slice(eq + 1).trim())
    } catch {
      return null
    }
  }
  return null
}

/** Event the banner dispatches on `window` after a change. */
export const CONSENT_CHANGED_EVENT = 'bt:consent-changed'
/** Event that re-opens the banner (link on /cookies and in the footer). */
export const CONSENT_OPEN_EVENT = 'bt:consent-open'
