'use server'

/**
 * «فعاليات جدولي» actions (itineraries phase 3). Every call re-checks access
 * on the server: only the itinerary's owner (or staff, quote only) gets an
 * answer. Prices and the «كل الفعاليات» discount come from the server quote;
 * the cart and checkout recompute both again (`@/lib/itineraries/bundle-server`).
 */

import { revalidatePath } from 'next/cache'

import { bookingsOpen } from '@/lib/bookings-open'
import { addActivityBooking } from '@/lib/cart'
import { isFeatureOn } from '@/lib/features'
import {
  cleanSelection,
  loadBuyerItinerary,
  quoteBuyerSelection,
  type BuyerQuote,
} from '@/lib/itineraries/buyer'
import { resolveBuyerViewer } from '@/lib/itineraries/buyer-access'
import { readDriverSettings } from '@/lib/itineraries/sales-settings-store'

const SLUG = /^[a-z0-9][a-z0-9-]{0,120}$/

export type BuyerActionError =
  'denied' | 'preview' | 'bookings_closed' | 'no_date' | 'empty' | 'unavailable'

async function context(slug: unknown) {
  if (typeof slug !== 'string' || !SLUG.test(slug)) return null
  const viewer = await resolveBuyerViewer(slug)
  if (viewer.access !== 'ok' || viewer.userId === null || viewer.itineraryId === null) return null
  const itinerary = await loadBuyerItinerary(viewer.itineraryId, viewer.userId)
  return itinerary === null ? null : { viewer, itinerary }
}

export async function quoteBuyerAction(
  slug: unknown,
  raw: unknown,
): Promise<{ ok: true; quote: BuyerQuote } | { ok: false; error: BuyerActionError }> {
  const ctx = await context(slug)
  if (ctx === null) return { ok: false, error: 'denied' }
  const selection = cleanSelection(raw, ctx.itinerary)
  return {
    ok: true,
    quote: await quoteBuyerSelection(ctx.itinerary, selection, ctx.viewer.userId!),
  }
}

export async function bookBuyerAction(
  slug: unknown,
  raw: unknown,
  mode: unknown,
): Promise<
  | { ok: true; added: number; quote: BuyerQuote }
  | { ok: false; error: BuyerActionError; failed?: string[] }
> {
  const ctx = await context(slug)
  if (ctx === null) return { ok: false, error: 'denied' }
  if (ctx.viewer.preview) return { ok: false, error: 'preview' }
  if (!bookingsOpen()) return { ok: false, error: 'bookings_closed' }

  const base = cleanSelection(raw, ctx.itinerary)
  // «احجز كل الفعاليات»: every linked activity, at the package/time picked on the page.
  const selection =
    mode === 'all'
      ? cleanSelection(
          {
            ...base,
            picks: ctx.itinerary.activities.map(
              (act) =>
                base.picks.find((pick) => pick.activityId === act.activityId) ?? {
                  activityId: act.activityId,
                  packageId: null,
                  time: null,
                },
            ),
          },
          ctx.itinerary,
        )
      : base
  if (selection.arrival === null) return { ok: false, error: 'no_date' }
  if (selection.picks.length === 0) return { ok: false, error: 'empty' }

  const quote = await quoteBuyerSelection(ctx.itinerary, selection, ctx.viewer.userId!)
  if (!quote.ok) {
    return {
      ok: false,
      error: 'unavailable',
      failed: quote.lines.filter((line) => line.issue !== null).map((line) => line.activityId),
    }
  }

  // The hidden driver: only when the feature is on AND Studio shows it here.
  const raw0 = (raw ?? {}) as { driver?: unknown }
  const driver =
    raw0.driver === true && isFeatureOn('driver') && (await readDriverSettings()).showOnBuyerPage

  const failed: string[] = []
  let added = 0
  for (const pick of selection.picks) {
    const line = quote.lines.find((one) => one.activityId === pick.activityId)
    if (!line?.date) continue
    const result = await addActivityBooking({
      activityId: pick.activityId,
      packageId: pick.packageId,
      date: line.date,
      time: pick.time,
      people: selection.adults + selection.children,
      children: selection.children,
      addons: [],
      driver,
      itineraryBundle: ctx.itinerary.id,
    })
    if (result.ok) added += 1
    else failed.push(pick.activityId)
  }
  revalidatePath('/[locale]/my-trip', 'page')
  revalidatePath('/[locale]/checkout', 'page')
  if (added === 0) return { ok: false, error: 'unavailable', failed }
  return { ok: true, added, quote }
}
