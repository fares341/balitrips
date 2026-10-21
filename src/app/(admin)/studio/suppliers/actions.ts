'use server'

import { and, eq, isNull } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { db } from '@/db'
import { activitySupplierOffers, activityTiers, suppliers } from '@/db/schema'
import { CONFIRMATION_MODES, SUPPLIER_TYPES } from '@/lib/suppliers/assign'
import { assertPriceChangeAllowed } from '@/lib/auth/price-guard'

import { adminHref } from '../../_lib/admin-path'
import { writeAudit } from '../../_lib/audit'
import {
  fbool,
  fcurrency,
  fcurrencyOr,
  fenum,
  fint,
  fintOrNull,
  fmoney,
  fmoneyOrNull,
  fpercent,
  freq,
  fstr,
  isUuid,
} from '../../_lib/form'
import { getAdminI18n } from '../../_lib/i18n'
import { errorMessage, isRedirectError, withOutcome } from '../../_lib/result'
import { requireCapability } from '../../_lib/session'

type Outcome = { ok: string } | { err: string }

const LIST = adminHref('/suppliers')
const page = (id: string) => adminHref(`/suppliers/${id}`)

/** The customer page shows "confirmed within N hours" from the offers. */
function refreshPublic(): void {
  revalidatePath('/[locale]/activities/[slug]', 'page')
}

function text(form: FormData, name: string, max: number): string | null {
  const value = (fstr(form, name) ?? '').trim()
  return value === '' ? null : value.slice(0, max)
}

/** Create (`id = 'new'`) or update a supplier. */
export async function saveSupplier(id: string, form: FormData): Promise<void> {
  const session = await requireCapability('suppliers.write')
  const { t } = await getAdminI18n()
  let target = id === 'new' ? adminHref('/suppliers/new') : page(id)
  let outcome: Outcome

  try {
    const name = freq(form, 'name', t('sup.name')).trim().slice(0, 160)
    if (name === '') throw new Error(t('sup.err_name'))
    const email = text(form, 'email', 256)
    if (email !== null && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error(t('sup.err_email'))
    }
    const rating = fintOrNull(form, 'rating', t('sup.rating'))
    if (rating !== null && (rating < 1 || rating > 5)) throw new Error(t('sup.err_rating'))
    const commission = text(form, 'commission', 16)
    const commissionBps =
      commission === null ? null : fpercent(form, 'commission', 0, t('sup.commission'))
    if (commissionBps !== null && commissionBps > 10_000) throw new Error(t('sup.err_commission'))

    const values = {
      name,
      type: fenum(form, 'type', SUPPLIER_TYPES, 'activity_company'),
      contactPerson: text(form, 'contactPerson', 160),
      phone: text(form, 'phone', 48),
      whatsapp: text(form, 'whatsapp', 48),
      email,
      address: text(form, 'address', 2000),
      contractNotes: text(form, 'contractNotes', 5000),
      commissionBps,
      paymentTerms: text(form, 'paymentTerms', 2000),
      policy: text(form, 'policy', 5000),
      status: fenum(form, 'status', ['active', 'paused'] as const, 'active'),
      internalNotes: text(form, 'internalNotes', 5000),
      rating,
    }

    const savedId = await db.transaction(async (tx) => {
      const before =
        id === 'new'
          ? null
          : ((
              await tx
                .select()
                .from(suppliers)
                .where(and(eq(suppliers.id, id), isNull(suppliers.deletedAt)))
                .limit(1)
            )[0] ?? null)
      if (id !== 'new' && !before) throw new Error(t('sup.err_gone'))
      const [row] =
        id === 'new'
          ? await tx.insert(suppliers).values(values).returning()
          : await tx
              .update(suppliers)
              .set({ ...values, updatedAt: new Date() })
              .where(eq(suppliers.id, id))
              .returning()
      if (!row) throw new Error(t('sup.err_gone'))
      await writeAudit(
        {
          actor: session,
          action: id === 'new' ? 'supplier.create' : 'supplier.update',
          entityType: 'supplier',
          entityId: row.id,
          before,
          after: row,
        },
        tx,
      )
      return row.id
    })
    target = page(savedId)
    outcome = { ok: t('sup.ok_saved') }
    refreshPublic()
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  redirect(withOutcome(target, outcome))
}

/**
 * Remove a supplier from the list. Soft: bookings it ran and payments made to
 * it keep their history; its offers are switched off so it is never chosen.
 */
export async function deleteSupplier(id: string): Promise<void> {
  const session = await requireCapability('suppliers.write')
  const { t } = await getAdminI18n()
  let outcome: Outcome
  try {
    await db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(suppliers)
        .where(and(eq(suppliers.id, id), isNull(suppliers.deletedAt)))
        .limit(1)
      if (!before) throw new Error(t('sup.err_gone'))
      await tx
        .update(suppliers)
        .set({ deletedAt: new Date(), status: 'paused', updatedAt: new Date() })
        .where(eq(suppliers.id, id))
      await tx
        .update(activitySupplierOffers)
        .set({ active: false, updatedAt: new Date() })
        .where(eq(activitySupplierOffers.supplierId, id))
      await writeAudit(
        {
          actor: session,
          action: 'supplier.delete',
          entityType: 'supplier',
          entityId: id,
          before,
          after: null,
        },
        tx,
      )
    })
    outcome = { ok: t('sup.ok_deleted') }
    refreshPublic()
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  redirect(withOutcome(LIST, outcome))
}

