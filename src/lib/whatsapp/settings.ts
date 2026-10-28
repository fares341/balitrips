/**
 * WhatsApp automation settings (Studio → WhatsApp).
 *
 * Non-secret settings live in `site_settings` under the key `whatsapp`; the
 * API key and the Mazbot staff password live encrypted in
 * `integration_secrets` (never echoed back, only their last four characters).
 * Environment variables win over both, so a server can pin its credentials:
 *   MAZBOT_API_URL, MAZBOT_API_KEY, MAZBOT_EMAIL, MAZBOT_PASSWORD.
 */

import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '@/db'
import { integrationSecrets, siteSettings } from '@/db/schema'
import { locales, type Locale } from '@/i18n/config'
import {
  decryptSecret,
  encryptSecret,
  integrationEncryptionKey,
} from '@/lib/analytics/secret-crypto'

import { AUTOMATION_KEYS, AUTOMATIONS, type AutomationKey } from './automations'

export const WHATSAPP_SETTINGS_KEY = 'whatsapp'
export const PROVIDERS = ['mazbot', 'meta'] as const
export type ProviderName = (typeof PROVIDERS)[number]

export const DEFAULT_MAZBOT_URL = 'https://mazbot.net/api'

const localeTexts = z.object(
  Object.fromEntries(locales.map((l) => [l, z.string().max(2000).default('')])) as {
    [L in Locale]: z.ZodDefault<z.ZodString>
  },
)

const automationSchema = z.object({
  enabled: z.boolean().default(false),
  /** Custom text per language; '' = use the default. */
  texts: localeTexts.default({ en: '', ar: '', id: '' }),
  /**
   * Approved template per language: a Mazbot `template_id` (number) or a Meta
   * template name. '' = send the text as a normal (session) message.
   */
  templates: localeTexts.default({ en: '', ar: '', id: '' }),
})
export type AutomationSetting = z.infer<typeof automationSchema>

export const whatsappSettingsSchema = z.object({
  /** Master switch: nothing automatic is sent while off. */
  enabled: z.boolean().default(false),
  provider: z.enum(PROVIDERS).default('mazbot'),
  apiUrl: z.string().trim().max(300).default(''),
  /** Mazbot staff login (the API needs a JWT besides the API key). */
  loginEmail: z.string().trim().max(200).default(''),
  senderNumber: z.string().trim().max(32).default(''),
  /**
   * «رقم تنبيهات الفريق» (owner, Oct 2026): a team WhatsApp number (with the
   * country code) that gets the booking alerts — a booking waiting for the
   * operator and the 24-hour / 4-day reminders. Sent through Mazbot as plain
   * text; empty = no WhatsApp alert (email still goes).
   */
  staffAlertNumber: z.string().trim().max(32).default(''),
  /** Minutes an order may stay unpaid before «payment incomplete». */
  incompleteAfterMinutes: z
    .number()
    .int()
    .min(15)
    .max(24 * 60)
    .default(60),
  automations: z.record(z.string(), automationSchema).default({}),
})
export type WhatsappSettings = z.infer<typeof whatsappSettingsSchema>

export function parseWhatsappSettings(raw: unknown): WhatsappSettings {
  const parsed = whatsappSettingsSchema.safeParse(raw ?? {})
  return parsed.success ? parsed.data : whatsappSettingsSchema.parse({})
}

export async function readWhatsappSettings(): Promise<WhatsappSettings> {
  const [row] = await db
    .select({ value: siteSettings.value })
    .from(siteSettings)
    .where(eq(siteSettings.key, WHATSAPP_SETTINGS_KEY))
    .limit(1)
  return parseWhatsappSettings(row?.value)
}

export async function writeWhatsappSettings(
  value: WhatsappSettings,
  actorId: string,
): Promise<void> {
  await db
    .insert(siteSettings)
    .values({ key: WHATSAPP_SETTINGS_KEY, value, updatedByActorId: actorId })
    .onConflictDoUpdate({
      target: siteSettings.key,
      set: { value, updatedByActorId: actorId, updatedAt: new Date() },
    })
}

