import { and, asc, desc, eq, isNull } from 'drizzle-orm'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { db } from '@/db'
import {
  activities,
  activitySupplierOffers,
  activityTiers,
  orderItems,
  orders,
  suppliers,
} from '@/db/schema'
import { can } from '@/lib/auth/roles'
import { pick } from '@/lib/content/localize'
import { formatMoney } from '@/lib/money'
import { formatMoneyInput } from '@/lib/money-input'
import { SUPPLIER_TYPES } from '@/lib/suppliers/assign'

import type { Translate } from '../../../_i18n'
import { adminHref } from '../../../_lib/admin-path'
import { getAdminI18n } from '../../../_lib/i18n'
import { requireCapability } from '../../../_lib/session'
import { Checkbox, Field, Select, TextArea, TextInput } from '../../../_ui/field'
import { Flash } from '../../../_ui/flash'
import { PageHead } from '../../../_ui/shell'
import { Empty, Pill, Table } from '../../../_ui/table'
import { bookingStatusLabel } from '../../orders/labels'
import { deleteSupplier, removeOffer, saveOffer, saveSupplier } from '../actions'

export const dynamic = 'force-dynamic'

type OfferRow = typeof activitySupplierOffers.$inferSelect
type ActivityChoice = { id: string; name: string; tiers: { id: string; name: string }[] }

