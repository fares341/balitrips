import { and, asc, eq, isNull } from 'drizzle-orm'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { db } from '@/db'
import { activities, activityAddonLinks, addonsLibrary } from '@/db/schema'
import { can } from '@/lib/auth/roles'
import { pick } from '@/lib/content/localize'

import { adminHref } from '../../../_lib/admin-path'
import { getAdminI18n } from '../../../_lib/i18n'
import { requireCapability } from '../../../_lib/session'
import {
  Checkbox,
  Field,
  LocalizedField,
  MoneyField,
  PriceSelect,
  priceInputProps,
  TextInput,
} from '../../../_ui/field'
import { AddonPricingOptions, AddonRuleFields } from '../../../_ui/addon-extras'
import { Flash } from '../../../_ui/flash'
import { loadPickerMedia, MediaPicker } from '../../../_ui/media-picker'
import { PageHead } from '../../../_ui/shell'
import { deleteLibraryAddon, saveLibraryAddon } from '../actions'

export const dynamic = 'force-dynamic'

/** One extra of the library, on its own page (new or existing). */
export default async function LibraryAddonPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requireCapability('content.write')
  // Phase 6: without `prices.write` the price fields are read-only.
  const locked = !can(session.role, 'prices.write')
  const { t, locale } = await getAdminI18n()
  const { id } = await params
  const query = await searchParams
  const isNew = id === 'new'

  const addon = isNew
    ? null
    : ((
        await db
          .select()
          .from(addonsLibrary)
          .where(and(eq(addonsLibrary.id, id), isNull(addonsLibrary.deletedAt)))
          .limit(1)
      )[0] ?? null)
  if (!isNew && !addon) notFound()

  const [mediaList, usedBy, others] = await Promise.all([
    loadPickerMedia(),
    addon
      ? db
          .select({ id: activities.id, slug: activities.slug, name: activities.name })
          .from(activityAddonLinks)
          .innerJoin(activities, eq(activities.id, activityAddonLinks.activityId))
          .where(and(eq(activityAddonLinks.addonId, addon.id), isNull(activities.deletedAt)))
          .orderBy(asc(activities.sortOrder))
      : Promise.resolve([]),
    db
      .select({ id: addonsLibrary.id, name: addonsLibrary.name })
      .from(addonsLibrary)
      .where(isNull(addonsLibrary.deletedAt))
      .orderBy(asc(addonsLibrary.sortOrder)),
  ])

  return (
    <>
      <PageHead
        title={addon ? pick(addon.name, locale) : t('addons.new')}
        description={isNew ? t('addons.new_description') : t('addons.description')}
        actions={
          <Link className="a-btn ghost" href={adminHref('/addons')}>
            {t('addons.back')}
          </Link>
        }
      />
      <Flash searchParams={query} />

      <form className="a-form" action={saveLibraryAddon.bind(null, isNew ? 'new' : id)}>
        <div className="a-card">
          <LocalizedField name="name" label={t('addons.name')} value={addon?.name} required />
          <LocalizedField
            name="description"
            label={t('addons.desc')}
            value={addon?.description}
            rows={2}
          />
          <div className="a-row">
            <MoneyField minor={addon?.priceMinor} currency={addon?.currency} locked={locked} />
          </div>
          <LocalizedField
            name="unitLabel"
            label={t('addons.unit_label')}
            value={addon?.unitLabel}
            hint={t('addons.unit_label_hint')}
          />
          <div className="a-row">
            <Field label={t('addons.pricing')} htmlFor="pricing">
              <PriceSelect
                id="pricing"
                name="pricing"
                defaultValue={addon?.pricing ?? 'per_booking'}
                locked={locked}
              >
                <AddonPricingOptions />
              </PriceSelect>
            </Field>
            <Field label={t('addons.max_qty')} htmlFor="maxQty" hint={t('addons.max_qty_hint')}>
              <TextInput
                id="maxQty"
                name="maxQty"
                type="number"
                min={1}
                dir="ltr"
                defaultValue={addon?.maxQty ?? ''}
                {...priceInputProps(locked)}
              />
            </Field>
            <Field label={t('addons.sort_order')} htmlFor="sortOrder">
              <TextInput
                id="sortOrder"
                name="sortOrder"
                inputMode="numeric"
                dir="ltr"
                defaultValue={String(addon?.sortOrder ?? 0)}
              />
            </Field>
          </div>
          <AddonRuleFields
            idPrefix="lib"
            tiers={addon?.priceTiers}
            currency={addon?.currency ?? 'USD'}
            incompatible={others
              .filter((other) => other.id !== addon?.id)
              .map((other) => ({ value: other.id, label: pick(other.name, locale) }))}
            values={addon?.incompatibleWith}
            locked={locked}
          />
          <Checkbox
            name="available"
            label={t('addons.available')}
            defaultChecked={addon?.available ?? true}
            hint={t('addons.available_hint')}
          />
          <MediaPicker
            name="imageId"
            label={t('addons.image')}
            items={mediaList}
            value={addon?.imageId}
          />
        </div>
        <div className="a-actions">
          <button className="a-btn" type="submit">
            {t('addons.save')}
          </button>
        </div>
      </form>

      {addon ? (
        <div className="a-card">
          <h2>{t('addons.used_by')}</h2>
          {usedBy.length === 0 ? (
            <p className="a-hint">{t('addons.used_none')}</p>
          ) : (
            <ul>
              {usedBy.map((row) => (
                <li key={row.id}>
                  <Link href={adminHref(`/activities/${row.id}?tab=addons`)}>
                    {pick(row.name, locale, row.slug)}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {addon ? (
        <form className="a-card" action={deleteLibraryAddon.bind(null, addon.id)}>
          <h2>{t('addons.delete')}</h2>
          <p className="a-hint">{t('addons.delete_hint')}</p>
          <div className="a-actions" style={{ marginBlockStart: 12 }}>
            <button className="a-btn danger" type="submit">
              {t('addons.delete')}
            </button>
          </div>
        </form>
      ) : null}
    </>
  )
}
