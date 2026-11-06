import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '@/db'
import { siteSettings } from '@/db/schema'
import { locales, type Locale } from '@/i18n/config'

/**
 * Studio → «العملاء المحتملون» → settings. Off by default: the owner turns
 * the offer and the cart reminder on when ready.
 */
export const LEAD_SETTINGS_KEY = 'leads.capture'

const texts = z.object(
  Object.fromEntries(locales.map((l) => [l, z.string().max(160).default('')])) as {
    [L in Locale]: z.ZodDefault<z.ZodString>
  },
)

export const leadSettingsSchema = z.object({
  popupEnabled: z.boolean().default(false),
  /** Whole percent off the first booking. */
  discountPercent: z.number().int().min(1).max(50).default(10),
  /** Desktop delay before the offer (seconds). */
  delaySeconds: z.number().int().min(5).max(300).default(25),
  /** Days the generated code stays valid. */
  couponValidDays: z.number().int().min(1).max(365).default(30),
  /** Custom headline per language; '' = the default («خصم 10% على أول حجز»). */
  headline: texts.default({ ar: '', en: '', id: '' }),
  abandonedEnabled: z.boolean().default(false),
  abandonedDelayMinutes: z
    .number()
    .int()
    .min(30)
    .max(24 * 60)
    .default(60),
})
export type LeadSettings = z.infer<typeof leadSettingsSchema>

export function parseLeadSettings(raw: unknown): LeadSettings {
  const parsed = leadSettingsSchema.safeParse(raw ?? {})
  return parsed.success ? parsed.data : leadSettingsSchema.parse({})
}

export async function readLeadSettings(): Promise<LeadSettings> {
  const [row] = await db
    .select({ value: siteSettings.value })
    .from(siteSettings)
    .where(eq(siteSettings.key, LEAD_SETTINGS_KEY))
    .limit(1)
  return parseLeadSettings(row?.value)
}

export async function writeLeadSettings(value: LeadSettings, actorId: string): Promise<void> {
  await db
    .insert(siteSettings)
    .values({ key: LEAD_SETTINGS_KEY, value, updatedByActorId: actorId })
    .onConflictDoUpdate({
      target: siteSettings.key,
      set: { value, updatedByActorId: actorId, updatedAt: new Date() },
    })
}
