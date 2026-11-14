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

import { EmptyState } from '@/components/bt'
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
import { listActivities, listHomeActivities } from '@/lib/content/queries'
import { BALI_TIME_ZONE } from '@/lib/booking-rules'
import { emptyEntitlements, loadEntitlements } from '@/lib/entitlements'
import { checkSecureAccess } from '@/lib/security/guard'

import { pageMetadata } from '../_meta'
import { toLocale } from '../_seo-hreflang'
import { PageBanner } from '../_ui/page-banner'

const EVENTS_PATH = '/events'
const PLANS_HREF = '/plans'
/** Up to this many events, the list is laid out beside a note instead of a sparse grid. */
const FEW_EVENTS = 2
/** Year-round activities offered under a short (or empty) list. */
const SUGGESTIONS = 3

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
  // A short list (one show and nothing else) used to leave most of the page
  // blank: it now sits beside a note on when events are added, and activities
  // bookable all year fill the rest. Never an event twice.
  const shown = activities.length + places.visible.length
  const few = shown <= FEW_EVENTS
  const eventIds = new Set(activities.map((entry) => entry.activity.id))
  const suggestions =
    few && places.lockedCount === 0
      ? await listHomeActivities({
          limit: SUGGESTIONS,
          locale,
          exclude: (activity) => eventIds.has(activity.id) || activity.priceMinor <= 0,
        })
      : []

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
                {t('evp_count', { n: activities.length })}
              </p>
              <div className={few ? 'ev-few' : 'grid bt-grid-3auto'}>
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
                {few && (
                  <aside className="panel ev-more">
                    <span className="ev-more-ic" aria-hidden="true">
                      <Icon name="cal" size={22} />
                    </span>
                    <h3 className="h3">{t('evp_more_t')}</h3>
                    <p className="muted">{t('evp_more_b')}</p>
                    <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
                      <LinkButton href="/activities" variant="forest" size="sm">
                        {t('ha_all')}
                      </LinkButton>
                      <LinkButton href="/custom" variant="ghost" size="sm">
                        {t('itl_custom_cta')}
                      </LinkButton>
                    </div>
                  </aside>
                )}
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
                        <Photo
                          src={place.heroImageUrl}
                          alt=""
                          sizes="(min-width: 1024px) 380px, (min-width: 640px) 50vw, 100vw"
                          style={{ height: 160 }}
                        />
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
            <EmptyState
              as="h2"
              icon="cal"
              title={t('evp_none_t')}
              text={t('evp_none')}
              action={
                <div
                  className="row"
                  style={{ justifyContent: 'center', gap: 10, flexWrap: 'wrap' }}
                >
                  <LinkButton href="/activities" variant="forest">
                    {t('ha_all')}
                  </LinkButton>
                  <LinkButton href="/custom" variant="ghost">
                    {t('itl_custom_cta')}
                  </LinkButton>
                </div>
              }
            />
          )}

          {suggestions.length > 0 && (
            <section className="ev-suggest" aria-labelledby="ev-suggest-h">
              <div className="row between" style={{ gap: 12, flexWrap: 'wrap' }}>
                <h2 id="ev-suggest-h" style={{ fontSize: 24, margin: 0 }}>
                  {t('evp_suggest_t')}
                </h2>
                <LinkButton href="/activities" variant="ghost" size="sm">
                  {t('ha_all')}
                </LinkButton>
              </div>
              <div className="grid bt-grid-3auto">
                {suggestions.map((activity) => (
                  <ActivityCard key={activity.id} activity={activity} />
                ))}
              </div>
            </section>
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
