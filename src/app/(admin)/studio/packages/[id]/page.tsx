import { and, asc, eq, isNull } from 'drizzle-orm'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { db } from '@/db'
import { packageActivities, packageRegions, packages } from '@/db/schema'
import { pick } from '@/lib/content/localize'

import { adminHref } from '../../../_lib/admin-path'
import { activityOptions, mediaOptions, regionOptions } from '../../../_lib/lookups'
import { requireCapability } from '../../../_lib/session'
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
import { deletePackage, savePackage } from '../actions'

export const dynamic = 'force-dynamic'

export default async function PackageEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireCapability('content.write')
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
        title={pkg ? pick(pkg.name, 'en', pkg.slug) : 'New package'}
        actions={
          <Link className="a-btn ghost" href={adminHref('/packages')}>
            Back to list
          </Link>
        }
      />
      <Flash searchParams={query} />

      <form className="a-form" action={savePackage.bind(null, isNew ? 'new' : id)}>
        <div className="a-card">
          <h2>Identity</h2>
          <div className="a-row">
            <Field label="Slug *" htmlFor="slug">
              <TextInput
                id="slug"
                name="slug"
                defaultValue={pkg?.slug ?? ''}
                required
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
              />
            </Field>
            <Field label="Legacy id" htmlFor="legacyId">
              <TextInput id="legacyId" name="legacyId" defaultValue={pkg?.legacyId ?? ''} />
            </Field>
            <StatusField value={pkg?.status} />
          </div>
        </div>

        <div className="a-card">
          <h2>Copy</h2>
          <LocalizedField name="name" label="Name" value={pkg?.name} required />
          <LocalizedField name="blurb" label="Blurb" value={pkg?.blurb} rows={4} />
        </div>

        <div className="a-card">
          <h2>Commercial</h2>
          <div className="a-row">
            <MoneyField minor={pkg?.priceMinor} currency={pkg?.currency} />
            <Field
              label="Pricing mode"
              htmlFor="pricingMode"
              hint="Flat charges the price as-is; per guest multiplies it by guest count."
            >
              <Select id="pricingMode" name="pricingMode" defaultValue={pkg?.pricingMode ?? 'flat'}>
                <option value="flat">Flat</option>
                <option value="per_guest">Per guest</option>
              </Select>
            </Field>
          </div>
          <div className="a-row">
            <Field label="Days" htmlFor="days">
              <TextInput
                id="days"
                name="days"
                inputMode="numeric"
                defaultValue={String(pkg?.days ?? 1)}
              />
            </Field>
            <Field label="Max guests" htmlFor="maxGuests">
              <TextInput
                id="maxGuests"
                name="maxGuests"
                inputMode="numeric"
                defaultValue={String(pkg?.maxGuests ?? 4)}
              />
            </Field>
            <Checkbox
              name="driverIncluded"
              label="Driver included"
              defaultChecked={pkg?.driverIncluded ?? false}
              hint="Included drivers still consume fleet capacity at checkout."
            />
            <OptionField
              name="heroImageId"
              label="Hero image"
              options={mediaList}
              value={pkg?.heroImageId}
            />
          </div>
          <Field
            label="Amenities"
            htmlFor="amenities"
            hint="One icon name per line. Names the icon set does not have are dropped at render time."
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
          <h2>What is included</h2>
          <LocalizedListField name="included" label="Included" values={pkg?.included} />
          <LocalizedListField name="excluded" label="Not included" values={pkg?.excluded} />
        </div>

        <div className="a-card">
          <h2>Contents</h2>
          <OptionChecklist
            name="activityIds"
            label="Activities"
            options={activities}
            values={selectedActivities.map((row) => row.activityId)}
          />
          <OptionChecklist
            name="regionIds"
            label="Regions"
            options={regions}
            values={selectedRegions.map((row) => row.regionId)}
          />
        </div>

        <div className="a-actions">
          <button className="a-btn" type="submit">
            Save package
          </button>
        </div>
      </form>

      {pkg ? (
        <form className="a-card" action={deletePackage.bind(null, pkg.id)}>
          <h2>Archive</h2>
          <p className="a-hint">Soft delete — historical orders keep their line snapshots.</p>
          <div className="a-actions" style={{ marginBlockStart: 12 }}>
            <button className="a-btn danger" type="submit">
              Archive package
            </button>
          </div>
        </form>
      ) : null}
    </>
  )
}
