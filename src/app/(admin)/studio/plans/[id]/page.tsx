import { eq } from 'drizzle-orm'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { db } from '@/db'
import { plans } from '@/db/schema'
import { pick } from '@/lib/content/localize'

import { adminHref } from '../../../_lib/admin-path'
import { isUuid } from '../../../_lib/form'
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
        title={plan ? pick(plan.name, 'en', plan.slug) : 'New plan'}
        description="Changes apply to new purchases only. Customers who already bought keep the duration and device limit they paid for."
        actions={
          <Link className="a-btn ghost" href={adminHref('/plans')}>
            Back to plans
          </Link>
        }
      />
      <Flash searchParams={query} />

      <form className="a-form" action={savePlan.bind(null, isNew ? 'new' : id)}>
        <div className="a-card">
          <h2>Identity</h2>
          <div className="a-row">
            <Field label="Slug *" htmlFor="slug">
              <TextInput
                id="slug"
                name="slug"
                defaultValue={plan?.slug ?? ''}
                required
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
              />
            </Field>
            <Field label="Icon" htmlFor="icon" hint="pin, gem, star, compass…">
              <TextInput id="icon" name="icon" defaultValue={plan?.icon ?? ''} />
            </Field>
            <Field label="Sort order" htmlFor="sortOrder">
              <TextInput
                id="sortOrder"
                name="sortOrder"
                inputMode="numeric"
                defaultValue={String(plan?.sortOrder ?? 0)}
              />
            </Field>
            <StatusField value={plan?.status} />
          </div>
          <LocalizedField name="name" label="Name" value={plan?.name} required />
          <LocalizedField
            name="description"
            label="Description"
            value={plan?.description}
            rows={3}
          />
          <LocalizedListField
            name="features"
            label="Features"
            values={plan?.features}
            hint="One per line."
          />
        </div>

        <div className="a-card">
          <h2>Price and access</h2>
          <div className="a-row">
            <MoneyField minor={plan?.priceMinor} currency={plan?.currency ?? 'USD'} />
            <Field
              label="Unlocks"
              htmlFor="entitlementKind"
              hint="vip also unlocks everything map_access does."
            >
              <Select
                id="entitlementKind"
                name="entitlementKind"
                defaultValue={plan?.entitlementKind ?? 'map_access'}
              >
                <option value="map_access">map_access — full map</option>
                <option value="vip">vip — map + VIP places + Hidden Gems</option>
              </Select>
            </Field>
            <Field label="Duration (days)" htmlFor="durationDays" hint="Blank = lifetime.">
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
            <Field label="Device limit" htmlFor="deviceLimit">
              <TextInput
                id="deviceLimit"
                name="deviceLimit"
                inputMode="numeric"
                defaultValue={String(plan?.deviceLimit ?? 2)}
              />
            </Field>
            <Field
              label="People on the plan (family)"
              htmlFor="maxMembers"
              hint="1 = one person. More than 1 = a family plan: the buyer adds members by e-mail, each with their own account and devices."
            >
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
              label="Includes My Trip"
              defaultChecked={plan?.canUseTrip ?? true}
            />
            <Checkbox
              name="canSaveFavorites"
              label="Includes favorites"
              defaultChecked={plan?.canSaveFavorites ?? true}
            />
            <Checkbox
              name="canDownloadPdf"
              label="Can download PDFs (off = view in site only)"
              defaultChecked={plan?.canDownloadPdf ?? true}
            />
            <Checkbox
              name="featured"
              label="Featured (“best value” badge)"
              defaultChecked={plan?.featured ?? false}
            />
          </div>
        </div>

        <div className="a-actions">
          <button className="a-btn" type="submit">
            Save plan
          </button>
        </div>
      </form>

      {plan ? (
        <form className="a-card" action={archivePlan.bind(null, plan.id)}>
          <h2>Archive</h2>
          <p className="a-hint">Stops selling it. Nobody loses access they already bought.</p>
          <div className="a-actions">
            <button className="a-btn danger" type="submit">
              Archive plan
            </button>
          </div>
        </form>
      ) : null}
    </>
  )
}
