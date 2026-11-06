/**
 * Optional daily refresh of the SAR→X display rates from a free, key-less
 * feed (open.er-api.com, SAR base). OFF by default: it runs only when the
 * owner ticks «تحديث الأسعار يوميًا» in Studio → «العملة والصرف».
 *
 * Runs from the existing `system.monitor` worker job (every 15 minutes) and
 * does nothing until the stored table is a day old. Only codes already in the
 * table are updated — the feed never adds a currency — and a value that moved
 * more than 25% is skipped as suspicious. Every change is logged to
 * activity_log (`fx_rates_changed`, source `feed`). Never throws.
 */

import { eq, sql } from 'drizzle-orm'

import { db } from '@/db'
import { activityLog, siteSettings } from '@/db/schema'
import { readSetting } from '@/app/(admin)/_lib/settings'

import { BASE_CURRENCY, mergeFeedRates, rateChanges, resolveFx } from './fx'

const FEED_URL = `https://open.er-api.com/v6/latest/${BASE_CURRENCY}`
const DAY_MS = 24 * 60 * 60 * 1000

export async function refreshRatesIfDue(now = new Date()): Promise<string> {
  try {
    const setting = await readSetting('currencies')
    if (!setting.autoRefresh) return 'off'
    const last = setting.ratesUpdatedAt ? Date.parse(setting.ratesUpdatedAt) : 0
    if (Number.isFinite(last) && now.getTime() - last < DAY_MS) return 'fresh'

    const res = await fetch(FEED_URL, { signal: AbortSignal.timeout(5000), cache: 'no-store' })
    if (!res.ok) return `feed ${res.status}`
    const current = resolveFx(setting).rates
    const rates = mergeFeedRates(current, await res.json())
    if (rates === null) return 'bad payload'

    const changes = rateChanges(current, rates)
    const value = {
      ...setting,
      rates,
      ratesUpdatedAt: now.toISOString(),
      ratesSource: 'feed' as const,
    }
    await db.transaction(async (tx) => {
      await tx
        .update(siteSettings)
        .set({ value, updatedAt: sql`now()` })
        .where(eq(siteSettings.key, 'currencies'))
      if (changes.length > 0) {
        await tx
          .insert(activityLog)
          .values({ action: 'fx_rates_changed', details: { source: 'feed', changes } })
      }
    })
    return `updated ${changes.length}`
  } catch (error) {
    console.warn('[fx] refresh failed', error)
    return 'error'
  }
}
