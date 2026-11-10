/**
 * `/plans/buy/<planId>` — the "Choose plan" button as a real link (list H12):
 * puts the plan in the cart and opens My Trip, like the form on /plans.
 */

import { revalidatePath } from 'next/cache'

import { defaultLocale, isLocale } from '@/i18n/config'
import { getPathname } from '@/i18n/routing'
import { localRedirect } from '@/lib/http/local-redirect'

import { addPlanToCart } from '../../plan-cart'

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' }

export async function GET(
  request: Request,
  { params }: { params: Promise<{ locale: string; planId: string }> },
) {
  const { locale: raw, planId } = await params
  const locale = isLocale(raw) ? raw : defaultLocale
  // `?devices=3` from the stepper; clamped and priced on the server.
  const devices = new URL(request.url).searchParams.get('devices')
  const added = await addPlanToCart(planId, devices)
  if (added) revalidatePath('/[locale]/my-trip', 'page')
  return localRedirect(getPathname({ href: added ? '/my-trip' : '/plans', locale }), {
    status: 303,
    headers: NO_STORE,
  })
}
