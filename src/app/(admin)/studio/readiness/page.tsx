import Link from 'next/link'

import { adminHref } from '../../_lib/admin-path'
import { getAdminI18n } from '../../_lib/i18n'
import { canOpenHref } from '../../_lib/route-access'
import { requireCapability } from '../../_lib/session'
import { PageHead } from '../../_ui/shell'
import { Pill } from '../../_ui/table'
import { loadReadiness } from './data'

export const dynamic = 'force-dynamic'

/** Rows shown per list before «and N more» (the CSV has them all). */
const SHOW = 40

export default async function ReadinessPage() {
  const session = await requireCapability('content.read')
  const { t, locale } = await getAdminI18n()
  const data = await loadReadiness(locale)
  const link = (path: string) => {
    const href = adminHref(path)
    return canOpenHref(session.role, href) ? href : null
  }

  const checks: { key: string; ok: boolean; text: string; href: string | null }[] = [
    {
      key: 'photos',
      ok: data.placesNoPhoto.length === 0,
      text: t('oo.r_photos', { n: data.placesNoPhoto.length, total: data.placesTotal }),
      href: '#places',
    },
    {
      key: 'activities',
      ok: data.activityGaps.length === 0,
      text: t('oo.r_activities', { n: data.activityGaps.length, total: data.activitiesTotal }),
      href: '#activities',
    },
    {
      key: 'itineraries',
      ok: data.itinerariesNoTiers.length === 0,
      text: t('oo.r_itineraries', {
        n: data.itinerariesNoTiers.length,
        total: data.itinerariesTotal,
      }),
      href: '#itineraries',
    },
    {
      key: 'packages',
      ok: data.packagesPublished > 0,
      text:
        data.packagesPublished > 0
          ? t('oo.r_packages_ok', { n: data.packagesPublished })
          : t('oo.r_packages_none'),
      href: link('/packages'),
    },
    {
      key: 'blog',
      ok: data.articlesPublished > 0,
      text:
        data.articlesPublished > 0
          ? t('oo.r_blog_ok', { n: data.articlesPublished })
          : t('oo.r_blog_none'),
      href: link('/articles'),
    },
    {
      key: 'visa',
      ok: data.visaSet,
      text: data.visaSet ? t('oo.r_visa_ok') : t('oo.r_visa_none'),
      href: link('/config'),
    },
    {
      key: 'guide',
      ok: data.emptyGuideCategories.length === 0,
      text:
        data.emptyGuideCategories.length === 0
          ? t('oo.r_guide_ok')
          : t('oo.r_guide_empty', {
              list: data.emptyGuideCategories.map((c) => c.label).join('، '),
            }),
      href: link('/places'),
    },
  ]
  const missing = checks.filter((check) => !check.ok).length

  return (
    <>
      <PageHead
        title={t('oo.r_title')}
        description={t('oo.r_desc')}
        actions={
          <a className="a-btn" href={adminHref('/readiness/export')}>
            {t('oo.r_export')}
          </a>
        }
      />

      <section className="a-card" aria-labelledby="r-sum">
        <div className="a-card-head">
          <h2 id="r-sum">{t('oo.r_summary')}</h2>
          {missing > 0 ? <span className="a-count-badge">{missing}</span> : null}
        </div>
        <ul className="a-ready-list">
          {checks.map((check) => (
            <li key={check.key} className={check.ok ? 'ok' : 'todo'}>
              <Pill tone={check.ok ? 'good' : 'warn'}>
                {check.ok ? t('oo.r_ok') : t('oo.r_todo')}
              </Pill>
              <span>{check.text}</span>
              {check.href && !check.ok ? (
                <a className="a-ready-go" href={check.href}>
                  {t('oo.r_open')}
                </a>
              ) : null}
            </li>
          ))}
        </ul>
        <p className="a-hint" style={{ marginBlockStart: 12 }}>
          {t('oo.r_public_note')}
        </p>
      </section>

      <section className="a-card" id="places" aria-labelledby="r-places">
        <h2 id="r-places">{t('oo.r_places_title', { n: data.placesNoPhoto.length })}</h2>
        {data.placesNoPhoto.length === 0 ? (
          <p className="a-hint">{t('oo.r_none_left')}</p>
        ) : (
          <ul className="a-ready-items">
            {data.placesNoPhoto.slice(0, SHOW).map((place) => {
              const href = link(`/places/${place.id}`)
              return (
                <li key={place.id}>
                  {href ? <Link href={href}>{place.name}</Link> : <span>{place.name}</span>}
                  <span className="a-muted">{place.area}</span>
                </li>
              )
            })}
          </ul>
        )}
        {data.placesNoPhoto.length > SHOW ? (
          <p className="a-hint">{t('oo.r_more', { n: data.placesNoPhoto.length - SHOW })}</p>
        ) : null}
      </section>

      <section className="a-card" id="activities" aria-labelledby="r-act">
        <h2 id="r-act">{t('oo.r_act_title', { n: data.activityGaps.length })}</h2>
        {data.activityGaps.length === 0 ? (
          <p className="a-hint">{t('oo.r_none_left')}</p>
        ) : (
          <ul className="a-ready-items">
            {data.activityGaps.slice(0, SHOW).map((activity) => {
              const href = link(`/activities/${activity.id}`)
              return (
                <li key={activity.id}>
                  {href ? <Link href={href}>{activity.name}</Link> : <span>{activity.name}</span>}
                  <span className="a-ready-gaps">
                    {activity.gaps.map((gap) => (
                      <Pill key={gap} tone="warn">
                        {t(`oo.r_gap_${gap}`)}
                      </Pill>
                    ))}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
        {data.activityGaps.length > SHOW ? (
          <p className="a-hint">{t('oo.r_more', { n: data.activityGaps.length - SHOW })}</p>
        ) : null}
      </section>

      <section className="a-card" id="itineraries" aria-labelledby="r-it">
        <h2 id="r-it">{t('oo.r_it_title', { n: data.itinerariesNoTiers.length })}</h2>
        {data.itinerariesNoTiers.length === 0 ? (
          <p className="a-hint">{t('oo.r_none_left')}</p>
        ) : (
          <ul className="a-ready-items">
            {data.itinerariesNoTiers.map((itinerary) => {
              const href = link(`/itineraries/${itinerary.id}`)
              return (
                <li key={itinerary.id}>
                  {href ? <Link href={href}>{itinerary.name}</Link> : <span>{itinerary.name}</span>}
                  <span className="a-muted">{t('oo.r_it_gap')}</span>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </>
  )
}
