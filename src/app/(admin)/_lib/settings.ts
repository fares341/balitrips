import {
  MAX_DEVICE_LIMIT,
  NEW_DEVICE_POLICIES,
  PDF_DOWNLOAD_MODES,
  defaultDeviceLimit,
  newDevicePolicy,
} from '@/lib/security/config'
import { inArray } from 'drizzle-orm'
import { z } from 'zod'

import {
  EXAGGERATION_RANGE,
  SATELLITE_PROVIDERS,
  STORED_MAP_DEFAULTS,
  TILT_RANGE,
  type StoredMapSettings,
} from '@/app/[locale]/map/map-style'
import { db } from '@/db'
import { siteSettings } from '@/db/schema'
import { locales, type Locale } from '@/i18n/config'

/**
 * Site configuration: the typed layer over `site_settings`.
 *
 * The table stores `jsonb` under a key. The SHAPE of that jsonb is declared
 * here and nowhere else, so there is exactly one place that answers "what is
 * a valid fee schedule" — the admin form that writes it and any page that
 * reads it agree by construction.
 *
 * Three rules, all of them load-bearing:
 *
 *  1. **Every read parses.** `value` is jsonb: a hand-written `UPDATE`, a
 *     half-finished migration or a rolled-back deploy can all leave a shape
 *     that no longer matches. `safeParse` turns that into the documented
 *     default instead of a `TypeError` on a customer-facing page.
 *  2. **A missing row is not an error.** The defaults below are the shipped
 *     configuration; the table only records deviations from them. That means
 *     a fresh database boots working, and `--clear`ing the table is a safe
 *     way back to known-good.
 *  3. **Money stays in minor units.** Fees are basis points and integer minor
 *     units, never percentages as floats — `0.1 + 0.2` is exactly how a fee
 *     schedule starts disagreeing with an invoice.
 *
 * Reading is deliberately dependency-free of the admin session so the
 * customer-facing app can import it. Writing lives in
 * `studio/config/actions.ts`, which gates on `config.write` and audits.
 */

/* --------------------------------------------------------------------------
   Shapes
   -------------------------------------------------------------------------- */

const currencyCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, 'Use a 3-letter ISO 4217 code')

/**
 * A localized body, tolerant of locales that have not been translated yet.
 *
 * The shape is built from `locales` rather than written out, so adding a
 * fourth language is a one-line change in `i18n/config.ts` and not a hunt
 * through validation schemas. A Zod object needs a static shape, hence the
 * assertion — `locales` is `as const`, so the key set is exact.
 */
type LocaleShape = { [L in Locale]: z.ZodDefault<z.ZodString> }

const localizedText = z.object(
  Object.fromEntries(locales.map((locale) => [locale, z.string().default('')])) as LocaleShape,
)

export const currenciesSchema = z.object({
  /**
   * The currency catalog prices are authored in. Changing it does NOT convert
   * existing prices — every `price_minor` in the catalog keeps its own
   * `currency` column, which is why this is presentation policy and not a
   * silent re-denomination.
   */
  baseCurrency: currencyCode,
  /** Offered to the buyer at checkout. Must contain `defaultPresentment`. */
  presentmentCurrencies: z.array(currencyCode).min(1),
  defaultPresentment: currencyCode,
})

export const feesSchema = z.object({
  /**
   * Service fee, in basis points of the subtotal. 250 = 2.50%.
   *
   * Basis points rather than a percentage float: a percentage stored as
   * `2.5` invites `subtotal * 0.025` and a fractional minor unit, and the
   * rounding of that fraction is the difference between an invoice that
   * reconciles and one that does not.
   */
  serviceFeeBps: z.number().int().min(0).max(10_000),
  /** Flat per-order booking fee, integer minor units of `feeCurrency`. */
  bookingFeeMinor: z.number().int().min(0),
  /** Card/processing surcharge passed on to the buyer, in basis points. */
  paymentSurchargeBps: z.number().int().min(0).max(10_000),
  feeCurrency: currencyCode,
  /**
   * Phase 4: the fees above are only CHARGED when this is on. Off by default
   * (and for every row saved before it existed), so typing a number into a
   * fee field can never change a price until the owner also switches it on.
   */
  enabled: z.boolean().default(false),
  /** Tax added on top of the price (and fees), in basis points. Off by default. */
  taxEnabled: z.boolean().default(false),
  taxRateBps: z.number().int().min(0).max(10_000).default(0),
  /** What the tax line is called on checkout, receipt and invoice ("VAT", "PB1"…). */
  taxLabel: localizedText.default({ en: '', ar: '', id: '' }),
})