/** Time slots typed as "09:00, 14:30" (any separator). */
function slotsFrom(form: FormData, t: (key: string) => string): string[] {
  const raw = fstr(form, 'timeSlots') ?? ''
  const parts = raw
    .split(/[\s,،;]+/)
    .map((part) => part.trim())
    .filter((part) => part !== '')
  const out: string[] = []
  for (const part of parts) {
    const match = /^(\d{1,2}):(\d{2})$/.exec(part)
    if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) {
      throw new Error(t('sup.err_slots'))
    }
    out.push(`${match[1]?.padStart(2, '0')}:${match[2]}`)
  }
  return [...new Set(out)].sort()
}

/**
 * Create (`offerId = 'new'`) or update one offer of a supplier. The activity
 * (and package) comes from one select: `activityId` or `activityId|tierId`.
 */
export async function saveOffer(
  supplierId: string,
  offerId: string,
  form: FormData,
): Promise<void> {
  const session = await requireCapability('suppliers.write')
  const { t } = await getAdminI18n()
  let outcome: Outcome

  try {
    const what = (fstr(form, 'what') ?? '').split('|')
    const activityId = what[0] ?? ''
    const tierId = what[1] ?? null
    if (!isUuid(activityId) || (tierId !== null && !isUuid(tierId))) {
      throw new Error(t('sup.err_offer_activity'))
    }
    if (tierId !== null) {
      const [tier] = await db
        .select({ activityId: activityTiers.activityId })
        .from(activityTiers)
        .where(eq(activityTiers.id, tierId))
        .limit(1)
      if (!tier || tier.activityId !== activityId) throw new Error(t('sup.err_offer_activity'))
    }
    const currency = fcurrency(form, 'currency')
    const costMinor = fmoney(form, 'cost', fcurrencyOr(form, 'currency'), t('sup.cost'))
    const sellPriceMinor = fmoneyOrNull(form, 'sellPrice', currency, t('sup.sell_price'))
    const confirmWithinHours = fint(form, 'confirmWithinHours', 24, t('sup.confirm_within'))
    if (confirmWithinHours < 1 || confirmWithinHours > 720) throw new Error(t('sup.err_hours'))
    const leadTimeHours = fintOrNull(form, 'leadTimeHours', t('sup.lead_time'))
    if (leadTimeHours !== null && (leadTimeHours < 0 || leadTimeHours > 2160)) {
      throw new Error(t('sup.err_hours'))
    }
    const values = {
      supplierId,
      activityId,
      tierId,
      costMinor,
      currency,
      sellPriceMinor,
      timeSlots: slotsFrom(form, t),
      terms: text(form, 'terms', 5000),
      confirmationMode: fenum(
        form,
        'confirmationMode',
        CONFIRMATION_MODES,
        'needs_supplier_confirmation',
      ),
      confirmWithinHours,
      leadTimeHours,
      active: fbool(form, 'active'),
      priority: fint(form, 'priority', 0, t('sup.priority')),
    }

    await db.transaction(async (tx) => {
      const [supplier] = await tx
        .select({ id: suppliers.id })
        .from(suppliers)
        .where(and(eq(suppliers.id, supplierId), isNull(suppliers.deletedAt)))
        .limit(1)
      if (!supplier) throw new Error(t('sup.err_gone'))
      const before =
        offerId === 'new'
          ? null
          : ((
              await tx
                .select()
                .from(activitySupplierOffers)
                .where(
                  and(
                    eq(activitySupplierOffers.id, offerId),
                    eq(activitySupplierOffers.supplierId, supplierId),
                  ),
                )
                .limit(1)
            )[0] ?? null)
      if (offerId !== 'new' && !before) throw new Error(t('sup.err_offer_gone'))
      // Phase 6: without `prices.write` the price must come back as stored.
      assertPriceChangeAllowed(
        session.role,
        before,
        values,
        before ? ['costMinor', 'currency', 'sellPriceMinor'] : ['costMinor', 'sellPriceMinor'],
        t('team.err_prices'),
      )
      const [row] =
        offerId === 'new'
          ? await tx.insert(activitySupplierOffers).values(values).returning()
          : await tx
              .update(activitySupplierOffers)
              .set({ ...values, updatedAt: new Date() })
              .where(eq(activitySupplierOffers.id, offerId))
              .returning()
      if (!row) throw new Error(t('sup.err_offer_gone'))
      await writeAudit(
        {
          actor: session,
          action: offerId === 'new' ? 'supplier_offer.create' : 'supplier_offer.update',
          entityType: 'supplier_offer',
          entityId: row.id,
          before,
          after: row,
        },
        tx,
      )
    })
    outcome = { ok: t('sup.ok_offer_saved') }
    refreshPublic()
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  redirect(withOutcome(`${page(supplierId)}#offers`, outcome))
}

/** Delete an offer. Bookings already given to it keep their supplier and cost. */
export async function removeOffer(supplierId: string, offerId: string): Promise<void> {
  const session = await requireCapability('suppliers.write')
  const { t } = await getAdminI18n()
  let outcome: Outcome
  try {
    await db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(activitySupplierOffers)
        .where(
          and(
            eq(activitySupplierOffers.id, offerId),
            eq(activitySupplierOffers.supplierId, supplierId),
          ),
        )
        .limit(1)
      if (!before) throw new Error(t('sup.err_offer_gone'))
      await tx.delete(activitySupplierOffers).where(eq(activitySupplierOffers.id, offerId))
      await writeAudit(
        {
          actor: session,
          action: 'supplier_offer.delete',
          entityType: 'supplier_offer',
          entityId: offerId,
          before,
          after: null,
        },
        tx,
      )
    })
    outcome = { ok: t('sup.ok_offer_removed') }
    refreshPublic()
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  redirect(withOutcome(`${page(supplierId)}#offers`, outcome))
}
