/**
 * Driver hire.
 *
 * Ported from `DriverPage` in design/handoff/sections-bt/page-driver.jsx: the
 * banner, six value props in a 3-up grid, the five-step transparency protocol,
 * a gallery, and the right-hand booking column.
 *
 * The prototype restated two rules it did not own:
 *
 *  1. `vehicleFor(pax)` — the 1-4 / 5-7 / 8+ mapping — was written out again in
 *     page-driver.jsx, page-activities.jsx and the homepage quick-book form.
 *  2. `veh === "van" ? 95 : veh === "suv" ? 70 : 45` — the rate card — was
 *     written out in the same three files, as bare integers with a `$` glued
 *     on at render time.
 *
 * Neither literal appears in this bundle. The class comes from
 * `vehicleForPassengers`, the rate comes from `driver_vehicles`, and the
 * amount is minor units plus a currency code rendered through `formatMoney`.
 *
 * A Server Component. Only the booking column is interactive, and it receives
 * the fleet as a prop — so the value props, the protocol and the gallery all
 * stay on the server.
 *
 * Statically renderable: nothing here reads cookies or headers.
 */

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { formatPrice } from '@/components/bt/card'
import { CompactCard } from '@/components/bt/compact-card'
import { HOME_HREF } from '@/components/layout'
import { Icon, Photo, type IconName } from '@/components/ui'
import { isLocale, locales } from '@/i18n/config'
import { pick, pickOptional } from '@/lib/content/localize'
import { listActivities, listDriverVehicles } from '@/lib/content/queries'
import { FEATURES } from '@/lib/features'

import { pageMetadata } from '../_meta'
import { imageAt, imagePool } from '../_ui/imagery'
import { PageBanner } from '../_ui/page-banner'
import { DriverBooking } from './driver-booking'
import { VEHICLE_BLURB, VEHICLE_ICON, VEHICLE_LABEL } from './vehicles'

/** Locale-agnostic path. The nav table already declares it. */
const DRIVER_HREF = '/driver'

/** Section 1 — the six value props, icon paired with message key. */
const VALUE_PROPS: readonly { icon: IconName; key: string }[] = [
  { icon: 'car', key: 'dp_vp1' },
  { icon: 'sun', key: 'dp_vp2' },
  { icon: 'users', key: 'dp_vp3' },
  { icon: 'compass', key: 'dp_vp4' },
  { icon: 'pin', key: 'dp_vp5' },
  { icon: 'route', key: 'dp_vp6' },
]

/** Section 2 — the five-step transparency protocol, in order. */
const PROTOCOL_STEPS = ['dp_how1', 'dp_how2', 'dp_how3', 'dp_how4', 'dp_how5'] as const

/** Section 3 — how many photographs the gallery grid holds. */
const GALLERY_SIZE = 4

/** How many records to pull for the image pool. */
const IMAGE_SOURCE_LIMIT = 12

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  // The driver service is switched off on the public site (lib/features.ts).
  if (!isLocale(locale) || !FEATURES.driver) notFound()

  const t = await getTranslations({ locale })

  return pageMetadata({
    locale,
    path: DRIVER_HREF,
    title: t('navr_driver2'),
    description: t('dp_hero_b'),
  })
}