export function automationSetting(s: WhatsappSettings, key: AutomationKey): AutomationSetting {
  return automationSchema.parse(s.automations[key] ?? {})
}

/** The text to send: the edited one, or the shipped default. */
export function automationText(s: WhatsappSettings, key: AutomationKey, locale: Locale): string {
  const custom = automationSetting(s, key).texts[locale].trim()
  return custom !== '' ? custom : AUTOMATIONS[key].defaults[locale]
}

export function automationTemplate(
  s: WhatsappSettings,
  key: AutomationKey,
  locale: Locale,
): string | null {
  const ref = automationSetting(s, key).templates[locale].trim()
  return ref === '' ? null : ref
}

export function isAutomationOn(s: WhatsappSettings, key: AutomationKey): boolean {
  return s.enabled && automationSetting(s, key).enabled
}

export { AUTOMATION_KEYS }

/* ---------------- Secrets ---------------- */

export const WA_SECRET_KEYS = ['whatsapp_api_key', 'whatsapp_password'] as const
export type WaSecretKey = (typeof WA_SECRET_KEYS)[number]

export async function readWaSecret(name: WaSecretKey): Promise<string | null> {
  const key = integrationEncryptionKey()
  if (key === null) return null
  const [row] = await db
    .select({ ciphertext: integrationSecrets.ciphertext })
    .from(integrationSecrets)
    .where(eq(integrationSecrets.key, name))
    .limit(1)
  return row ? decryptSecret(row.ciphertext, key) : null
}

export async function waSecretHint(name: WaSecretKey): Promise<string | null> {
  const [row] = await db
    .select({ hint: integrationSecrets.hint })
    .from(integrationSecrets)
    .where(eq(integrationSecrets.key, name))
    .limit(1)
  return row ? (row.hint ?? '••••') : null
}

export async function writeWaSecret(
  name: WaSecretKey,
  plain: string,
  actorId: string,
): Promise<void> {
  const key = integrationEncryptionKey()
  if (key === null) throw new Error('No encryption key is configured on the server')
  const value = plain.trim()
  const ciphertext = encryptSecret(value, key)
  const hint = value.slice(-4)
  await db
    .insert(integrationSecrets)
    .values({ key: name, ciphertext, hint, updatedByActorId: actorId })
    .onConflictDoUpdate({
      target: integrationSecrets.key,
      set: { ciphertext, hint, updatedByActorId: actorId, updatedAt: new Date() },
    })
}

export async function deleteWaSecret(name: WaSecretKey): Promise<void> {
  await db.delete(integrationSecrets).where(eq(integrationSecrets.key, name))
}

export interface ResolvedCredentials {
  provider: ProviderName
  apiUrl: string
  apiKey: string | null
  loginEmail: string | null
  password: string | null
  senderNumber: string | null
  /** Where each credential came from, for Studio. */
  fromEnv: { apiUrl: boolean; apiKey: boolean; loginEmail: boolean; password: boolean }
}

export async function resolveCredentials(s: WhatsappSettings): Promise<ResolvedCredentials> {
  const env = process.env
  const envUrl = env.MAZBOT_API_URL?.trim() || ''
  const envKey = env.MAZBOT_API_KEY?.trim() || ''
  const envEmail = env.MAZBOT_EMAIL?.trim() || ''
  const envPassword = env.MAZBOT_PASSWORD?.trim() || ''
  return {
    provider: s.provider,
    apiUrl: (envUrl || s.apiUrl || DEFAULT_MAZBOT_URL).replace(/\/+$/, ''),
    apiKey: envKey || (await readWaSecret('whatsapp_api_key')),
    loginEmail: envEmail || s.loginEmail || null,
    password: envPassword || (await readWaSecret('whatsapp_password')),
    senderNumber: s.senderNumber || null,
    fromEnv: {
      apiUrl: envUrl !== '',
      apiKey: envKey !== '',
      loginEmail: envEmail !== '',
      password: envPassword !== '',
    },
  }
}
