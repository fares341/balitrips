import { asc, isNull } from 'drizzle-orm'
import Link from 'next/link'

import {
  EXAGGERATION_RANGE,
  SATELLITE_PROVIDERS,
  TILT_RANGE,
  mapViewSettings,
} from '@/app/[locale]/map/map-style'
import { db } from '@/db'
import { mapPlaces } from '@/db/schema'
import { can } from '@/lib/auth/roles'
import { pick } from '@/lib/content/localize'

import { adminHref } from '../../_lib/admin-path'
import { getAdminI18n } from '../../_lib/i18n'
import { param } from '../../_lib/result'
import { requireCapability } from '../../_lib/session'
import { readSetting } from '../../_lib/settings'
import { Field, TextInput } from '../../_ui/field'
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
  const view = mapViewSettings(settings)

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

      <PlacesMap pins={pins} settings={view} focusId={focus ?? null} />

      {canConfigure ? (
        <form className="a-card a-form" action={saveMapSettings}>
          <h2>{t('map.settings')}</h2>
          <p className="a-hint">{t('map.settings_hint')}</p>

          <fieldset className="a-fieldset">
            <legend>{t('map.satellite')}</legend>
            <p className="a-hint">{t('map.satellite_intro')}</p>
            <div className="a-field">
              {SATELLITE_PROVIDERS.map((provider) => (
                <label key={provider} className="a-check">
                  <input
                    type="radio"
                    name="satellite"
                    value={provider}
                    defaultChecked={settings.satellite === provider}
                  />
                  <span>
                    <b>{t(`map.sat_${provider}`)}</b>
                    <br />
                    <span className="a-hint">{t(`map.sat_${provider}_note`)}</span>
                  </span>
                </label>
              ))}
            </div>
            <div className="a-row">
              <Field label={t('map.esri_key')} htmlFor="esriKey" hint={t('map.esri_key_hint')}>
                <TextInput
                  id="esriKey"
                  name="esriKey"
                  dir="ltr"
                  autoComplete="off"
                  spellCheck={false}
                  defaultValue={settings.esriKey}
                />
              </Field>
              <Field
                label={t('map.mapbox_token')}
                htmlFor="mapboxToken"
                hint={t('map.mapbox_token_hint')}
              >
                <TextInput
                  id="mapboxToken"
                  name="mapboxToken"
                  dir="ltr"
                  autoComplete="off"
                  spellCheck={false}
                  defaultValue={settings.mapboxToken}
                />
              </Field>
            </div>
            <label className="a-check">
              <input
                type="checkbox"
                name="licenceConfirmed"
                defaultChecked={settings.licenceConfirmed}
              />
              {t('map.licence_confirm')}
            </label>
            <p className="a-hint">{t('map.keys_public')}</p>
            <p className={view.satellite === 'none' ? 'a-hint' : 'a-hint a-good'} role="status">
              {view.satellite === 'none'
                ? settings.satellite === 'none'
                  ? t('map.sat_status_off')
                  : t('map.sat_status_inactive')
                : t('map.sat_status_on', { provider: t(`map.sat_${view.satellite}`) })}
            </p>
          </fieldset>

          <div className="a-row">
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