export default async function DriverPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale) || !FEATURES.driver) notFound()
  setRequestLocale(locale)

  const [t, vehicles, activities] = await Promise.all([
    getTranslations({ locale }),
    listDriverVehicles(),
    listActivities({ locale, limit: IMAGE_SOURCE_LIMIT }),
  ])

  /**
   * Imagery.
   *
   * The handoff dressed this page with `flickr("bali,road,jungle", …)` — a
   * loremflickr search phrase, i.e. a stranger's photograph with no licence
   * record. The banner and the gallery borrow hero images from published
   * catalogue records instead; `<Photo>` renders its neutral surface when the
   * pool is empty rather than a broken image.
   */
  const pool = imagePool(activities)
  const gallery = Array.from({ length: GALLERY_SIZE }, (_, index) => imageAt(pool, index + 1))

  return (
    <main>
      <PageBanner
        tall
        image={imageAt(pool, 0)}
        tag={t('dp_title')}
        title={t('dp_hero_t')}
        subtitle={t('dp_hero_b')}
        breadcrumbLabel={t('c_breadcrumb')}
        trail={[{ label: t('c_home'), href: HOME_HREF }, { label: t('navr_driver2') }]}
      />

      <section className="bg-ivory">
        <div className="wrap bt-detail-grid">
          <div className="bt-detail-main">
            {/* Vehicle options: the real fleet, each card preselects its group
                size in the booking column (`?pax=` → #book). */}
            {vehicles.length > 0 && (
              <section className="bt-detail-block">
                <h2 className="bt-detail-h">{t('dp_fleet_t')}</h2>
                <div className="cc-grid cc-fleet">
                  {vehicles.map((vehicle) => (
                    <CompactCard
                      key={vehicle.id}
                      href={`${DRIVER_HREF}?pax=${vehicle.maxPassengers}#book`}
                      title={pick(vehicle.label, locale, t(VEHICLE_LABEL[vehicle.vehicleClass]))}
                      description={
                        pickOptional(vehicle.description, locale) ??
                        t(VEHICLE_BLURB[vehicle.vehicleClass])
                      }
                      icon={VEHICLE_ICON[vehicle.vehicleClass]}
                      badge={
                        <bdi dir="ltr">
                          {vehicle.minPassengers}–{vehicle.maxPassengers}
                        </bdi>
                      }
                      meta={t('bt_up_to_people', { n: vehicle.maxPassengers })}
                      price={
                        vehicle.dayRateMinor > 0
                          ? {
                              label: t('bt_from'),
                              amount: formatPrice(vehicle.dayRateMinor, vehicle.currency, locale),
                              unit: t('dp_unit_day'),
                            }
                          : null
                      }
                    />
                  ))}
                </div>
              </section>
            )}

            <section className="bt-detail-block">
              <h2 className="bt-detail-h">{t('dp_vp_t')}</h2>
              <div className="bt-vpgrid">
                {VALUE_PROPS.map((prop) => (
                  <div key={prop.key} className="bt-vp">
                    <span className="bt-vp-ic" aria-hidden="true">
                      <Icon name={prop.icon} size={20} color="var(--forest)" />
                    </span>
                    <span>{t(prop.key)}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="bt-detail-block">
              <h2 className="bt-detail-h">{t('dp_how_t')}</h2>
              {/*
                An ordered list, not a stack of divs: the step numbers carry
                meaning, so the sequence has to survive being read aloud. The
                visible numeral is decorative — the list element supplies it.
              */}
              <ol className="bt-steps">
                {PROTOCOL_STEPS.map((key, index) => (
                  <li key={key}>
                    <span className="bt-step-n" aria-hidden="true">
                      {index + 1}
                    </span>
                    <span>{t(key)}</span>
                  </li>
                ))}
              </ol>
            </section>

            {gallery.some((image) => image !== null) && (
              <section className="bt-detail-block">
                <h2 className="bt-detail-h">{t('ad_gallery')}</h2>
                <div className="bt-gallery-grid">
                  {gallery.map((image, index) => (
                    // Decorative: the surrounding copy already describes the
                    // service, and these are mood shots rather than the thing
                    // being booked.
                    <Photo
                      key={image?.id ?? `slot-${index}`}
                      src={image?.url}
                      alt=""
                      radius={12}
                      style={{ height: 120 }}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>

          {/*
            `DriverBooking` reads `?start=&end=&pax=` so the homepage quick-book
            card can hand its answers over instead of dropping them. That needs
            `useSearchParams`, which opts the subtree into client rendering —
            the boundary keeps the rest of the page prerendered.
          */}
          <Suspense fallback={<aside className="bt-booking" aria-busy="true" />}>
            <DriverBooking vehicles={vehicles} />
          </Suspense>
        </div>
      </section>
    </main>
  )
}
