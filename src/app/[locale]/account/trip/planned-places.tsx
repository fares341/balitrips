/**
 * "أماكن أخطط لزيارتها" — من الخريطة، مرتبة يدوياً، مع يوم اختياري.
 *
 * منفصلة عن الخطة المؤكدة أدناه (الطلبات المدفوعة) عمداً — انظر trip_items.
 * أزرار ↑/↓ بدل السحب والإفلات: تعمل بلوحة المفاتيح وقارئ الشاشة وعلى
 * الهاتف دون مكتبة، والسحب يمكن إضافته فوقها لاحقاً.
 */

import { and, asc, eq, isNull, sql } from 'drizzle-orm'
import { getTranslations } from 'next-intl/server'

import { Button, LinkButton } from '@/components/shared'
import { Icon } from '@/components/ui'
import { db } from '@/db'
import { mapPlaces, regions, tripItems } from '@/db/schema'
import type { Locale } from '@/i18n/config'
import { Link } from '@/i18n/routing'
import { pick } from '@/lib/content/localize'
import { entityHref } from '@/lib/content/types'
import { canSeePlace } from '@/lib/entitlements'
import { loadPermissions } from '@/lib/entitlements/plans'

import { moveTripItem, removeTripItem, setTripItemDay } from './planned-actions'

const DAY_CHOICES = Array.from({ length: 14 }, (_, i) => i + 1)

export async function PlannedPlaces({ userId, locale }: { userId: string; locale: Locale }) {
  const t = await getTranslations({ locale })
  const [rows, permissions] = await Promise.all([
    db
      .select({
        id: tripItems.id,
        dayNumber: tripItems.dayNumber,
        place: mapPlaces,
        regionLabel: regions.label,
      })
      .from(tripItems)
      .innerJoin(mapPlaces, eq(mapPlaces.id, tripItems.placeId))
      .leftJoin(regions, eq(regions.id, mapPlaces.regionId))
      .where(and(eq(tripItems.userId, userId), isNull(mapPlaces.deletedAt)))
      .orderBy(sql`${tripItems.dayNumber} asc nulls last`, asc(tripItems.position)),
    loadPermissions(userId),
  ])

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
        <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 10 }}>
          {rows.map((row, index) => {
            // باقة انتهت أو استُردّت: الاسم لا يظهر، كما على الخريطة.
            const visible = canSeePlace(row.place, permissions.entitlements)
            return (
              <li
                key={row.id}
                className="row"
                style={{
                  gap: 10,
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  borderBlockEnd: '1px solid var(--line, #eee)',
                  paddingBlockEnd: 10,
                }}
              >
                <span className="muted" style={{ minWidth: 22, fontWeight: 700 }}>
                  {index + 1}
                </span>
                <div style={{ flex: 1, minWidth: 160 }}>
                  {visible ? (
                    <Link href={entityHref('place', row.place.slug)} style={{ fontWeight: 700 }}>
                      {pick(row.place.name, locale, row.place.slug)}
                    </Link>
                  ) : (
                    <span className="muted">
                      <Icon name="lock" size={13} /> {t('acct_plan_locked_place')}
                    </span>
                  )}
                  {visible && row.regionLabel && (
                    <div className="muted" style={{ fontSize: 12.5 }}>
                      {pick(row.regionLabel, locale)}
                    </div>
                  )}
                </div>

                <form action={setTripItemDay} className="row" style={{ gap: 6 }}>
                  <input type="hidden" name="itemId" value={row.id} />
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
                  <input type="hidden" name="itemId" value={row.id} />
                  <input type="hidden" name="dir" value="up" />
                  <Button
                    type="submit"
                    variant="ghost"
                    size="sm"
                    aria-label={t('acct_plan_up')}
                    disabled={index === 0}
                  >
                    ↑
                  </Button>
                </form>
                <form action={moveTripItem}>
                  <input type="hidden" name="itemId" value={row.id} />
                  <input type="hidden" name="dir" value="down" />
                  <Button
                    type="submit"
                    variant="ghost"
                    size="sm"
                    aria-label={t('acct_plan_down')}
                    disabled={index === rows.length - 1}
                  >
                    ↓
                  </Button>
                </form>
                <form action={removeTripItem}>
                  <input type="hidden" name="itemId" value={row.id} />
                  <Button
                    type="submit"
                    variant="ghost"
                    size="sm"
                    aria-label={t('acct_plan_remove')}
                  >
                    <Icon name="trash" size={15} />
                  </Button>
                </form>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
