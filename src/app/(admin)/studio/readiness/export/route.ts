import { csvResponse } from '../../../_lib/csv'
import { getAdminI18n } from '../../../_lib/i18n'
import { requireCapability } from '../../../_lib/session'
import { loadReadiness } from '../data'

/**
 * «قائمة التصوير للرحلة» — places and activities that need photos or video,
 * grouped by area, for the owner's trip to Bali (owner, Oct 2026).
 * No personal data: catalogue names and Studio links only.
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  await requireCapability('content.read')
  const { t, locale } = await getAdminI18n()
  const data = await loadReadiness(locale)
  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? '').replace(/\/+$/, '')
  const base = (process.env.ADMIN_BASE_PATH ?? '/studio').replace(/\/+$/, '')

  const rows: (readonly string[])[] = [
    ...data.placesNoPhoto.map((place) => [
      place.area,
      t('oo.csv_place'),
      place.name,
      place.hasVideo ? t('oo.csv_need_photo') : t('oo.csv_need_photo_video'),
      `${site}${base}/places/${place.id}`,
    ]),
    ...data.activityGaps
      .filter((activity) => activity.gaps.includes('photo'))
      .map((activity) => [
        activity.area,
        t('oo.csv_activity'),
        activity.name,
        t('oo.csv_need_photo_video'),
        `${site}${base}/activities/${activity.id}`,
      ]),
  ].sort((a, b) => (a[0] ?? '').localeCompare(b[0] ?? '') || (a[2] ?? '').localeCompare(b[2] ?? ''))

  return csvResponse(
    'photo-trip-list',
    [t('oo.csv_area'), t('oo.csv_type'), t('oo.csv_name'), t('oo.csv_needs'), t('oo.csv_link')],
    rows,
  )
}
