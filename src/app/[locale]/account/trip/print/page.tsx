/**
 * "إنشاء PDF للرحلة" (الوثيقة 12.3): نسخة للطباعة من "أماكن أخطط لزيارتها".
 *
 * يوم بيوم، مع المنطقة والمسافة المستقيمة بين المحطات المتتالية ومجموع اليوم.
 * `@media print` يخفي رأس الموقع والقائمة الجانبية والأزرار، فيبقى الجدول
 * وحده على الورق. الأماكن المقفلة على المستخدم (باقة انتهت) تُطبع "مكان
 * مقفل" بلا اسم ولا منطقة، كما في الصفحة نفسها.
 */

import type { Metadata } from 'next'
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server'

import { LinkButton } from '@/components/shared'
import { tripItemsForViewer } from '@/lib/content/extra-queries'
import { pick } from '@/lib/content/localize'
import { loadPermissions } from '@/lib/entitlements/plans'
import { requireActiveUser } from '@/lib/security/require'

import { toLocale } from '../../../_seo-hreflang'
import { accountMetadata } from '../../_lib/meta'
import { groupDays } from '../_lib/route'
import { AutoPrint } from './auto-print'

type PageParams = Promise<{ locale: string }>
type PageSearch = Promise<Record<string, string | string[] | undefined>>

export async function generateMetadata({ params }: { params: PageParams }): Promise<Metadata> {
  const { locale: raw } = await params
  return accountMetadata(toLocale(raw), 'trip_print_t')
}

const PRINT_CSS = `
.bt-trip-print { max-width: 820px; margin: 0 auto; padding: 8px 0 32px; }
.bt-trip-print table { width: 100%; border-collapse: collapse; font-size: 14px; }
.bt-trip-print th, .bt-trip-print td { text-align: start; padding: 8px 6px; border-bottom: 1px solid var(--line, #ddd); vertical-align: top; }
.bt-trip-print th { font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted, #666); }
.bt-trip-print-day { break-inside: avoid; page-break-inside: avoid; margin-top: 22px; }
.bt-trip-print-day h2 { font-size: 18px; margin: 0 0 6px; }
.bt-trip-print-num { width: 32px; color: var(--muted, #666); }
.bt-trip-print-km { white-space: nowrap; width: 110px; }
@media print {
  @page { size: A4; margin: 14mm; }
  body * { visibility: hidden !important; }
  .bt-trip-print, .bt-trip-print * { visibility: visible !important; }
  .bt-trip-print { position: absolute; top: 0; inset-inline-start: 0; width: 100%; max-width: none; padding: 0; }
  .bt-trip-print-noprint { display: none !important; }
  .bt-trip-print a { color: inherit; text-decoration: none; }
  body { background: #fff !important; }
}
`

export default async function TripPrintPage({
  params,
  searchParams,
}: {
  params: PageParams
  searchParams: PageSearch
}) {
  const { locale: raw } = await params
  const locale = toLocale(raw)
  setRequestLocale(locale)

  const user = await requireActiveUser('account:trip')
  const query = await searchParams
  const auto = query['auto'] === '1'

  const [t, format, permissions] = await Promise.all([
    getTranslations({ locale }),
    getFormatter({ locale }),
    loadPermissions(user.id),
  ])
  const days = groupDays(await tripItemsForViewer(user.id, permissions.entitlements))
  const km = (value: number) =>
    format.number(value, { style: 'unit', unit: 'kilometer', maximumFractionDigits: 1 })

  return (
    <section className="bt-trip-print" aria-labelledby="bt-trip-print-h">
      <style>{PRINT_CSS}</style>

      <div
        className="row bt-trip-print-noprint"
        style={{ gap: 8, justifyContent: 'space-between', marginBottom: 12 }}
      >
        <LinkButton href="/account/trip" variant="ghost" size="sm">
          {t('trip_print_back')}
        </LinkButton>
        {days.length > 0 && <AutoPrint auto={auto} label={t('trip_print_now')} />}
      </div>

      <h1 id="bt-trip-print-h" style={{ fontSize: 26, margin: 0 }}>
        {t('acct_plan_t')}
      </h1>
      <p className="muted" style={{ fontSize: 13, margin: '4px 0 0' }}>
        {format.dateTime(new Date(), { dateStyle: 'long' })} · {t('trip_print_note')}
      </p>

      {days.length === 0 ? (
        <p className="muted" style={{ marginTop: 24 }}>
          {t('acct_trip_empty')}
        </p>
      ) : (
        days.map((day) => (
          <div key={day.dayNumber ?? 'undated'} className="bt-trip-print-day">
            <h2>
              {day.dayNumber === null
                ? t('acct_trip_undated')
                : `${t('acct_trip_day')} ${format.number(day.dayNumber)}`}
              {day.visible.length > 1 && (
                <span className="muted" style={{ fontSize: 13, fontWeight: 500 }}>
                  {' '}
                  · {t('trip_day_total', { km: km(day.totalKm) })}
                </span>
              )}
            </h2>
            <table>
              <thead>
                <tr>
                  <th className="bt-trip-print-num">#</th>
                  <th>{t('trip_col_place')}</th>
                  <th>{t('trip_col_area')}</th>
                  <th className="bt-trip-print-km">{t('trip_col_leg')}</th>
                </tr>
              </thead>
              <tbody>
                {day.items.map((item, index) => (
                  <tr key={item.itemId}>
                    <td className="bt-trip-print-num">{format.number(index + 1)}</td>
                    {item.place.locked ? (
                      <>
                        <td className="muted">{t('trip_locked_place')}</td>
                        <td className="muted">—</td>
                      </>
                    ) : (
                      <>
                        <td style={{ fontWeight: 600 }}>
                          {pick(item.place.name, locale, item.place.slug)}
                        </td>
                        <td>
                          {item.place.regionLabel === null
                            ? '—'
                            : pick(item.place.regionLabel, locale)}
                        </td>
                      </>
                    )}
                    <td className="bt-trip-print-km">
                      {item.legKm === null ? '—' : km(item.legKm)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))
      )}
    </section>
  )
}
