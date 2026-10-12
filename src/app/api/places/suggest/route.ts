/**
 * GET /api/places/suggest?q=&locale= — اقتراحات فورية أثناء الكتابة.
 * مناطق، تصنيفات، "تصنيف في منطقة"، وسوم، وأسماء أماكن يستطيع السائل رؤيتها.
 */

import { NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'

import { suggest } from '@/lib/search/places'

import { localeOf, NO_STORE, viewer } from '../_viewer'

export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url)
  const q = (url.searchParams.get('q') ?? '').slice(0, 40)
  const locale = localeOf(url.searchParams.get('locale'))
  if (q.trim().length < 2) return NextResponse.json({ suggestions: [] }, { headers: NO_STORE })

  const [who, t] = await Promise.all([viewer('map_suggest'), getTranslations({ locale })])
  const suggestions = await suggest(q, who.held, locale, {
    inRegion: (category, region) => t('map_in_region', { category, region }),
  })
  return NextResponse.json({ suggestions }, { headers: NO_STORE })
}
