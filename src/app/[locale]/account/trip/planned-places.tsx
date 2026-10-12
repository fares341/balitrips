/**
 * "أماكن أخطط لزيارتها" — من الخريطة، مرتبة يدوياً، مع يوم اختياري.
 *
 * منفصلة عن الخطة المؤكدة أدناه (الطلبات المدفوعة) عمداً — انظر trip_items.
 * السحب والإفلات (TripDragList) فوق أزرار ↑/↓: الأسهم للوحة المفاتيح وقارئ
 * الشاشة والهاتف. "رتّب حسب المسافة" يقترح مسار كل يوم (الوثيقة 12.3).
 *
 * المسار اليومي (الوثيقة 12.3): المسافة المستقيمة بين الأماكن المتتالية
 * ومجموع اليوم ورابط Google Maps — للأماكن التي يراها المستخدم فقط. البيانات
 * تصل محجوبة من `tripItemsForViewer`، فلا إحداثيات لمكان مقفل هنا أصلاً.
 */

import { getFormatter, getTranslations } from 'next-intl/server'

import { Button, LinkButton } from '@/components/shared'
import { Icon } from '@/components/ui'
import type { Locale } from '@/i18n/config'
import { Link } from '@/i18n/routing'
import { tripItemsForViewer } from '@/lib/content/extra-queries'
import { pick } from '@/lib/content/localize'
import { loadPermissions } from '@/lib/entitlements/plans'

import { googleMapsDayUrl, groupDays, TRIP_PRINT_HREF } from './_lib/route'
import { moveTripItem, removeTripItem, setTripItemDay, suggestTripRoute } from './planned-actions'
import { TripDragList } from './trip-drag-list'

const DAY_CHOICES = Array.from({ length: 14 }, (_, i) => i + 1)

