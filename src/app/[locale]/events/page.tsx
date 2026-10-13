/**
 * Events (contract: "صفحات الفعاليات والأنشطة").
 *
 * There is no events table. Events already exist in two places, and this
 * page lists both rather than inventing a third:
 *
 *  - **activities** tagged with the `events` category (the same taxonomy the
 *    /activities chips and the home "Events & activities" section use) — these
 *    are bookable and public;
 *  - **map places** whose main or sub-category is `events` — these are gated
 *    like every map place. The viewer sees the ones their plan unlocks (free
 *    ones for guests); locked ones are only COUNTED, never listed.
 *
 * Dated events (`event_starts_at` / `event_ends_at` on either table) come
 * first, soonest first, with the date on the card; ended ones are hidden (end
 * passed, or — without an end — started over a day ago). Undated rows are
 * permanent and follow in their usual order.
 *
 * Request-rendered for the second half: the visible set depends on the
 * viewer's entitlements, and a cached page cannot be both.
 */

import type { Metadata } from 'next'
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server'

import { ActivityCard } from '@/components/cards'
import { LinkButton } from '@/components/shared'
import { Icon, Photo } from '@/components/ui'
import { locales } from '@/i18n/config'
import { Link } from '@/i18n/routing'
import {
  activityEventDates,
  compareEventDates,
  EVENTS_CATEGORY_KEY,
  eventPlacesForViewer,
  isEventOver,
} from '@/lib/content/extra-queries'
import { pick } from '@/lib/content/localize'
import { listActivities } from '@/lib/content/queries'
import { BALI_TIME_ZONE } from '@/lib/booking-rules'
import { emptyEntitlements, loadEntitlements } from '@/lib/entitlements'
import { checkSecureAccess } from '@/lib/security/guard'

import { pageMetadata } from '../_meta'
import { toLocale } from '../_seo-hreflang'
import { PageBanner } from '../_ui/page-banner'

const EVENTS_PATH = '/events'
const PLANS_HREF = '/plans'

export const dynamic = 'force-dynamic'

type PageProps = { params: Promise<{ locale: string }> }

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }))
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale: raw } = await params
  const locale = toLocale(raw)
  const t = await getTranslations({ locale })
  return pageMetadata({
    locale,
    path: EVENTS_PATH,
    title: t('evp_title'),
    description: t('evp_sub'),
  })
}

