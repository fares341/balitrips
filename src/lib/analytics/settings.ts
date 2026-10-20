import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '@/db'
import { siteSettings } from '@/db/schema'

/**
 * "Marketing & tracking" settings (Studio → التسويق والتتبع).
 *
 * Everything is OFF until an admin turns it on. Public ids only (a GA4
 * measurement id, a pixel id) — they are visible in any page source anyway.
 * The server-to-server tokens (Meta Conversions API, TikTok Events API) are
 * NOT here: they live encrypted in `integration_secrets` (./secrets) and never
 * reach a browser or an admin form.
 *
 * Stored under its own `site_settings` key and parsed on every read, so a
 * malformed row falls back to the defaults (everything off) rather than
 * breaking a page.
 */
export const MARKETING_SETTINGS_KEY = 'marketing'

const ga4Id = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^$|^G-[A-Z0-9]{4,20}$/, 'GA4 ids look like G-XXXXXXX')
const gtmId = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^$|^GTM-[A-Z0-9]{4,12}$/, 'GTM ids look like GTM-XXXXXX')
const numericId = z
  .string()
  .trim()
  .regex(/^$|^\d{6,20}$/, 'Pixel ids are numbers')
const tiktokId = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^$|^[A-Z0-9]{10,30}$/, 'TikTok pixel ids are letters and numbers')

export const marketingSchema = z.object({
  ga4Enabled: z.boolean().default(false),
  ga4Id: ga4Id.default(''),
  gtmEnabled: z.boolean().default(false),
  gtmId: gtmId.default(''),
  metaEnabled: z.boolean().default(false),
  metaPixelId: numericId.default(''),
  /** Also send purchases from the server (needs the token). */
  metaCapiEnabled: z.boolean().default(false),
  tiktokEnabled: z.boolean().default(false),
  tiktokPixelId: tiktokId.default(''),
  tiktokEventsApiEnabled: z.boolean().default(false),
  /** How long our own event rows are kept, in months. */
  retentionMonths: z.number().int().min(1).max(60).default(13),
  /** Abandoned checkout reminder (signed-in, marketing consent only). */
  abandonedEnabled: z.boolean().default(false),
  abandonedAfterHours: z.number().int().min(1).max(168).default(4),
})

export type MarketingSettings = z.infer<typeof marketingSchema>

export const MARKETING_DEFAULTS: MarketingSettings = marketingSchema.parse({})

export async function readMarketingSettings(): Promise<MarketingSettings> {
  try {
    const [row] = await db
      .select({ value: siteSettings.value })
      .from(siteSettings)
      .where(eq(siteSettings.key, MARKETING_SETTINGS_KEY))
      .limit(1)
    if (!row) return MARKETING_DEFAULTS
    const parsed = marketingSchema.safeParse(row.value)
    if (parsed.success) return parsed.data
    console.warn('[analytics] marketing settings are malformed; using defaults', parsed.error)
    return MARKETING_DEFAULTS
  } catch (error) {
    console.error('[analytics] could not read marketing settings', error)
    return MARKETING_DEFAULTS
  }
}

/** What a browser may know: the public ids of the tools that are on. */
export interface PublicTrackingConfig {
  ga4: string | null
  gtm: string | null
  meta: string | null
  tiktok: string | null
}

export function publicTrackingConfig(settings: MarketingSettings): PublicTrackingConfig {
  return {
    ga4: settings.ga4Enabled && settings.ga4Id ? settings.ga4Id : null,
    gtm: settings.gtmEnabled && settings.gtmId ? settings.gtmId : null,
    meta: settings.metaEnabled && settings.metaPixelId ? settings.metaPixelId : null,
    tiktok: settings.tiktokEnabled && settings.tiktokPixelId ? settings.tiktokPixelId : null,
  }
}
