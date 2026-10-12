/**
 * Shared shapes for the custom-trip questionnaire.
 *
 * Deliberately free of runtime imports from the data layer: this module is
 * pulled into the client bundle by `custom-trip-form.tsx`, and anything that
 * reached `@/db` from here would drag a Postgres driver into the browser.
 * Everything imported below is `import type`, which erases.
 */

import type { IconName } from '@/components/ui'
import type { VehicleClass } from '@/lib/booking-rules'
import type { ActivitySummary } from '@/lib/content/types'

// ---------------------------------------------------------------------------
// Questionnaire vocabulary
// ---------------------------------------------------------------------------

/**
 * أنواع الرحلة كما في الوثيقة (5.2): عائلية / شهر عسل / شباب / فاخرة / اقتصادية،
 * و"فردية" من التصميم الأصلي (طلبات قديمة تحملها).
 */
export const THEMES = [
  { key: 'family', labelKey: 'ct_type_family' },
  { key: 'honey', labelKey: 'ct_type_honey' },
  { key: 'youth', labelKey: 'ct_type_youth' },
  { key: 'luxury', labelKey: 'ct_type_luxury' },
  { key: 'budget', labelKey: 'ct_type_budget' },
  { key: 'solo', labelKey: 'ct_type_solo' },
] as const

export type ThemeKey = (typeof THEMES)[number]['key']

export const THEME_KEYS: readonly ThemeKey[] = THEMES.map((theme) => theme.key)

export function isThemeKey(value: string): value is ThemeKey {
  return (THEME_KEYS as readonly string[]).includes(value)
}

/** Budget slider bounds, in whole currency units. Matches the handoff. */
export const BUDGET_MIN = 200
export const BUDGET_MAX = 3000
export const BUDGET_STEP = 50
export const BUDGET_DEFAULT = 800

export const PAX_MIN = 1
export const PAX_MAX = 20
export const PAX_DEFAULT = 2

/** Longest note we will store. The column is `text`; this is a sanity bound. */
export const NOTES_MAX = 2000

/** منطقة يختارها المسافر (الوثيقة 5.2: المناطق المفضلة). */
export interface AreaOption {
  key: string
  /** Already resolved for the active locale. */
  label: string
}

/** Most areas a request may name — a hand-crafted post cannot store hundreds. */
export const AREAS_MAX = 12

/**
 * One interest toggle.
 *
 * `key` is a real `categories.key` — validated against the table on the
 * server, never a literal typed into a component. The handoff hard-coded six
 * keys next to six icons and looked the label up with
 * `(ACT_CATS.find(c => c.key === k) || {}).label?.[lang]`, so a key the
 * catalogue did not have — or a locale a translator had not filled in — put a
 * chip on screen with an icon and no text.
 */
export interface InterestOption {
  key: string
  /** Already resolved for the active locale. */
  label: string
  icon: IconName
}

// ---------------------------------------------------------------------------
// Server action contract
// ---------------------------------------------------------------------------

/** The answers, normalised — echoed back so the recommendations view can show them. */
export interface TripAnswers {
  startDate: string | null
  endDate: string | null
  /** Inclusive trip length, or null when the dates are incomplete. */
  days: number | null
  travellers: number
  theme: ThemeKey
  /** Per person, for the whole trip, in minor units of `currency`. */
  budgetPerPersonMinor: number
  currency: string
  interests: string[]
  wantsDriver: boolean
  /** Auto-assigned from the group size; null when no driver was requested. */
  vehicleClass: VehicleClass | null
  notes: string
}

/**
 * Who to send the proposal to.
 *
 * The handoff captured none of this. The questionnaire ended in a `setDone(true)`
 * and a WhatsApp deep link, so unless the traveller then opened WhatsApp *and*
 * pressed send, the business never learned that anyone had filled the form in
 * — eight answered questions and no lead.
 */
export interface ContactDetails {
  name: string
  email: string
  /** Optional: WhatsApp is the primary channel, email is the fallback. */
  phone: string | null
}

export const NAME_MAX = 128
export const EMAIL_MAX = 256
export const PHONE_MAX = 32

/** Fields the form can report an error against. */
export type CustomTripField = 'name' | 'email' | 'phone' | 'dates' | 'interests' | 'notes'

/**
 * Field → message key.
 *
 * Keys, never sentences: the server decides *what* is wrong, the client decides
 * what that sounds like in the reader's language.
 */
export type CustomTripErrors = Partial<Record<CustomTripField, string>>

export type CustomTripState =
  | { status: 'idle' }
  /**
   * `reason` is a discriminator, not copy. The client maps it to a translated
   * message; the server never invents user-facing English.
   */
  | { status: 'error'; reason: 'validation' | 'server'; fields?: CustomTripErrors }
  | {
      status: 'done'
      requestId: string
      answers: TripAnswers
      recommendations: ActivitySummary[]
    }

export type AddToTripResult =
  | { ok: true; itemCount: number }
  | { ok: false; reason: 'validation' | 'server' }