export async function PlannedPlaces({ userId, locale }: { userId: string; locale: Locale }) {
  const [t, format, permissions] = await Promise.all([
    getTranslations({ locale }),
    getFormatter({ locale }),
    loadPermissions(userId),
  ])
  // Redacted with the owner's own live entitlements: a lapsed plan hides the
  // name and coordinates here exactly as on the map.
  const items = await tripItemsForViewer(userId, permissions.entitlements)
  const days = groupDays(items)
  const rows = days.flatMap((day) => day.items)
  const km = (value: number) =>
    format.number(value, { style: 'unit', unit: 'kilometer', maximumFractionDigits: 1 })

  return (
    <div className="card" style={{ padding: 18, marginBottom: 24 }}>
      <h2 style={{ fontSize: 18, margin: 0 }}>{t('acct_plan_t')}</h2>
      <p className="muted" style={{ fontSize: 13.5, margin: '4px 0 14px' }}>
        {permissions.canUseTrip ? t('acct_plan_sub') : t('acct_plan_locked')}
      </p>

      {rows.length === 0 ? (
        <LinkButton href="/map" variant="orange" size="sm">
          <Icon name="pin" size={15} color="#fff" /> {t('acct_plan_empty')}
        </LinkButton>
      ) : (
        <>
          <form action={suggestTripRoute} style={{ marginBlockEnd: 12 }}>
            <input type="hidden" name="day" value="" />
            <Button type="submit" variant="ghost" size="sm" disabled={rows.length < 3}>
              <Icon name="pin" size={15} /> {t('acct_plan_route')}
            </Button>
            <span className="muted" style={{ fontSize: 12.5, marginInlineStart: 8 }}>
              {t('acct_plan_route_hint')}
            </span>
          </form>
          <TripDragList
            key={rows.map((row) => `${row.itemId}:${row.dayNumber ?? ''}`).join('|')}
            items={rows.map((row, index) => {
              // باقة انتهت أو استُردّت: الاسم لا يظهر، كما على الخريطة.
              const place = row.place
              return {
                id: row.itemId,
                day: row.dayNumber,
                node: (
                  <>
                    <div style={{ flex: 1, minWidth: 160 }}>
                      {place.locked ? (
                        <span className="muted">
                          <Icon name="lock" size={13} /> {t('acct_plan_locked_place')}
                        </span>
                      ) : (
                        <Link href={place.href} style={{ fontWeight: 700 }}>
                          {pick(place.name, locale, place.slug)}
                        </Link>
                      )}
                      {!place.locked && place.regionLabel !== null && (
                        <div className="muted" style={{ fontSize: 12.5 }}>
                          {pick(place.regionLabel, locale)}
                        </div>
                      )}
                      {row.legKm !== null && (
                        <div className="muted" style={{ fontSize: 12 }}>
                          ↳ {t('trip_leg_from_prev', { km: km(row.legKm) })}
                        </div>
                      )}
                    </div>

                    <form action={setTripItemDay} className="row" style={{ gap: 6 }}>
                      <input type="hidden" name="itemId" value={row.itemId} />
                      <select
                        name="day"
                        defaultValue={row.dayNumber ?? ''}
                        aria-label={t('acct_trip_day')}
                        className="input"
                        style={{ minHeight: 36 }}
                      >
                        <option value="">{t('acct_trip_undated')}</option>
                        {DAY_CHOICES.map((day) => (
                          <option key={day} value={day}>
                            {t('acct_trip_day')} {day}
                          </option>
                        ))}
                      </select>
                      <Button type="submit" variant="ghost" size="sm">
                        {t('acct_plan_set')}
                      </Button>
                    </form>

                    <form action={moveTripItem}>
                      <input type="hidden" name="itemId" value={row.itemId} />
                      <input type="hidden" name="dir" value="up" />
                      <Button
                        type="submit"
                        variant="ghost"
                        size="sm"
                        aria-label={t('acct_plan_up')}
                        disabled={index === 0 || rows[index - 1]?.dayNumber !== row.dayNumber}
                      >
                        ↑
                      </Button>
                    </form>
                    <form action={moveTripItem}>
                      <input type="hidden" name="itemId" value={row.itemId} />
                      <input type="hidden" name="dir" value="down" />
                      <Button
                        type="submit"
                        variant="ghost"
                        size="sm"
                        aria-label={t('acct_plan_down')}
                        disabled={
                          index === rows.length - 1 || rows[index + 1]?.dayNumber !== row.dayNumber
                        }
                      >
                        ↓
                      </Button>
                    </form>
                    <form action={removeTripItem}>
                      <input type="hidden" name="itemId" value={row.itemId} />
                      <Button
                        type="submit"
                        variant="ghost"
                        size="sm"
                        aria-label={t('acct_plan_remove')}
                      >
                        <Icon name="trash" size={15} />
                      </Button>
                    </form>
                  </>
                ),
              }
            })}
          />

          <DailyRoutes
            days={days.flatMap((day) => {
              const url = googleMapsDayUrl(day.visible)
              return day.dayNumber === null || url === null
                ? []
                : [
                    {
                      dayNumber: day.dayNumber,
                      totalKm: day.totalKm,
                      stops: day.visible.length,
                      url,
                    },
                  ]
            })}
            labels={{
              title: t('trip_routes_t'),
              hint: t('trip_routes_hint'),
              day: t('acct_trip_day'),
              open: t('trip_route_open'),
            }}
            km={km}
            stopsLabel={(count) => t('trip_stops', { count })}
          />

          <div className="row" style={{ gap: 8, marginBlockStart: 14 }}>
            <LinkButton href={`${TRIP_PRINT_HREF}?auto=1`} variant="ghost" size="sm">
              <Icon name="pdf" size={15} /> {t('trip_export_pdf')}
            </LinkButton>
          </div>
        </>
      )}
    </div>
  )
}

/**
 * Per dated day: straight-line total and a Google Maps route over the places
 * the user can see. Undated places have no route — they have no day yet.
 */
function DailyRoutes({
  days,
  labels,
  km,
  stopsLabel,
}: {
  days: { dayNumber: number; totalKm: number; stops: number; url: string }[]
  labels: { title: string; hint: string; day: string; open: string }
  km: (value: number) => string
  stopsLabel: (count: number) => string
}) {
  if (days.length === 0) return null
  return (
    <div style={{ marginBlockStart: 16 }}>
      <h3 style={{ fontSize: 15, margin: 0 }}>{labels.title}</h3>
      <p className="muted" style={{ fontSize: 12.5, margin: '2px 0 8px' }}>
        {labels.hint}
      </p>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
        {days.map((day) => (
          <li key={day.dayNumber} className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
            <strong style={{ minWidth: 64 }}>
              {labels.day} {day.dayNumber}
            </strong>
            <span className="muted" style={{ fontSize: 13 }}>
              {stopsLabel(day.stops)}
              {day.stops > 1 ? ` · ${km(day.totalKm)}` : ''}
            </span>
            <a
              href={day.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: 13, fontWeight: 700, color: 'var(--orange-deep)' }}
            >
              <Icon name="route" size={14} /> {labels.open} ↗
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}
