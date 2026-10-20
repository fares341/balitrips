/**
 * The consent cookie as a React external store (browser only).
 *
 * `useSyncExternalStore(subscribeConsent, consentSnapshot, () => null)`: the
 * server render sees "no choice" (null) — so nothing optional is ever in the
 * HTML — and the browser takes over with the real cookie after hydration.
 */

import {
  CONSENT_CHANGED_EVENT,
  CONSENT_COOKIE,
  CONSENT_MAX_AGE_SECONDS,
  readCookie,
  serializeConsent,
  type Consent,
} from '@/lib/analytics/consent'
import {
  ANON_COOKIE,
  FIRST_TOUCH_COOKIE,
  LAST_TOUCH_COOKIE,
  SESSION_COOKIE,
} from '@/lib/analytics/utm'

export function subscribeConsent(onChange: () => void): () => void {
  window.addEventListener(CONSENT_CHANGED_EVENT, onChange)
  return () => window.removeEventListener(CONSENT_CHANGED_EVENT, onChange)
}

export function consentSnapshot(): string | null {
  return readCookie(document.cookie, CONSENT_COOKIE)
}

export function setCookie(name: string, value: string, maxAgeSeconds: number): void {
  const secure = window.location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax${secure}`
}

export function deleteCookie(name: string): void {
  document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`
}

/**
 * Store a choice. Withdrawing a permission also deletes what it allowed
 * (visitor id, campaign cookies); third-party scripts already running in this
 * tab cannot be unloaded, so the page reloads without them.
 */
export function writeConsent(next: Omit<Consent, 'at'>, previous: Consent | null): void {
  setCookie(
    CONSENT_COOKIE,
    serializeConsent({ ...next, at: Math.floor(Date.now() / 1000) }),
    CONSENT_MAX_AGE_SECONDS,
  )
  if (!next.analytics) {
    for (const name of [ANON_COOKIE, SESSION_COOKIE, FIRST_TOUCH_COOKIE, LAST_TOUCH_COOKIE]) {
      deleteCookie(name)
    }
  }
  const withdrew =
    (previous?.analytics === true && !next.analytics) ||
    (previous?.marketing === true && !next.marketing)
  window.dispatchEvent(new Event(CONSENT_CHANGED_EVENT))
  if (withdrew) window.location.reload()
}
