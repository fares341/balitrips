/**
 * The traveller's step-1 details, kept for this browser tab.
 *
 * Checkout is left and re-entered all the time — Back to the trip, the
 * sign-in detour, a reload, a discount code — and each of those used to hand
 * back an empty form (audit M2). sessionStorage, so it ends with the tab and
 * never reaches another device.
 *
 * Contact fields only: name, e-mail, phone, its country and the note. There
 * is nothing else to keep — payment happens on the provider's page and card
 * data never touches this site. The terms tick is deliberately NOT kept:
 * consent is given on the page that is about to charge, every time.
 */

const KEY = 'bt-checkout-contact'

export type ContactDraft = {
  name: string
  email: string
  phone: string
  /** ISO country of the phone picker. */
  phoneCountry: string
  notes: string
}

const LIMITS: Record<keyof ContactDraft, number> = {
  name: 120,
  email: 200,
  phone: 32,
  phoneCountry: 2,
  notes: 500,
}

/**
 * The draft, or null when there is none, storage is blocked, or it was typed
 * under another account (a guest's draft follows them into their account;
 * one account's draft is never shown to the next person to sign in).
 */
export function readContactDraft(userId: string | null): Partial<ContactDraft> | null {
  let raw: string | null
  try {
    raw = window.sessionStorage.getItem(KEY)
  } catch {
    return null
  }
  if (raw === null) return null
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return null
  }
  if (data === null || typeof data !== 'object') return null
  const record = data as Record<string, unknown>
  if (typeof record.user === 'string' && record.user !== userId) return null
  const draft: Partial<ContactDraft> = {}
  for (const name of Object.keys(LIMITS) as (keyof ContactDraft)[]) {
    const value = record[name]
    if (typeof value === 'string' && value.length <= LIMITS[name]) draft[name] = value
  }
  return draft
}

export function writeContactDraft(draft: ContactDraft, userId: string | null): void {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify({ ...draft, user: userId }))
  } catch {
    // Storage blocked or full: the form still works, it just is not kept.
  }
}

/** After the order exists: nothing left to restore. */
export function clearContactDraft(): void {
  try {
    window.sessionStorage.removeItem(KEY)
  } catch {
    // Nothing to clear.
  }
}
