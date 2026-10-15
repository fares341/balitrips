import { asc, isNull } from 'drizzle-orm'
import Link from 'next/link'

import { EXAGGERATION_RANGE, IMAGERY_PROVIDERS, TILT_RANGE } from '@/app/[locale]/map/map-style'
import { db } from '@/db'
import { mapPlaces } from '@/db/schema'
import { can } from '@/lib/auth/roles'
import { pick } from '@/lib/content/localize'

import { adminHref } from '../../_lib/admin-path'
import { getAdminI18n } from '../../_lib/i18n'
import { param } from '../../_lib/result'
import { requireCapability } from '../../_lib/session'
import { readSetting } from '../../_lib/settings'
import { Field, Select, TextInput } from '../../_ui/field'
import { Flash } from '../../_ui/flash'
import { PageHead } from '../../_ui/shell'
import { saveMapSettings } from '../config/actions'
import { PlacesMap, type PinKind, type StudioPin } from './places-map'

export const dynamic = 'force-dynamic'

/**
 * Studio → Map.
 *
 * Every place that is not archived, on the same real map the public site
 * uses — including drafts, hidden places and places behind the paywall,
 * which the public payload never sends to a visitor's browser. Each pin opens
 * its editor. Admins also get the map's 3D settings here.
 */
export default async function StudioMapPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requireCapability('content.read')
  const { t, locale } = await getAdminI18n()
  const params = await searchParams
  const focus = param(params, 'focus')

  const [rows, settings] = await Promise.all([
    db
      .select({
        id: mapPlaces.id,
        slug: mapPlaces.slug,
        name: mapPlaces.name,
        lat: mapPlaces.lat,
        lon: mapPlaces.lon,
        isFree: mapPlaces.isFree,
        isHidden: mapPlaces.isHidden,
        status: mapPlaces.status,
        requiredEntitlement: mapPlaces.requiredEntitlement,
      })
      .from(mapPlaces)
      .where(isNull(mapPlaces.deletedAt))
      .orderBy(asc(mapPlaces.slug)),
    readSetting('map'),
  ])

  const kindOf = (row: (typeof rows)[number]): PinKind =>
    row.status !== 'published' ? 'draft' : row.isHidden ? 'hidden' : row.isFree ? 'free' : 'locked'

  const pins: StudioPin[] = rows.map((row) => {
    const kind = kindOf(row)
    return {
      id: row.id,
      name: pick(row.name, locale, row.slug),
      lat: row.lat,
      lon: row.lon,
      kind,
      note: kind === 'locked' ? row.requiredEntitlement : null,
      href: adminHref(`/places/${row.id}`),
    }
  })

  const canConfigure = can(session.role, 'config.write')

  return (
    <>
      <PageHead
        title={t('map.title')}
        description={t('map.description')}
        actions={
          <Link className="a-btn ghost" href={adminHref('/places')}>
            {t('map.places_list')}
          </Link>
        }
      />
      <Flash searchParams={params} />

      <PlacesMap pins={pins} settings={settings} focusId={focus ?? null} />

      {canConfigure ? (
        <form className="a-card a-form" action={saveMapSettings}>
          <h2>{t('map.settings')}</h2>
          <p className="a-hint">{t('map.settings_hint')}</p>
          <div className="a-row">
            <Field label={t('map.imagery')} htmlFor="imagery" hint={t('map.imagery_hint')}>
              <Select id="imagery" name="imagery" defaultValue={settings.imagery}>
                {IMAGERY_PROVIDERS.map((provider) => (
                  <option key={provider} value={provider}>
                    {t(`map.imagery_${provider}`)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label={t('map.exaggeration')}
              htmlFor="exaggeration"
              hint={t('map.exaggeration_hint', {
                min: EXAGGERATION_RANGE.min,
                max: EXAGGERATION_RANGE.max,
              })}
            >
              <TextInput
                id="exaggeration"
                name="exaggeration"
                type="number"
                dir="ltr"
                step="0.1"
                min={EXAGGERATION_RANGE.min}
                max={EXAGGERATION_RANGE.max}
                defaultValue={String(settings.exaggeration)}
                required
              />
            </Field>
            <Field
              label={t('map.tilt')}
              htmlFor="tiltOnEnter"
              hint={t('map.tilt_hint', { min: TILT_RANGE.min, max: TILT_RANGE.max })}
            >
              <TextInput
                id="tiltOnEnter"
                name="tiltOnEnter"
                type="number"
                dir="ltr"
                step="1"
                min={TILT_RANGE.min}
                max={TILT_RANGE.max}
                defaultValue={String(settings.tiltOnEnter)}
                required
              />
            </Field>
          </div>
          <div className="a-actions">
            <button className="a-btn" type="submit">
              {t('map.save')}
            </button>
          </div>
        </form>
      ) : null}
    </>
  )
}
