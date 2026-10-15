import { eq } from 'drizzle-orm'

import { db } from '@/db'
import { categories, mapPlaces, media, regions } from '@/db/schema'
import { pick } from '@/lib/content/localize'
import { toMedia } from '@/lib/content/queries'

import siteAr from '../../../../../../messages/ar.json'
import siteEn from '../../../../../../messages/en.json'
import type { Translate } from '../../../_i18n'
import { Icon } from '../../../_ui/icons'

type PlaceRow = typeof mapPlaces.$inferSelect

const SITE = { en: siteEn, ar: siteAr }

/**
 * "Preview as visitor": the place card a visitor gets on the public map,
 * drawn from what is SAVED (photo, name, category, area, rating, the three
 * buttons), in English and Arabic side by side — plus what would make it
 * look wrong (no photo, a missing name). Warnings only; nothing blocks a save.
 */
export async function VisitorPreview({ place, t }: { place: PlaceRow; t: Translate }) {
  const [hero, category, region] = await Promise.all([
    place.heroImageId
      ? db.select().from(media).where(eq(media.id, place.heroImageId)).limit(1)
      : [],
    place.categoryId
      ? db
          .select({ key: categories.key, label: categories.label })
          .from(categories)
          .where(eq(categories.id, place.categoryId))
          .limit(1)
      : [],
    place.regionId
      ? db
          .select({ key: regions.key, label: regions.label })
          .from(regions)
          .where(eq(regions.id, place.regionId))
          .limit(1)
      : [],
  ])
  const photo = toMedia(hero[0])?.url ?? null
  const cat = category[0]
  const area = region[0]

  const warnings: string[] = []
  if (photo === null) warnings.push(t('places.warn_no_photo'))
  for (const [lang, label] of [
    ['en', 'English'],
    ['ar', 'العربية'],
  ] as const) {
    if (!place.name?.[lang]?.trim()) warnings.push(t('places.warn_no_name', { lang: label }))
  }
  if (place.status !== 'published') warnings.push(t('places.warn_draft'))
  else if (place.isHidden) warnings.push(t('places.warn_hidden'))

  return (
    <section className="a-card a-pv" aria-labelledby="pv-h">
      <h2 id="pv-h">{t('places.preview')}</h2>
      <p className="a-hint">{t('places.preview_hint')}</p>
      {warnings.length > 0 && (
        <ul className="a-coord-warnings" role="status">
          {warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}
      <div className="a-pv-row">
        {(['en', 'ar'] as const).map((lang) => (
          <article key={lang} className="a-pv-card" lang={lang} dir={lang === 'ar' ? 'rtl' : 'ltr'}>
            <div className="a-pv-top">
              {photo ? (
                // eslint-disable-next-line @next/next/no-img-element -- admin preview of the media library image
                <img className="a-pv-img" src={photo} alt="" />
              ) : (
                <span className="a-pv-img a-pv-ph" aria-hidden="true">
                  <Icon name="image" size={24} />
                </span>
              )}
              <div className="a-pv-meta">
                <b>{pick(place.name, lang, place.slug)}</b>
                <span>
                  {[
                    cat ? pick(cat.label, lang, cat.key) : '',
                    area ? pick(area.label, lang, area.key) : '',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
                {place.rating !== null && (
                  <span className="a-pv-stars" dir="ltr">
                    ★ {place.rating.toFixed(1)}
                  </span>
                )}
              </div>
            </div>
            {/* the public site's own button labels (messages/*.json) */}
            <div className="a-pv-btns" aria-hidden="true">
              <span className="is-primary">{SITE[lang].mp5_details}</span>
              <span>{SITE[lang].mp3_directions}</span>
              <span>{SITE[lang].map_save}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
