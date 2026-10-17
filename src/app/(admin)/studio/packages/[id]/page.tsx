import { and, asc, eq, isNull } from 'drizzle-orm'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { db } from '@/db'
import { packageActivities, packageRegions, packages } from '@/db/schema'
import { pick } from '@/lib/content/localize'

import { adminHref } from '../../../_lib/admin-path'
import { activityOptions, mediaOptions, regionOptions } from '../../../_lib/lookups'
import { requireCapability } from '../../../_lib/session'
import { Advanced } from '../../../_ui/advanced'
import {
  Checkbox,
  Field,
  LocalizedField,
  LocalizedListField,
  MoneyField,
  Select,
  StatusField,
  TextArea,
  TextInput,
} from '../../../_ui/field'
import { Flash } from '../../../_ui/flash'
import { OptionChecklist, OptionField } from '../../../_ui/select-field'
import { PageHead } from '../../../_ui/shell'
import { getAdminI18n } from '../../../_lib/i18n'
import { deletePackage, savePackage } from '../actions'

export const dynamic = 'force-dynamic'

export default async function PackageEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requireCapability('content.write')
  const { t, locale } = await getAdminI18n()
  const { id } = await params
  const query = await searchParams

  const isNew = id === 'new'

  const pkg = isNew
    ? null
    : ((
        await db
          .select()
          .from(packages)
          .where(and(eq(packages.id, id), isNull(packages.deletedAt)))
          .limit(1)
      )[0] ?? null)

  if (!isNew && !pkg) notFound()

  const [regions, activities, mediaList, selectedActivities, selectedRegions] = await Promise.all([
    regionOptions(),
    activityOptions(),
    mediaOptions(),
    pkg
      ? db
          .select({ activityId: packageActivities.activityId })
          .from(packageActivities)
          .where(eq(packageActivities.packageId, pkg.id))
          .orderBy(asc(packageActivities.sortOrder))
      : Promise.resolve([]),
    pkg
      ? db
          .select({ regionId: packageRegions.regionId })
          .from(packageRegions)
          .where(eq(packageRegions.packageId, pkg.id))
      : Promise.resolve([]),
  ])

  return (
    <>
      <PageHead
        title={pkg ? pick(pkg.name, locale, pkg.slug) : t('packages.new')}
        actions={
          <Link className="a-btn ghost" href={adminHref('/packages')}>
            {t('packages.back_to_list')}
          </Link>
        }
      />
      <Flash searchParams={query} />

      <form className="a-form" action={savePackage.bind(null, isNew ? 'new' : id)}>
        <div className="a-card">
          <h2>{t('packages.section_identity')}</h2>
          <div className="a-row">
            <Field label={t('packages.slug_required')} htmlFor="slug">
              <TextInput
                id="slug"
                name="slug"
                defaultValue={pkg?.slug ?? ''}
                required
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
              />
            </Field>
            <Advanced
              show={session.role === 'admin'}
              title={t('common.advanced')}
              keep={[['legacyId', pkg?.legacyId ?? '']]}
            >
              <Field label={t('packages.legacy_id')} htmlFor="legacyId">
                <TextInput id="legacyId" name="legacyId" defaultValue={pkg?.legacyId ?? ''} />
              </Field>
            </Advanced>
            <StatusField value={pkg?.status} />
          </div>
        </div>

        <div className="a-card">
          <h2>{t('packages.section_copy')}</h2>
          <LocalizedField name="name" label={t('packages.f_name')} value={pkg?.name} required />
          <LocalizedField name="blurb" label={t('packages.f_blurb')} value={pkg?.blurb} rows={4} />
        </div>

        <div className="a-card">
          <h2>{t('packages.section_commercial')}</h2>
          <div className="a-row">
            <MoneyField minor={pkg?.priceMinor} currency={pkg?.currency} />
            <Field
              label={t('packages.pricing_mode')}
              htmlFor="pricingMode"
              hint={t('packages.pricing_mode_hint')}
            >
              <Select id="pricingMode" name="pricingMode" defaultValue={pkg?.pricingMode ?? 'flat'}>
                <option value="flat">{t('packages.flat_option')}</option>
                <option value="per_guest">{t('packages.per_guest_option')}</option>
              </Select>
            </Field>
          </div>
          <div className="a-row">
            <Field label={t('packages.days')} htmlFor="days">
              <TextInput
                id="days"
                name="days"
                inputMode="numeric"
                defaultValue={String(pkg?.days ?? 1)}
              />
            </Field>
            <Field label={t('packages.max_guests')} htmlFor="maxGuests">
              <TextInput
                id="maxGuests"
                name="maxGuests"
                inputMode="numeric"
                defaultValue={String(pkg?.maxGuests ?? 4)}
              />
            </Field>
            <Checkbox
              name="driverIncluded"
              label={t('packages.f_driver')}
              defaultChecked={pkg?.driverIncluded ?? false}
              hint={t('packages.f_driver_hint')}
            />
            <OptionField
              name="heroImageId"
              label={t('packages.hero_image')}
              options={mediaList}
              value={pkg?.heroImageId}
            />
          </div>
          <Field
            label={t('packages.f_amenities')}
            htmlFor="amenities"
            hint={t('packages.f_amenities_hint')}
          >
            <TextArea
              id="amenities"
              name="amenities"
              rows={4}
              defaultValue={(pkg?.amenities ?? []).join('\n')}
            />
          </Field>
        </div>

        <div className="a-card">
          <h2>{t('packages.section_included')}</h2>
          <LocalizedListField
            name="included"
            label={t('packages.included')}
            values={pkg?.included}
          />
          <LocalizedListField
            name="excluded"
            label={t('packages.excluded')}
            values={pkg?.excluded}
          />
        </div>

        <div className="a-card">
          <h2>{t('packages.section_contents')}</h2>
          <OptionChecklist
            name="activityIds"
            label={t('packages.f_activities')}
            options={activities}
            values={selectedActivities.map((row) => row.activityId)}
          />
          <OptionChecklist
            name="regionIds"
            label={t('packages.f_regions')}
            options={regions}
            values={selectedRegions.map((row) => row.regionId)}
          />
        </div>

        <div className="a-actions">
          <button className="a-btn" type="submit">
            {t('packages.save')}
          </button>
        </div>
      </form>

      {pkg ? (
        <form className="a-card" action={deletePackage.bind(null, pkg.id)}>
          <h2>{t('packages.section_archive')}</h2>
          <p className="a-hint">{t('packages.archive_hint')}</p>
          <div className="a-actions" style={{ marginBlockStart: 12 }}>
            <button className="a-btn danger" type="submit">
              {t('packages.archive')}
            </button>
          </div>
        </form>
      ) : null}
    </>
  )
}
