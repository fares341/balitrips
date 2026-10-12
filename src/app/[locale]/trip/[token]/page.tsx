/**
 * A shared trip — public, read-only (spec 12.3 "شارك رحلتي").
 *
 * The link proves nothing about the VIEWER, so every place is redacted for
 * the viewer, not for the owner: signed-in visitors see what their own plan
 * unlocks, everyone else sees free places only. Anything else renders as a
 * "Locked place" with no name, slug, image or coordinates — the redacted
 * teaser type does not carry them, so they cannot reach the HTML or the RSC
 * payload. The owner appears by first name at most; the email is never read.
 *
 * Request-rendered (the payload depends on the viewer) and `noindex`: a
 * private link must not end up in a search index.
 */

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server'

import { LinkButton } from '@/components/shared'
import { Icon, Photo } from '@/components/ui'
import { Link } from '@/i18n/routing'
import { sharedTripForViewer } from '@/lib/content/extra-queries'
import { pick } from '@/lib/content/localize'
import { emptyEntitlements, loadEntitlements } from '@/lib/entitlements'
import { checkSecureAccess } from '@/lib/security/guard'

import { toLocale } from '../../_seo-hreflang'
import { groupDays } from '../../account/trip/_lib/route'

export const dynamic = 'force-dynamic'

type PageParams = Promise<{ locale: string; token: string }>

const PLANS_HREF = '/plans'

export async function generateMetadata({ params }: { params: PageParams }): Promise<Metadata> {
  const { locale: raw } = await params
  const t = await getTranslations({ locale: toLocale(raw) })
  return {
    title: t('trip_shared_t'),
    description: t('trip_shared_sub'),
    robots: { index: false, follow: false, nocache: true },
    // The token is the secret: keep it out of Referer headers on outbound links.
    referrer: 'no-referrer',
  }
}

export default async function SharedTripPage({ params }: { params: PageParams }) {
  const { locale: raw, token } = await params
  const locale = toLocale(raw)
  setRequestLocale(locale)

  const access = await checkSecureAccess('trip:shared')
  const held = access.ok ? await loadEntitlements(access.user.id) : emptyEntitlements()

  const trip = await sharedTripForViewer(token, held)
  if (trip === null) notFound()

  const [t, format] = await Promise.all([getTranslations({ locale }), getFormatter({ locale })])
  const days = groupDays(trip.items)
  const lockedCount = trip.items.filter((item) => item.place.locked).length
  const km = (value: number) =>
    format.number(value, { style: 'unit', unit: 'kilometer', maximumFractionDigits: 1 })

  return (
    <main className="bg-ivory" style={{ paddingBlock: '32px 64px' }}>
      <div className="wrap" style={{ maxWidth: 860 }}>
        <span className="tag tag-palm" style={{ width: 'fit-content' }}>
          <Icon name="route" size={13} /> {t('trip_shared_eyebrow')}
        </span>
        <h1 style={{ fontSize: 'clamp(26px,4.5vw,38px)', marginTop: 10 }}>
          {trip.ownerFirstName === null
            ? t('trip_shared_t')
            : t('trip_shared_by', { name: trip.ownerFirstName })}
        </h1>
        <p className="muted" style={{ marginTop: 6 }}>
          {t('trip_shared_sub')}
        </p>

        {(lockedCount > 0 || !access.ok) && (
          <div
            className="card card-pad row"
            style={{ gap: 14, marginTop: 20, alignItems: 'center', flexWrap: 'wrap' }}
          >
            <span className="bt-paywall-ic">
              <Icon name="lock" size={18} color="#fff" />
            </span>
            <p style={{ flex: 1, minWidth: 200, margin: 0, fontSize: 14 }}>
              {lockedCount > 0
                ? t('trip_shared_locked_n', { count: lockedCount })
                : t('trip_shared_cta_b')}
            </p>
            <LinkButton href={PLANS_HREF} variant="orange" size="sm">
              {t('trip_get_access')}
            </LinkButton>
          </div>
        )}

        {days.length === 0 ? (
          <p className="muted" style={{ marginTop: 28 }}>
            {t('trip_shared_empty')}
          </p>
        ) : (
          days.map((day) => (
            <section
              key={day.dayNumber ?? 'undated'}
              className="card"
              style={{ padding: 18, marginTop: 18 }}
              aria-label={
                day.dayNumber === null
                  ? t('acct_trip_undated')
                  : `${t('acct_trip_day')} ${format.number(day.dayNumber)}`
              }
            >
              <h2 style={{ fontSize: 17, margin: '0 0 10px' }}>
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
              <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}>
                {day.items.map((item, index) => (
                  <li
                    key={`${day.dayNumber ?? 'u'}-${index}`}
                    className="row"
                    style={{ gap: 12, alignItems: 'center' }}
                  >
                    <span className="muted" style={{ minWidth: 20, fontWeight: 700 }}>
                      {format.number(index + 1)}
                    </span>
                    {item.place.locked ? (
                      <>
                        <span
                          aria-hidden="true"
                          style={{
                            width: 56,
                            height: 56,
                            borderRadius: 10,
                            background: 'var(--line, #eee)',
                            display: 'grid',
                            placeItems: 'center',
                            flexShrink: 0,
                          }}
                        >
                          <Icon name="lock" size={18} color="var(--muted)" />
                        </span>
                        <span className="muted" style={{ flex: 1 }}>
                          {t('trip_locked_place')}
                          {item.place.requiredEntitlement === 'vip' && (
                            <span className="tag tag-orange" style={{ marginInlineStart: 8 }}>
                              VIP
                            </span>
                          )}
                        </span>
                      </>
                    ) : (
                      <>
                        <Photo
                          src={item.place.heroImageUrl}
                          alt=""
                          radius={10}
                          style={{ width: 56, height: 56, flexShrink: 0 }}
                        />
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <Link href={item.place.href} style={{ fontWeight: 700 }}>
                            {pick(item.place.name, locale, item.place.slug)}
                          </Link>
                          {item.place.regionLabel !== null && (
                            <span className="muted" style={{ display: 'block', fontSize: 12.5 }}>
                              {pick(item.place.regionLabel, locale)}
                            </span>
                          )}
                          {item.legKm !== null && (
                            <span className="muted" style={{ display: 'block', fontSize: 12 }}>
                              ↳ {t('trip_leg_from_prev', { km: km(item.legKm) })}
                            </span>
                          )}
                        </span>
                      </>
                    )}
                  </li>
                ))}
              </ol>
            </section>
          ))
        )}

        <div className="center" style={{ marginTop: 32 }}>
          <LinkButton href="/map" variant="forest">
            <Icon name="pin" size={16} color="#fff" /> {t('trip_shared_map')}
          </LinkButton>
        </div>
      </div>
    </main>
  )
}
