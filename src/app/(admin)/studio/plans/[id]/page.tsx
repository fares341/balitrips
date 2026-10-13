import { eq } from 'drizzle-orm'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { db } from '@/db'
import { plans } from '@/db/schema'
import { pick } from '@/lib/content/localize'

import { adminHref } from '../../../_lib/admin-path'
import { isUuid } from '../../../_lib/form'
import { getAdminI18n } from '../../../_lib/i18n'
import { requireCapability } from '../../../_lib/session'
import {
  Checkbox,
  Field,
  LocalizedField,
  LocalizedListField,
  MoneyField,
  Select,
  StatusField,
  TextInput,
} from '../../../_ui/field'
import { Flash } from '../../../_ui/flash'
import { PageHead } from '../../../_ui/shell'
import { archivePlan, savePlan } from '../actions'

export const dynamic = 'force-dynamic'

export default async function PlanEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireCapability('config.write')
  const { t, locale } = await getAdminI18n()
  const { id } = await params
  const query = await searchParams
  const isNew = id === 'new'
  if (!isNew && !isUuid(id)) notFound()

  const plan = isNew
    ? null
    : ((await db.select().from(plans).where(eq(plans.id, id)).limit(1))[0] ?? null)
  if (!isNew && !plan) notFound()

  return (
    <>
      <PageHead
        title={plan ? pick(plan.name, locale, plan.slug) : t('plans.new')}
        description={t('plans.edit_description')}
        actions={
          <Link className="a-btn ghost" href={adminHref('/plans')}>
            {t('plans.back')}
          </Link>
        }
      />
      <Flash searchParams={query} />

      <form className="a-form" action={savePlan.bind(null, isNew ? 'new' : id)}>
        <div className="a-card">
          <h2>{t('plans.identity')}</h2>
          <div className="a-row">
            <Field label={t('plans.slug')} htmlFor="slug">
              <TextInput
                id="slug"
                name="slug"
                defaultValue={plan?.slug ?? ''}
                required
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
              />
            </Field>
            <Field label={t('plans.icon')} htmlFor="icon" hint={t('plans.icon_hint')}>
              <TextInput id="icon" name="icon" defaultValue={plan?.icon ?? ''} />
            </Field>
            <Field label={t('common.order')} htmlFor="sortOrder">
              <TextInput
                id="sortOrder"
                name="sortOrder"
                inputMode="numeric"
                defaultValue={String(plan?.sortOrder ?? 0)}
              />
            </Field>
            <StatusField value={plan?.status} />
          </div>
          <LocalizedField name="name" label={t('common.name')} value={plan?.name} required />
          <LocalizedField
            name="description"
            label={t('common.description')}
            value={plan?.description}
            rows={3}
          />
          <LocalizedListField
            name="features"
            label={t('plans.features')}
            values={plan?.features}
            hint={t('plans.features_hint')}
          />
        </div>

        <div className="a-card">
          <h2>{t('plans.price_access')}</h2>
          <div className="a-row">
            <MoneyField minor={plan?.priceMinor} currency={plan?.currency ?? 'USD'} />
            <Field
              label={t('plans.map_access')}
              htmlFor="entitlementKind"
              hint={t('plans.map_access_hint')}
            >
              <Select
                id="entitlementKind"
                name="entitlementKind"
                defaultValue={plan?.entitlementKind ?? 'map_access'}
              >
                <option value="basic">{t('plans.kind_basic')}</option>
                <option value="map_access">{t('plans.kind_map')}</option>
                <option value="vip">{t('plans.kind_vip')}</option>
              </Select>
            </Field>
            <Field
              label={t('plans.duration_days')}
              htmlFor="durationDays"
              hint={t('plans.duration_hint')}
            >
              <TextInput
                id="durationDays"
                name="durationDays"
                inputMode="numeric"
                defaultValue={
                  plan?.durationDays === null || plan?.durationDays === undefined
                    ? ''
                    : String(plan.durationDays)
                }
              />
            </Field>
            <Field label={t('plans.device_limit')} htmlFor="deviceLimit">
              <TextInput
                id="deviceLimit"
                name="deviceLimit"
                inputMode="numeric"
                defaultValue={String(plan?.deviceLimit ?? 2)}
              />
            </Field>
            <Field label={t('plans.members')} htmlFor="maxMembers" hint={t('plans.members_hint')}>
              <TextInput
                id="maxMembers"
                name="maxMembers"
                type="number"
                min={1}
                max={10}
                defaultValue={String(plan?.maxMembers ?? 1)}
              />
            </Field>
          </div>
          <div className="a-row">
            <Checkbox
              name="canUseTrip"
              label={t('plans.can_trip')}
              defaultChecked={plan?.canUseTrip ?? true}
            />
            <Checkbox
              name="canSaveFavorites"
              label={t('plans.can_favorites')}
              defaultChecked={plan?.canSaveFavorites ?? true}
            />
            <Checkbox
              name="canDownloadPdf"
              label={t('plans.can_pdf')}
              defaultChecked={plan?.canDownloadPdf ?? true}
            />
            <Checkbox
              name="featured"
              label={t('plans.featured')}
              defaultChecked={plan?.featured ?? false}
            />
          </div>
        </div>

        <div className="a-actions">
          <button className="a-btn" type="submit">
            {t('plans.save')}
          </button>
        </div>
      </form>

      {plan ? (
        <form className="a-card" action={archivePlan.bind(null, plan.id)}>
          <h2>{t('plans.archive_heading')}</h2>
          <p className="a-hint">{t('plans.archive_hint')}</p>
          <div className="a-actions">
            <button className="a-btn danger" type="submit">
              {t('plans.archive_btn')}
            </button>
          </div>
        </form>
      ) : null}
    </>
  )
}
