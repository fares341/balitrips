/**
 * «فعاليات جدولي» — the buyer-only page (itineraries phase 3, corrected spec §2.4).
 *
 * Opens only for a signed-in account that paid for this itinerary (settled
 * order, line not refunded), or for staff as a preview. A visitor signs in
 * first and comes back here; anyone else is sent to the public itinerary page.
 * A shared link therefore opens for nobody but its owner.
 *
 * The page lists the activities linked to the itinerary's days, priced by the
 * cart's own quote. «احجز كل الفعاليات» puts them all in the existing cart;
 * the «كل الفعاليات» discount is granted by the cart and checkout on the
 * server (`@/lib/itineraries/bundle-server`), never by this page.
 */

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { Photo } from '@/components/ui'
import { BaliIcon } from '@/components/ui/bali-icon'
import { getPathname, Link, redirect } from '@/i18n/routing'
import { pick, pickOptional } from '@/lib/content/localize'
import { isFeatureOn } from '@/lib/features'
import { itineraryTitle } from '@/lib/itineraries/display'
import { cleanSelection, loadBuyerItinerary, quoteBuyerSelection } from '@/lib/itineraries/buyer'
import { resolveBuyerViewer } from '@/lib/itineraries/buyer-access'
import { readDriverSettings } from '@/lib/itineraries/sales-settings-store'
import { qrSvg } from '@/lib/qr'
import { shareUrl } from '@/lib/seo/site-origin'

import { toLocale } from '../../../../_seo-hreflang'
import { BuyerActivities, type BuyerActivityView } from './buyer-activities'
import '../../../../itineraries/[slug]/itinerary-page.css'
import './buyer.css'

export const dynamic = 'force-dynamic'

type PageParams = Promise<{ locale: string; slug: string }>

export async function generateMetadata({ params }: { params: PageParams }): Promise<Metadata> {
  const { locale: raw } = await params
  const t = await getTranslations({ locale: toLocale(raw) })
  // Private page: never indexed, never previewed with its content.
  return { title: t('bact_title'), robots: { index: false, follow: false } }
}

export default async function BuyerActivitiesPage({ params }: { params: PageParams }) {
  const { locale: raw, slug } = await params
  const locale = toLocale(raw)
  setRequestLocale(locale)

  const self = `/account/itineraries/${slug}/activities`
  const viewer = await resolveBuyerViewer(slug)
  if (viewer.access === 'missing') notFound()
  if (viewer.access === 'sign-in') {
    redirect({ href: { pathname: '/account', query: { next: self } }, locale })
  }
  if (viewer.access === 'not-owner' || viewer.userId === null || viewer.itineraryId === null) {
    redirect({ href: `/itineraries/${slug}`, locale })
    return null
  }

  const itinerary = await loadBuyerItinerary(viewer.itineraryId, viewer.userId)
  if (itinerary === null) notFound()

  const t = await getTranslations({ locale })
  const initialSelection = cleanSelection(
    {
      adults: 2,
      children: 0,
      picks: itinerary.activities.map((act) => ({ activityId: act.activityId })),
    },
    itinerary,
  )
  const [quote, driverSettings] = await Promise.all([
    quoteBuyerSelection(itinerary, initialSelection, viewer.userId),
    readDriverSettings(),
  ])
  const driverVisible = isFeatureOn('driver') && driverSettings.showOnBuyerPage

  const name = itineraryTitle(itinerary.name, itinerary.slug, itinerary.days, locale, t)
  const pageUrl = shareUrl(getPathname({ href: self, locale }))
  const pdfHref =
    itinerary.orderItemId === null
      ? null
      : getPathname({ href: `/account/schedules/${itinerary.orderItemId}/download`, locale })

  const views: BuyerActivityView[] = itinerary.activities.map((act) => {
    const day = itinerary.dayRows.find((one) => one.dayNumber === act.dayNumber)
    return {
      activityId: act.activityId,
      href: `/activities/${act.slug}`,
      dayNumber: act.dayNumber,
      dayTitle: day ? pickOptional(day.title, locale) : null,
      name: pick(act.name, locale, act.slug),
      blurb: act.blurb ? pickOptional(act.blurb, locale) : null,
      duration: act.duration ? pickOptional(act.duration, locale) : null,
      image: act.image,
      timeSlots: act.timeSlots,
      packages: act.packages
        .filter((pkg) => !pkg.perGroup)
        .map((pkg) => ({ id: pkg.id, name: pick(pkg.name, locale) })),
    }
  })

  const freeDays = itinerary.dayRows.filter(
    (day) => !itinerary.activities.some((act) => act.dayNumber === day.dayNumber),
  )

  return (
    <div className="bact">
      {viewer.preview && (
        <p className="bact-preview" role="note">
          <BaliIcon name="info" size={18} /> {t('bact_preview')}
        </p>
      )}

      <header className="bact-hero">
        <div className="bact-hero-media" aria-hidden="true">
          <Photo
            src={itinerary.hero?.url}
            srcSetAvif={itinerary.hero?.srcSetAvif}
            srcSetWebp={itinerary.hero?.srcSetWebp}
            sizes="(max-width: 900px) 100vw, 900px"
            alt=""
            priority
          />
        </div>
        <div className="bact-hero-veil" aria-hidden="true" />
        <div className="bact-hero-inner">
          <span className="bact-eyebrow">
            <BaliIcon name="unlock" size={16} /> {t('bact_eyebrow')}
          </span>
          <h1 className="bact-title">{t('bact_h1')}</h1>
          <p className="bact-sub">{name}</p>
          <div className="bact-chips">
            <span>{t('c_days_n', { n: itinerary.days })}</span>
            <span>{t('bact_n_acts', { n: itinerary.activities.length })}</span>
            {itinerary.pct > 0 && (itinerary.eligible || viewer.preview) && (
              <span className="is-hot">{t('bact_pct_chip', { pct: itinerary.pct })}</span>
            )}
          </div>
        </div>
      </header>

      {itinerary.activities.length === 0 ? (
        <section className="itp-card bact-empty">
          <BaliIcon name="calendar" size={36} />
          <p>{t('bact_empty')}</p>
          <Link href={`/itineraries/${itinerary.slug}`} className="btn btn-ghost">
            {t('bact_back_plan')}
          </Link>
        </section>
      ) : (
        <BuyerActivities
          slug={itinerary.slug}
          activities={views}
          initialQuote={quote}
          pct={itinerary.pct}
          eligible={itinerary.eligible}
          preview={viewer.preview}
          driverVisible={driverVisible}
          freeDays={freeDays.map((day) => ({
            dayNumber: day.dayNumber,
            title: pickOptional(day.title, locale),
          }))}
        />
      )}

      <section className="itp-card bact-take" aria-labelledby="bact-take-t">
        <div className="bact-take-text">
          <h2 className="itp-h" id="bact-take-t">
            {t('bact_take_t')}
          </h2>
          <p className="muted">{t('bact_take_b')}</p>
          <div className="bact-take-actions">
            {pdfHref !== null && (
              <a className="btn btn-primary" href={pdfHref}>
                <BaliIcon name="phone" size={18} /> {t('bact_pdf')}
              </a>
            )}
            <Link href="/account/trip" className="btn btn-ghost">
              {t('bact_my_trip')}
            </Link>
          </div>
        </div>
        <figure className="bact-qr">
          <span dangerouslySetInnerHTML={{ __html: qrSvg(pageUrl) }} />
          <figcaption>{t('bact_qr')}</figcaption>
        </figure>
      </section>
    </div>
  )
}
