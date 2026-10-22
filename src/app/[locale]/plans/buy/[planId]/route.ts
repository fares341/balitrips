/**
 * `/plans/buy/<planId>` — the "Choose plan" button as a real link (list H12):
 * puts the plan in the cart and opens My Trip, like the form on /plans.
 */

import { revalidatePath } from 'next/cache'
import { NextResponse } from 'next/server'

import { defaultLocale, isLocale } from '@/i18n/config'
import { getPathname } from '@/i18n/routing'

import { addPlanToCart } from '../../plan-cart'

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' }

export async function GET(
  request: Request,
  { params }: { params: Promise<{ locale: string; planId: string }> },
) {
  const { locale: raw, planId } = await params
  const locale = isLocale(raw) ? raw : defaultLocale
  const added = await addPlanToCart(planId)
  if (added) revalidatePath('/[locale]/my-trip', 'page')
  return NextResponse.redirect(
    new URL(getPathname({ href: added ? '/my-trip' : '/plans', locale }), request.url),
    { status: 303, headers: NO_STORE },
  )
}
