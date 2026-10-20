import { asc, desc, eq, isNull } from 'drizzle-orm'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { db } from '@/db'
import {
  activities,
  couponRedemptions,
  coupons,
  itineraries,
  orders,
  packages,
  plans,
} from '@/db/schema'
import { pick } from '@/lib/content/localize'
import { COUPON_KINDS } from '@/lib/finance/coupons'
import { formatMoney } from '@/lib/money'
import { formatMoneyInput, formatPercentInput } from '@/lib/money-input'

import { adminHref } from '../../../_lib/admin-path'
import { baliInputValue } from '../../../_lib/bali-time'
import { isUuid } from '../../../_lib/form'
import { getAdminI18n } from '../../../_lib/i18n'
import { requireCapability } from '../../../_lib/session'
import { Checkbox, Field, Select, TextArea, TextInput } from '../../../_ui/field'
import { Flash } from '../../../_ui/flash'
import { PageHead } from '../../../_ui/shell'
import { Empty, Pill, Table, When } from '../../../_ui/table'
import { deleteCoupon, saveCoupon } from '../actions'
import { couponStateOf } from '../labels'

export const dynamic = 'force-dynamic'

/** One discount code: its rules, and every paid order that used it. */
export default async function CouponPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireCapability('discounts.write')
  const { t, intl, locale } = await getAdminI18n()
  const { id } = await params
  const query = await searchParams
  const isNew = id === 'new'
  if (!isNew && !isUuid(id)) notFound()

  const coupon = isNew
    ? null
    : ((await db.select().from(coupons).where(eq(coupons.id, id)).limit(1))[0] ?? null)
  if (!isNew && !coupon) notFound()

  const [activityRows, itineraryRows, packageRows, planRows, redemptions] = await Promise.all([
    db
      .select({ id: activities.id, name: activities.name })
      .from(activities)
      .where(isNull(activities.deletedAt))
      .orderBy(asc(activities.slug)),
    db
      .select({ id: itineraries.id, name: itineraries.name })
      .from(itineraries)
      .where(isNull(itineraries.deletedAt))
      .orderBy(asc(itineraries.slug)),
    db
      .select({ id: packages.id, name: packages.name })
      .from(packages)
      .where(isNull(packages.deletedAt))
      .orderBy(asc(packages.slug)),
    db.select({ id: plans.id, name: plans.name }).from(plans).orderBy(asc(plans.slug)),
    coupon
      ? db
          .select({
            id: couponRedemptions.id,
            discountMinor: couponRedemptions.discountMinor,
            currency: couponRedemptions.currency,
            createdAt: couponRedemptions.createdAt,
            orderId: orders.id,
            orderNumber: orders.orderNumber,
            totalMinor: orders.totalMinor,
            status: orders.status,
          })
          .from(couponRedemptions)
          .innerJoin(orders, eq(orders.id, couponRedemptions.orderId))
          .where(eq(couponRedemptions.couponId, coupon.id))
          .orderBy(desc(couponRedemptions.createdAt))
          .limit(200)
      : Promise.resolve([]),
  ])

  const currency = coupon?.currency ?? ''
  const valueInput =
    coupon === null
      ? ''
      : coupon.type === 'percent'
        ? formatPercentInput(coupon.value)
        : formatMoneyInput(coupon.value, coupon.currency ?? 'USD')
  const items = new Set(coupon?.appliesItems ?? [])
  const kinds = new Set(coupon?.appliesKinds ?? [])
  const name = (value: Parameters<typeof pick>[0]) =>
    pick(value, locale === 'ar' ? 'ar' : 'en', '—')
  const groups: { label: string; rows: { id: string; name: string }[] }[] = [
    {
      label: t('disc.kind_activity'),
      rows: activityRows.map((r) => ({ id: r.id, name: name(r.name) })),
    },
    {
      label: t('disc.kind_itinerary'),
      rows: itineraryRows.map((r) => ({ id: r.id, name: name(r.name) })),
    },
    {
      label: t('disc.kind_package'),
      rows: packageRows.map((r) => ({ id: r.id, name: name(r.name) })),
    },
    { label: t('disc.kind_plan'), rows: planRows.map((r) => ({ id: r.id, name: name(r.name) })) },
  ]

  return (
    <>
      <PageHead
        title={coupon ? coupon.code : t('disc.new')}
        description={t('disc.edit_description')}
        actions={
          <Link className="a-btn ghost" href={adminHref('/discounts')}>
            {t('disc.back')}
          </Link>
        }
      />
      <Flash searchParams={query} />

      {coupon ? (
        <div className="a-grid">
          <div className="a-stat">
            <b>
              <Pill tone={couponStateOf(coupon, new Date()) === 'live' ? 'good' : 'neutral'}>
                {t(`disc.state_${couponStateOf(coupon, new Date())}`)}
              </Pill>
            </b>
            <span>{t('common.status')}</span>
          </div>
          <div className="a-stat">
            <b>{redemptions.length}</b>
            <span>{t('disc.uses')}</span>
          </div>
        </div>
      ) : null}

      <form className="a-card a-form" action={saveCoupon.bind(null, id)}>
        <h2>{t('disc.rules')}</h2>
        <div className="a-row">
          <Field label={t('disc.code')} htmlFor="code" hint={t('disc.code_hint')} required>
            <TextInput
              id="code"
              name="code"
              dir="ltr"
              required
              maxLength={40}
              defaultValue={coupon?.code ?? ''}
              style={{ textTransform: 'uppercase' }}
            />
          </Field>
          <Field label={t('disc.type')} htmlFor="type">
            <Select id="type" name="type" defaultValue={coupon?.type ?? 'percent'}>
              <option value="percent">{t('disc.type_percent')}</option>
              <option value="fixed">{t('disc.type_fixed')}</option>
            </Select>
          </Field>
          <Field label={t('disc.value')} htmlFor="value" hint={t('disc.value_hint')} required>
            <TextInput
              id="value"
              name="value"
              inputMode="decimal"
              dir="ltr"
              required
              defaultValue={valueInput}
            />
          </Field>
          <Field label={t('disc.currency')} htmlFor="currency" hint={t('disc.currency_hint')}>
            <TextInput
              id="currency"
              name="currency"
              maxLength={3}
              dir="ltr"
              defaultValue={currency}
              style={{ textTransform: 'uppercase' }}
            />
          </Field>
        </div>
        <div className="a-row">
          <Field label={t('disc.min_subtotal')} htmlFor="minSubtotal" hint={t('disc.min_hint')}>
            <TextInput
              id="minSubtotal"
              name="minSubtotal"
              inputMode="decimal"
              dir="ltr"
              defaultValue={
                coupon?.minSubtotalMinor
                  ? formatMoneyInput(coupon.minSubtotalMinor, coupon.currency ?? 'USD')
                  : ''
              }
            />
          </Field>
          <Field label={t('disc.valid_from')} htmlFor="validFrom" hint={t('disc.bali_time')}>
            <TextInput
              id="validFrom"
              name="validFrom"
              type="datetime-local"
              dir="ltr"
              defaultValue={baliInputValue(coupon?.validFrom)}
            />
          </Field>
          <Field label={t('disc.valid_to')} htmlFor="validTo" hint={t('disc.bali_time')}>
            <TextInput
              id="validTo"
              name="validTo"
              type="datetime-local"
              dir="ltr"
              defaultValue={baliInputValue(coupon?.validTo)}
            />
          </Field>
        </div>
        <div className="a-row">
          <Field label={t('disc.max_uses')} htmlFor="maxUses" hint={t('disc.max_uses_hint')}>
            <TextInput
              id="maxUses"
              name="maxUses"
              inputMode="numeric"
              dir="ltr"
              defaultValue={coupon?.maxUses ?? ''}
            />
          </Field>
          <Field
            label={t('disc.max_per_customer')}
            htmlFor="maxUsesPerCustomer"
            hint={t('disc.max_per_customer_hint')}
          >
            <TextInput
              id="maxUsesPerCustomer"
              name="maxUsesPerCustomer"
              inputMode="numeric"
              dir="ltr"
              defaultValue={coupon?.maxUsesPerCustomer ?? ''}
            />
          </Field>
        </div>

        <fieldset className="a-fieldset">
          <legend>{t('disc.applies_to')}</legend>
          <label className="a-check">
            <input
              type="radio"
              name="appliesTo"
              value="all"
              defaultChecked={(coupon?.appliesTo ?? 'all') === 'all'}
            />
            {t('disc.applies_all')}
          </label>
          <label className="a-check">
            <input
              type="radio"
              name="appliesTo"
              value="kinds"
              defaultChecked={coupon?.appliesTo === 'kinds'}
            />
            {t('disc.applies_kinds')}
          </label>
          <div className="a-row" style={{ paddingInlineStart: 24 }}>
            {COUPON_KINDS.map((kind) => (
              <label key={kind} className="a-check">
                <input type="checkbox" name="kinds" value={kind} defaultChecked={kinds.has(kind)} />
                {t(`disc.kind_${kind}`)}
              </label>
            ))}
          </div>
          <label className="a-check">
            <input
              type="radio"
              name="appliesTo"
              value="items"
              defaultChecked={coupon?.appliesTo === 'items'}
            />
            {t('disc.applies_items')}
          </label>
          <Field label={t('disc.items')} htmlFor="items" hint={t('disc.items_hint')}>
            <Select
              id="items"
              name="items"
              multiple
              size={10}
              defaultValue={[...items]}
              style={{ maxWidth: '100%' }}
            >
              {groups.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.rows.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
          </Field>
        </fieldset>

        <Checkbox
          name="active"
          label={t('disc.active')}
          hint={t('disc.active_hint')}
          defaultChecked={coupon?.active ?? true}
        />
        <Field label={t('disc.note')} htmlFor="internalNote" hint={t('disc.note_hint')}>
          <TextArea
            id="internalNote"
            name="internalNote"
            rows={2}
            defaultValue={coupon?.internalNote ?? ''}
          />
        </Field>
        <div className="a-actions">
          <button className="a-btn" type="submit">
            {t('disc.save')}
          </button>
        </div>
      </form>

      {coupon ? (
        <div className="a-card">
          <h2>{t('disc.usage_title')}</h2>
          <p className="a-hint">{t('disc.usage_hint')}</p>
          {redemptions.length === 0 ? (
            <Empty>{t('disc.usage_empty')}</Empty>
          ) : (
            <Table>
              <thead>
                <tr>
                  <th>{t('disc.order')}</th>
                  <th>{t('disc.used_at')}</th>
                  <th className="num">{t('disc.discount_given')}</th>
                  <th className="num">{t('disc.order_total')}</th>
                </tr>
              </thead>
              <tbody>
                {redemptions.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <Link className="a-mono" href={adminHref(`/orders/${row.orderId}`)}>
                        {row.orderNumber}
                      </Link>
                    </td>
                    <td>
                      <When value={row.createdAt} />
                    </td>
                    <td className="num">{formatMoney(row.discountMinor, row.currency, intl)}</td>
                    <td className="num">{formatMoney(row.totalMinor, row.currency, intl)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
          {redemptions.length === 0 ? (
            <form action={deleteCoupon.bind(null, coupon.id)} style={{ marginBlockStart: 12 }}>
              <button className="a-btn danger" type="submit">
                {t('disc.delete')}
              </button>
            </form>
          ) : null}
        </div>
      ) : null}
    </>
  )
}