/**
 * Phase 4: who sells — printed on every invoice. Empty until the owner fills
 * it in (Studio → Configuration); an empty field is simply left off the PDF.
 */
export const sellerSchema = z.object({
  businessName: z.string().trim().max(160).default(''),
  address: z.string().trim().max(600).default(''),
  taxId: z.string().trim().max(80).default(''),
  email: z.string().trim().max(256).default(''),
  phone: z.string().trim().max(48).default(''),
})

export const contactSchema = z.object({
  /**
   * WhatsApp number in E.164 WITHOUT the leading `+` — that is the form
   * `wa.me/<number>` requires, and storing it any other way means every call
   * site has to remember to strip punctuation.
   */
  whatsappNumber: z.string().regex(/^[0-9]{6,15}$/, 'Digits only, 6–15 of them, no + or spaces'),
  /** How the same number is printed. Free-form so it can carry spacing. */
  whatsappDisplay: z.string().trim().min(1),
  supportEmail: z.email(),
})

export const policySchema = z.object({
  /**
   * Effective date, `YYYY-MM-DD`, authored by hand.
   *
   * Never derived from `updated_at`: a date that moves whenever anyone opens
   * the form would silently rewrite the effective date of terms a customer
   * has already accepted, and `orders.terms_version` pins exactly this value.
   */
  updated: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
  /** Plain text. Blank lines separate paragraphs; no HTML is rendered. */
  body: localizedText,
})

/**
 * إعدادات الأمان ومنع المشاركة. تُعدَّل من Studio → Protection (`security.write`)،
 * وليس من Configuration، لأن من يملك تعديل الأسعار ليس بالضرورة من يقرر الحظر.
 */
export const securitySchema = z.object({
  newDevicePolicy: z.enum(NEW_DEVICE_POLICIES),
  defaultDeviceLimit: z.number().int().min(1).max(MAX_DEVICE_LIMIT),
  pdfDownloads: z.enum(PDF_DOWNLOAD_MODES),
  /** 0 = بلا حد. يُعدّ من `activity_log` لكل (مستخدم، بند طلب). */
  maxDownloadsPerItem: z.number().int().min(0).max(1000),
  autoBan: z.boolean(),
})

/**
 * The public map's real (3D) view — Studio → Map. The shape and defaults live
 * with the map style (`map-style.ts`) so the page and the form cannot drift.
 *
 * Satellite keys are PUBLIC browser tokens (domain-restricted in the
 * provider's console); only the active one reaches a page. Rows saved before
 * the satellite fields existed (`{ imagery, … }`) parse to "no satellite".
 */
const browserToken = z
  .string()
  .trim()
  .max(600)
  .regex(/^[A-Za-z0-9._~+/=-]*$/, 'Letters, digits and . _ ~ + / = - only')

export const mapSchema = z.object({
  satellite: z.enum(SATELLITE_PROVIDERS).default('none'),
  esriKey: browserToken.default(''),
  mapboxToken: browserToken.default(''),
  licenceConfirmed: z.boolean().default(false),
  exaggeration: z.number().min(EXAGGERATION_RANGE.min).max(EXAGGERATION_RANGE.max),
  tiltOnEnter: z.number().int().min(TILT_RANGE.min).max(TILT_RANGE.max),
}) satisfies z.ZodType<StoredMapSettings, unknown>

/**
 * The AI assistants (Studio → Assistant → Settings, admin only).
 *
 * Model ids are OpenRouter ids (`vendor/model`). Empty means "use the server
 * default" (OPENROUTER_MODEL / OPENROUTER_FALLBACK_MODEL, else the shipped
 * ids in src/lib/assistant/config.ts). The API key is NOT here: it is a
 * secret and lives only in the server environment (OPENROUTER_API_KEY).
 */
const modelId = z
  .string()
  .trim()
  .max(100)
  .regex(
    /^$|^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:-]*$/i,
    'Use an OpenRouter id like vendor/model',
  )