/** One supplier: details, the activities it offers (with costs), its bookings. */
export default async function SupplierPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requireCapability('orders.read')
  const { t, locale, intl } = await getAdminI18n()
  const { id } = await params
  const query = await searchParams
  const mayWrite = can(session.role, 'suppliers.write')
  const isNew = id === 'new'
  if (isNew && !mayWrite) notFound()

  const supplier = isNew
    ? null
    : ((
        await db
          .select()
          .from(suppliers)
          .where(and(eq(suppliers.id, id), isNull(suppliers.deletedAt)))
          .limit(1)
      )[0] ?? null)
  if (!isNew && !supplier) notFound()

  const [offerRows, activityRows, tierRows, bookings] = await Promise.all([
    supplier
      ? db
          .select()
          .from(activitySupplierOffers)
          .where(eq(activitySupplierOffers.supplierId, supplier.id))
          .orderBy(desc(activitySupplierOffers.priority), asc(activitySupplierOffers.createdAt))
      : Promise.resolve([]),
    db
      .select({ id: activities.id, slug: activities.slug, name: activities.name })
      .from(activities)
      .where(isNull(activities.deletedAt))
      .orderBy(asc(activities.sortOrder), asc(activities.slug)),
    db
      .select({
        id: activityTiers.id,
        activityId: activityTiers.activityId,
        key: activityTiers.key,
        name: activityTiers.name,
      })
      .from(activityTiers)
      .where(isNull(activityTiers.deletedAt))
      .orderBy(asc(activityTiers.sortOrder)),
    supplier
      ? db
          .select({
            id: orderItems.id,
            orderId: orders.id,
            orderNumber: orders.orderNumber,
            name: orderItems.nameSnapshot,
            travelDate: orderItems.travelDate,
            guests: orderItems.guests,
            bookingStatus: orderItems.bookingStatus,
            costMinor: orderItems.costMinor,
            costCurrency: orderItems.costCurrency,
            supplierRef: orderItems.supplierRef,
          })
          .from(orderItems)
          .innerJoin(orders, eq(orders.id, orderItems.orderId))
          .where(eq(orderItems.supplierId, supplier.id))
          .orderBy(desc(orderItems.travelDate))
          .limit(30)
      : Promise.resolve([]),
  ])

  const choices: ActivityChoice[] = activityRows.map((row) => ({
    id: row.id,
    name: pick(row.name, locale, row.slug),
    tiers: tierRows
      .filter((tier) => tier.activityId === row.id)
      .map((tier) => ({ id: tier.id, name: pick(tier.name, locale, tier.key) })),
  }))

  return (
    <>
      <PageHead
        title={supplier ? supplier.name : t('sup.new')}
        description={isNew ? t('sup.new_description') : t('sup.edit_description')}
        actions={
          <Link className="a-btn ghost" href={adminHref('/suppliers')}>
            {t('sup.back')}
          </Link>
        }
      />
      <Flash searchParams={query} />

      <form className="a-form" action={saveSupplier.bind(null, isNew ? 'new' : id)}>
        <fieldset disabled={!mayWrite} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
          <div className="a-card">
            <h2>{t('sup.section_details')}</h2>
            <div className="a-row">
              <Field label={t('sup.name')} htmlFor="name">
                <TextInput id="name" name="name" defaultValue={supplier?.name ?? ''} required />
              </Field>
              <Field label={t('sup.type')} htmlFor="type">
                <Select id="type" name="type" defaultValue={supplier?.type ?? 'activity_company'}>
                  {SUPPLIER_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {t(`sup.type_${type}`)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t('common.status')} htmlFor="status" hint={t('sup.status_hint')}>
                <Select id="status" name="status" defaultValue={supplier?.status ?? 'active'}>
                  <option value="active">{t('sup.status_active')}</option>
                  <option value="paused">{t('sup.status_paused')}</option>
                </Select>
              </Field>
            </div>
            <div className="a-row">
              <Field label={t('sup.contact_person')} htmlFor="contactPerson">
                <TextInput
                  id="contactPerson"
                  name="contactPerson"
                  defaultValue={supplier?.contactPerson ?? ''}
                />
              </Field>
              <Field label={t('common.phone')} htmlFor="phone">
                <TextInput id="phone" name="phone" dir="ltr" defaultValue={supplier?.phone ?? ''} />
              </Field>
              <Field label={t('sup.whatsapp')} htmlFor="whatsapp">
                <TextInput
                  id="whatsapp"
                  name="whatsapp"
                  dir="ltr"
                  defaultValue={supplier?.whatsapp ?? ''}
                />
              </Field>
              <Field label={t('common.email')} htmlFor="email">
                <TextInput
                  id="email"
                  name="email"
                  type="email"
                  dir="ltr"
                  defaultValue={supplier?.email ?? ''}
                />
              </Field>
            </div>
            <Field label={t('sup.address')} htmlFor="address">
              <TextArea
                id="address"
                name="address"
                rows={2}
                defaultValue={supplier?.address ?? ''}
              />
            </Field>
          </div>

          <div className="a-card">
            <h2>{t('sup.section_terms')}</h2>
            <div className="a-row">
              <Field
                label={t('sup.commission')}
                htmlFor="commission"
                hint={t('sup.commission_hint')}
              >
                <TextInput
                  id="commission"
                  name="commission"
                  inputMode="decimal"
                  dir="ltr"
                  defaultValue={
                    supplier?.commissionBps !== null && supplier?.commissionBps !== undefined
                      ? String(supplier.commissionBps / 100)
                      : ''
                  }
                />
              </Field>
              <Field label={t('sup.rating')} htmlFor="rating" hint={t('sup.rating_hint')}>
                <Select id="rating" name="rating" defaultValue={String(supplier?.rating ?? '')}>
                  <option value="">—</option>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={String(n)}>
                      {`${n} / 5`}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field
              label={t('sup.payment_terms')}
              htmlFor="paymentTerms"
              hint={t('sup.payment_terms_hint')}
            >
              <TextArea
                id="paymentTerms"
                name="paymentTerms"
                rows={2}
                defaultValue={supplier?.paymentTerms ?? ''}
              />
            </Field>
            <Field label={t('sup.policy')} htmlFor="policy" hint={t('sup.policy_hint')}>
              <TextArea id="policy" name="policy" rows={3} defaultValue={supplier?.policy ?? ''} />
            </Field>
            <Field label={t('sup.contract_notes')} htmlFor="contractNotes">
              <TextArea
                id="contractNotes"
                name="contractNotes"
                rows={3}
                defaultValue={supplier?.contractNotes ?? ''}
              />
            </Field>
            <Field
              label={t('sup.internal_notes')}
              htmlFor="internalNotes"
              hint={t('sup.internal_notes_hint')}
            >
              <TextArea
                id="internalNotes"
                name="internalNotes"
                rows={3}
                defaultValue={supplier?.internalNotes ?? ''}
              />
            </Field>
          </div>
          {mayWrite ? (
            <div className="a-actions">
              <button className="a-btn" type="submit">
                {t('sup.save')}
              </button>
            </div>
          ) : (
            <p className="a-hint">{t('sup.read_only')}</p>
          )}
        </fieldset>
      </form>

      {supplier ? (
        <div className="a-card" id="offers">
          <h2>{t('sup.offers_title')}</h2>
          <p className="a-hint">{t('sup.offers_hint')}</p>
          {offerRows.length === 0 ? <Empty>{t('sup.offers_empty')}</Empty> : null}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-4)',
              marginBlockStart: 'var(--space-4)',
            }}
          >
            {offerRows.map((offer) =>
              mayWrite ? (
                <OfferForm
                  key={offer.id}
                  supplierId={supplier.id}
                  offer={offer}
                  choices={choices}
                  t={t}
                />
              ) : (
                <OfferSummary key={offer.id} offer={offer} choices={choices} t={t} />
              ),
            )}
            {mayWrite ? (
              activityRows.length === 0 ? (
                <Empty>{t('sup.no_activities')}</Empty>
              ) : (
                <OfferForm supplierId={supplier.id} offer={null} choices={choices} t={t} />
              )
            ) : null}
          </div>
        </div>
      ) : null}

      {supplier ? (
        <div className="a-card">
          <h2>{t('sup.bookings_title')}</h2>
          {bookings.length === 0 ? (
            <Empty>{t('sup.bookings_empty')}</Empty>
          ) : (
            <Table>
              <thead>
                <tr>
                  <th>{t('orders.col_order')}</th>
                  <th>{t('orders.col_item')}</th>
                  <th>{t('orders.col_travel')}</th>
                  <th>{t('orders.col_booking')}</th>
                  <th>{t('sup.supplier_ref')}</th>
                  {mayWrite ? <th className="num">{t('sup.cost')}</th> : null}
                </tr>
              </thead>
              <tbody>
                {bookings.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <Link href={adminHref(`/orders/${row.orderId}`)}>{row.orderNumber}</Link>
                    </td>
                    <td>{pick(row.name, locale, '—')}</td>
                    <td className="a-mono">
                      {row.travelDate ?? '—'}
                      {row.guests !== null
                        ? ` · ${t('orders.guests_count', { count: row.guests })}`
                        : ''}
                    </td>
                    <td>{bookingStatusLabel(t, row.bookingStatus)}</td>
                    <td className="a-mono">{row.supplierRef ?? '—'}</td>
                    {mayWrite ? (
                      <td className="num">
                        {row.costMinor !== null && row.costCurrency
                          ? formatMoney(row.costMinor, row.costCurrency, intl)
                          : '—'}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </div>
      ) : null}

      {supplier && mayWrite ? (
        <form className="a-card" action={deleteSupplier.bind(null, supplier.id)}>
          <h2>{t('sup.delete')}</h2>
          <p className="a-hint">{t('sup.delete_hint')}</p>
          <div className="a-actions" style={{ marginBlockStart: 12 }}>
            <button className="a-btn danger" type="submit">
              {t('sup.delete')}
            </button>
          </div>
        </form>
      ) : null}
    </>
  )
}

function whatValue(offer: Pick<OfferRow, 'activityId' | 'tierId'>): string {
  return offer.tierId ? `${offer.activityId}|${offer.tierId}` : offer.activityId
}

function whatLabel(offer: OfferRow, choices: readonly ActivityChoice[], t: Translate): string {
  const activity = choices.find((choice) => choice.id === offer.activityId)
  const tier = activity?.tiers.find((x) => x.id === offer.tierId)
  return `${activity?.name ?? '—'} — ${tier?.name ?? t('sup.all_packages')}`
}

/** Staff view of an offer: what and how it is confirmed, without the cost. */
function OfferSummary({
  offer,
  choices,
  t,
}: {
  offer: OfferRow
  choices: readonly ActivityChoice[]
  t: Translate
}) {
  return (
    <div className="a-day">
      <div className="a-day-head">
        <div className="a-day-no">{whatLabel(offer, choices, t)}</div>
        {offer.active ? (
          <Pill tone="good">{t('sup.offer_active')}</Pill>
        ) : (
          <Pill tone="warn">{t('sup.offer_off')}</Pill>
        )}
      </div>
      <p className="a-hint">
        {offer.confirmationMode === 'instant'
          ? t('sup.mode_instant')
          : t('sup.mode_needs_hours', { hours: offer.confirmWithinHours })}
        {(offer.timeSlots ?? []).length > 0 ? ` · ${(offer.timeSlots ?? []).join(', ')}` : ''}
      </p>
      {offer.terms ? <p className="a-hint">{offer.terms}</p> : null}
    </div>
  )
}

function OfferForm({
  supplierId,
  offer,
  choices,
  t,
}: {
  supplierId: string
  offer: OfferRow | null
  choices: readonly ActivityChoice[]
  t: Translate
}) {
  const key = offer?.id ?? 'new'
  const currency = offer?.currency ?? 'USD'
  return (
    <form className="a-day" action={saveOffer.bind(null, supplierId, key)}>
      <div className="a-day-head">
        <div className="a-day-no">
          {offer ? whatLabel(offer, choices, t) : t('sup.offer_new')}
          {offer && !offer.active ? <Pill tone="warn">{t('sup.offer_off')}</Pill> : null}
        </div>
        <div className="a-actions">
          <button className="a-btn ghost small" type="submit">
            {offer ? t('sup.offer_save') : t('sup.offer_add')}
          </button>
          {offer ? (
            <button
              className="a-btn danger small"
              type="submit"
              formAction={removeOffer.bind(null, supplierId, offer.id)}
            >
              {t('common.remove')}
            </button>
          ) : null}
        </div>
      </div>
      <Field label={t('sup.offer_what')} htmlFor={`what-${key}`} hint={t('sup.offer_what_hint')}>
        <Select
          id={`what-${key}`}
          name="what"
          defaultValue={offer ? whatValue(offer) : ''}
          required
        >
          {offer ? null : <option value="">{t('sup.offer_pick')}</option>}
          {choices.map((choice) => (
            <optgroup key={choice.id} label={choice.name}>
              <option value={choice.id}>{`${choice.name} — ${t('sup.all_packages')}`}</option>
              {choice.tiers.map((tier) => (
                <option key={tier.id} value={`${choice.id}|${tier.id}`}>
                  {`${choice.name} — ${tier.name}`}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
      </Field>
      <div className="a-row">
        <Field label={t('sup.cost')} htmlFor={`cost-${key}`} hint={t('sup.cost_hint')}>
          <TextInput
            id={`cost-${key}`}
            name="cost"
            inputMode="decimal"
            dir="ltr"
            defaultValue={offer ? formatMoneyInput(offer.costMinor, currency) : ''}
            required
          />
        </Field>
        <Field label={t('common.currency')} htmlFor={`currency-${key}`}>
          <TextInput
            id={`currency-${key}`}
            name="currency"
            maxLength={3}
            dir="ltr"
            defaultValue={currency}
            style={{ textTransform: 'uppercase' }}
            required
          />
        </Field>
        <Field label={t('sup.sell_price')} htmlFor={`sell-${key}`} hint={t('sup.sell_price_hint')}>
          <TextInput
            id={`sell-${key}`}
            name="sellPrice"
            inputMode="decimal"
            dir="ltr"
            defaultValue={
              offer?.sellPriceMinor !== null && offer?.sellPriceMinor !== undefined
                ? formatMoneyInput(offer.sellPriceMinor, currency)
                : ''
            }
          />
        </Field>
      </div>
      <div className="a-row">
        <Field
          label={t('sup.confirmation')}
          htmlFor={`mode-${key}`}
          hint={t('sup.confirmation_hint')}
        >
          <Select
            id={`mode-${key}`}
            name="confirmationMode"
            defaultValue={offer?.confirmationMode ?? 'needs_supplier_confirmation'}
          >
            <option value="needs_supplier_confirmation">{t('sup.mode_needs')}</option>
            <option value="instant">{t('sup.mode_instant')}</option>
          </Select>
        </Field>
        <Field
          label={t('sup.confirm_within')}
          htmlFor={`within-${key}`}
          hint={t('sup.confirm_within_hint')}
        >
          <TextInput
            id={`within-${key}`}
            name="confirmWithinHours"
            type="number"
            min={1}
            dir="ltr"
            defaultValue={String(offer?.confirmWithinHours ?? 24)}
          />
        </Field>
        <Field label={t('sup.lead_time')} htmlFor={`lead-${key}`} hint={t('sup.lead_time_hint')}>
          <TextInput
            id={`lead-${key}`}
            name="leadTimeHours"
            type="number"
            min={0}
            dir="ltr"
            defaultValue={offer?.leadTimeHours ?? ''}
          />
        </Field>
        <Field label={t('sup.priority')} htmlFor={`prio-${key}`} hint={t('sup.priority_hint')}>
          <TextInput
            id={`prio-${key}`}
            name="priority"
            type="number"
            dir="ltr"
            defaultValue={String(offer?.priority ?? 0)}
          />
        </Field>
      </div>
      <Field label={t('sup.time_slots')} htmlFor={`slots-${key}`} hint={t('sup.time_slots_hint')}>
        <TextInput
          id={`slots-${key}`}
          name="timeSlots"
          dir="ltr"
          placeholder="09:00, 14:00"
          defaultValue={(offer?.timeSlots ?? []).join(', ')}
        />
      </Field>
      <Field label={t('sup.terms')} htmlFor={`terms-${key}`} hint={t('sup.terms_hint')}>
        <TextArea id={`terms-${key}`} name="terms" rows={2} defaultValue={offer?.terms ?? ''} />
      </Field>
      <Checkbox
        name="active"
        label={t('sup.offer_active')}
        defaultChecked={offer?.active ?? true}
        hint={t('sup.offer_active_hint')}
      />
    </form>
  )
}