export default async function EventsPage({ params }: PageProps) {
  const { locale: raw } = await params
  const locale = toLocale(raw)
  setRequestLocale(locale)

  const access = await checkSecureAccess('events')
  const held = access.ok ? await loadEntitlements(access.user.id) : emptyEntitlements()

  const [t, format, allActivities, places] = await Promise.all([
    getTranslations({ locale }),
    getFormatter({ locale }),
    listActivities({ categoryKey: EVENTS_CATEGORY_KEY, locale }),
    eventPlacesForViewer(held),
  ])

  const now = new Date()
  const dates = await activityEventDates(allActivities.map((activity) => activity.id))
  const activities = allActivities
    .map((activity) => ({
      activity,
      startsAt: dates.get(activity.id)?.startsAt ?? null,
      endsAt: dates.get(activity.id)?.endsAt ?? null,
    }))
    .filter((entry) => !isEventOver(entry.startsAt, entry.endsAt, now))
    // Array.sort is stable: undated activities keep the list's order.
    .sort(compareEventDates)

  /** "Sat, 14 Jun 2026, 19:00" — or a range when the end is set. Bali time. */
  const eventWhen = (startsAt: Date | null, endsAt: Date | null): string | null => {
    if (startsAt === null) return null
    const options = {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: BALI_TIME_ZONE,
    } as const
    return endsAt === null
      ? format.dateTime(startsAt, options)
      : format.dateTimeRange(startsAt, endsAt, options)
  }

  const nothing = activities.length === 0 && places.visible.length === 0

  return (
    <main>
      <PageBanner
        tag={t('ev_eyebrow')}
        title={t('evp_title')}
        subtitle={t('evp_sub')}
        trail={[{ label: t('c_home'), href: '/' }, { label: t('navr_events') }]}
        breadcrumbLabel={t('c_breadcrumb')}
      />

      <section className="bg-ivory" style={{ paddingBlock: '32px 64px' }}>
        <div className="wrap">
          {activities.length > 0 && (
            <>
              <h2 style={{ fontSize: 24, marginBottom: 6 }}>{t('evp_bookable')}</h2>
              <p className="muted" style={{ fontSize: 13.5, fontWeight: 600, margin: '0 0 18px' }}>
                {format.number(activities.length)} {t('ah_count')}
              </p>
              <div className="grid bt-grid-3auto">
                {activities.map(({ activity, startsAt, endsAt }, index) => {
                  const when = eventWhen(startsAt, endsAt)
                  return when === null ? (
                    <ActivityCard key={activity.id} activity={activity} priority={index < 3} />
                  ) : (
                    <div key={activity.id} style={{ display: 'grid', gap: 6 }}>
                      <EventDate when={when} at={startsAt} />
                      <ActivityCard activity={activity} priority={index < 3} />
                    </div>
                  )
                })}
              </div>
            </>
          )}

          {places.visible.length > 0 && (
            <>
              <h2 style={{ fontSize: 24, margin: '40px 0 18px' }}>{t('evp_on_map')}</h2>
              <div className="grid bt-grid-4">
                {places.visible.map((place) => {
                  const when = eventWhen(place.startsAt, place.endsAt)
                  return (
                    <article
                      key={place.id}
                      className="card bt-cardhover"
                      style={{ display: 'flex', flexDirection: 'column' }}
                    >
                      <Link
                        href={place.href}
                        className="bt-card-media"
                        tabIndex={-1}
                        aria-hidden="true"
                      >
                        <Photo src={place.heroImageUrl} alt="" style={{ height: 160 }} />
                        {place.isFree && <span className="bt-card-badge">{t('mp_free')}</span>}
                      </Link>
                      <div className="card-pad" style={{ display: 'grid', gap: 6 }}>
                        {when !== null && <EventDate when={when} at={place.startsAt} />}
                        <h3 style={{ fontSize: 17, margin: 0, color: 'var(--forest)' }}>
                          <Link href={place.href}>{pick(place.name, locale, place.slug)}</Link>
                        </h3>
                        {place.regionLabel !== null && (
                          <span className="muted" style={{ fontSize: 12.5 }}>
                            <Icon name="pin" size={12} color="var(--muted)" />{' '}
                            {pick(place.regionLabel, locale)}
                          </span>
                        )}
                        <LinkButton href={place.href} variant="forest" size="sm">
                          {t('map_view')}
                        </LinkButton>
                      </div>
                    </article>
                  )
                })}
              </div>
            </>
          )}

          {places.lockedCount > 0 && (
            <div
              className="card card-pad row"
              style={{ gap: 14, marginTop: 28, alignItems: 'center', flexWrap: 'wrap' }}
            >
              <span className="bt-paywall-ic">
                <Icon name="lock" size={18} color="#fff" />
              </span>
              <p style={{ flex: 1, minWidth: 200, margin: 0, fontSize: 14.5 }}>
                {t('evp_locked_n', { count: places.lockedCount })}
              </p>
              <LinkButton href={PLANS_HREF} variant="orange" size="sm">
                {t('mp_unlock')}
              </LinkButton>
            </div>
          )}

          {nothing && places.lockedCount === 0 && (
            <div className="center" style={{ padding: '40px 0' }}>
              <p className="muted">{t('evp_none')}</p>
              <LinkButton href="/activities" variant="forest">
                {t('ha_all')}
              </LinkButton>
            </div>
          )}
        </div>
      </section>
    </main>
  )
}

/** The event's date line on a card. `<time>` carries the machine-readable start. */
function EventDate({ when, at }: { when: string; at: Date | null }) {
  return (
    <time
      dateTime={at?.toISOString()}
      className="tag tag-orange"
      style={{ justifySelf: 'start', fontSize: 12.5 }}
    >
      <Icon name="cal" size={12} /> {when}
    </time>
  )
}