export const assistantSchema = z.object({
  publicEnabled: z.boolean().default(true),
  studioEnabled: z.boolean().default(true),
  model: modelId.default(''),
  fallbackModel: modelId.default(''),
  /** Visitor messages per IP per day (UTC). */
  dailyMessagesPerIp: z.number().int().min(1).max(2000).default(40),
  /** All assistant spend per day, USD. 0 switches both assistants off. */
  dailyBudgetUsd: z.number().min(0).max(1000).default(5),
  /** First bubble in the public chat, per locale; empty = the built-in greeting. */
  welcome: localizedText,
})

export type AssistantSetting = z.infer<typeof assistantSchema>
export type SellerSetting = z.infer<typeof sellerSchema>

/**
 * VIP map access (phase 3, Studio → Plans → VIP settings).
 *
 * VIP is only ever granted by a paid line or by staff; these switches decide
 * where it is OFFERED. `upsellPlanId` empty = the cheapest published VIP plan.
 */
export const vipSchema = z.object({
  /** VIP plans can be bought on their own from /plans. */
  sellStandalone: z.boolean().default(true),
  /** Offer "add VIP" at checkout when the trip has an itinerary or activities. */
  checkoutUpsell: z.boolean().default(true),
  upsellPlanId: z
    .string()
    .trim()
    .regex(/^$|^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
    .default(''),
  /** Shown next to every VIP offer: what happens on a refund. */
  refundNote: localizedText,
})

export type VipSetting = z.infer<typeof vipSchema>

export type SecuritySetting = z.infer<typeof securitySchema>
export type CurrenciesSetting = z.infer<typeof currenciesSchema>
export type FeesSetting = z.infer<typeof feesSchema>
export type ContactSetting = z.infer<typeof contactSchema>
export type PolicySetting = z.infer<typeof policySchema>

/* --------------------------------------------------------------------------
   Registry
   -------------------------------------------------------------------------- */

export const POLICY_IDS = ['terms', 'privacy', 'refund', 'cookies'] as const
export type PolicyId = (typeof POLICY_IDS)[number]

export type SettingKey =
  | 'currencies'
  | 'fees'
  | 'contact'
  | 'security'
  | 'map'
  | 'assistant'
  | 'vip'
  | 'seller'
  | `policy.${PolicyId}`

export interface SettingsShape {
  currencies: CurrenciesSetting
  fees: FeesSetting
  contact: ContactSetting
  security: SecuritySetting
  map: StoredMapSettings
  assistant: AssistantSetting
  vip: VipSetting
  seller: SellerSetting
  'policy.terms': PolicySetting
  'policy.privacy': PolicySetting
  'policy.refund': PolicySetting
  'policy.cookies': PolicySetting
}

const emptyBody = (): Record<string, string> =>
  Object.fromEntries(locales.map((locale) => [locale, '']))

/** A policy body that admits it is a placeholder rather than inventing law. */
function placeholderPolicy(title: string): PolicySetting {
  return policySchema.parse({
    updated: '2026-08-07',
    body: {
      ...emptyBody(),
      en: [
        `${title} — pending legal review.`,
        '',
        'This wording has not been settled with counsel yet. It is deliberately not invented text: a policy a business cannot stand behind is worse than none, because it is what gets quoted back at it in a dispute.',
        '',
        'Replace this from Studio → Configuration. Set the effective date at the same time — orders pin the version that was in force when they were placed.',
      ].join('\n'),
    },
  })
}

/**
 * The shipped configuration.
 *
 * These are real, working values, not sentinels — the site must run correctly
 * against an empty `site_settings` table. The WhatsApp defaults match what
 * `/contact` and the footer fall back to today so switching them to this
 * source changes nothing until an operator edits it.
 */
export const SETTING_DEFAULTS: SettingsShape = {
  currencies: {
    baseCurrency: 'USD',
    presentmentCurrencies: ['USD', 'IDR', 'SAR', 'AED', 'EUR'],
    defaultPresentment: 'USD',
  },
  fees: {
    serviceFeeBps: 0,
    bookingFeeMinor: 0,
    paymentSurchargeBps: 0,
    feeCurrency: 'USD',
    enabled: false,
    taxEnabled: false,
    taxRateBps: 0,
    taxLabel: { en: '', ar: '', id: '' },
  },
  contact: {
    whatsappNumber: '966481565446',
    whatsappDisplay: '+966 4815 654 4666',
    supportEmail: 'hello@balitrips.test',
  },
  // من env عند التحميل حتى يبقى سلوك الدفعة الأولى ثابتاً إلى أن يُحفظ صف.
  security: {
    newDevicePolicy: newDevicePolicy(),
    defaultDeviceLimit: defaultDeviceLimit(),
    pdfDownloads: 'allow',
    maxDownloadsPerItem: 0,
    autoBan: true,
  },
  map: { ...STORED_MAP_DEFAULTS },
  assistant: {
    publicEnabled: true,
    studioEnabled: true,
    model: '',
    fallbackModel: '',
    dailyMessagesPerIp: 40,
    dailyBudgetUsd: 5,
    welcome: { en: '', ar: '', id: '' },
  },
  vip: {
    sellStandalone: true,
    checkoutUpsell: true,
    upsellPlanId: '',
    refundNote: { en: '', ar: '', id: '' },
  },
  seller: { businessName: '', address: '', taxId: '', email: '', phone: '' },
  'policy.terms': placeholderPolicy('Terms of service'),
  'policy.privacy': placeholderPolicy('Privacy policy'),
  'policy.refund': placeholderPolicy('Refund and cancellation policy'),
  'policy.cookies': placeholderPolicy('Cookie policy'),
}

const SCHEMAS: { [K in SettingKey]: z.ZodType<SettingsShape[K]> } = {
  currencies: currenciesSchema,
  fees: feesSchema,
  contact: contactSchema,
  security: securitySchema,
  map: mapSchema,
  assistant: assistantSchema,
  vip: vipSchema,
  seller: sellerSchema,
  'policy.terms': policySchema,
  'policy.privacy': policySchema,
  'policy.refund': policySchema,
  'policy.cookies': policySchema,
}

export const SETTING_KEYS = Object.keys(SCHEMAS) as SettingKey[]

/**
 * Validate a candidate value for one key.
 *
 * Exported so the write path and the read path cannot drift: the action calls
 * this before it stores anything, and `readSettings()` calls it again on the
 * way out.
 */
export function parseSetting<K extends SettingKey>(key: K, value: unknown): SettingsShape[K] {
  return SCHEMAS[key].parse(value)
}

/* --------------------------------------------------------------------------
   Reads
   -------------------------------------------------------------------------- */

export interface SettingsSnapshot {
  values: SettingsShape
  /** Keys whose stored row failed validation and fell back to the default. */
  invalid: SettingKey[]
  /** Keys with no row at all — i.e. still on the shipped default. */
  missing: SettingKey[]
}

/**
 * Read every setting, with defaults filled in.
 *
 * One query for all keys rather than one per key: this is called from page
 * render, and seven round trips to answer "what is the WhatsApp number" is
 * seven too many.
 */
export async function readSettings(): Promise<SettingsSnapshot> {
  const rows = await db
    .select({ key: siteSettings.key, value: siteSettings.value })
    .from(siteSettings)
    .where(inArray(siteSettings.key, SETTING_KEYS))

  const stored = new Map(rows.map((row) => [row.key, row.value]))

  const values = { ...SETTING_DEFAULTS }
  const invalid: SettingKey[] = []
  const missing: SettingKey[] = []

  for (const key of SETTING_KEYS) {
    if (!stored.has(key)) {
      missing.push(key)
      continue
    }

    const parsed = SCHEMAS[key].safeParse(stored.get(key))
    if (parsed.success) {
      // The index signature is keyed by the union, so the assignment needs
      // the per-key narrowing that a `for` loop over a union cannot express.
      Object.assign(values, { [key]: parsed.data })
    } else {
      console.warn(`[settings] ${key} is stored malformed; using the default. ${parsed.error}`)
      invalid.push(key)
    }
  }

  return { values, invalid, missing }
}

/** One setting, parsed, with its default as the fallback. Never throws. */
export async function readSetting<K extends SettingKey>(key: K): Promise<SettingsShape[K]> {
  const [row] = await db
    .select({ value: siteSettings.value })
    .from(siteSettings)
    .where(inArray(siteSettings.key, [key]))
    .limit(1)

  if (!row) return SETTING_DEFAULTS[key]

  const parsed = SCHEMAS[key].safeParse(row.value)
  return parsed.success ? parsed.data : SETTING_DEFAULTS[key]
}
