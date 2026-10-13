'use server'

import { eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'

import { db } from '@/db'
import { packageActivities, packageRegions, packages } from '@/db/schema'

import { adminHref } from '../../_lib/admin-path'
import { writeAudit } from '../../_lib/audit'
import {
  fbool,
  fcurrency,
  fenum,
  fint,
  flines,
  flocalizedList,
  flocalizedOrNull,
  flocalizedRequired,
  fminor,
  fmulti,
  freq,
  fstr,
  fuuidOrNull,
} from '../../_lib/form'
import { getAdminI18n } from '../../_lib/i18n'
import { errorMessage, isRedirectError, withOutcome } from '../../_lib/result'
import { requireCapability } from '../../_lib/session'
import { assertSlug } from '../../_lib/slug'

const LIST = adminHref('/packages')

type Outcome = { ok: string } | { err: string }

export async function savePackage(id: string, form: FormData): Promise<void> {
  const session = await requireCapability('content.write')
  const { t } = await getAdminI18n()

  let target = id === 'new' ? LIST : adminHref(`/packages/${id}`)
  let outcome: Outcome

  try {
    const status = form.get('status') === 'published' ? 'published' : 'draft'
    if (status === 'published') await requireCapability('content.publish')

    const values = {
      slug: assertSlug(freq(form, 'slug', t('packages.f_slug'))),
      legacyId: fstr(form, 'legacyId'),
      name: flocalizedRequired(form, 'name', t('packages.f_name')),
      blurb: flocalizedOrNull(form, 'blurb'),
      days: fint(form, 'days', 1, t('packages.days')),
      maxGuests: fint(form, 'maxGuests', 1, t('packages.max_guests')),
      driverIncluded: fbool(form, 'driverIncluded'),
      priceMinor: fminor(form, 'priceMinor', t('common.price')),
      currency: fcurrency(form, 'currency'),
      // The prototype advertised "from $X" and then charged a flat X no
      // matter how many guests were entered. This makes the intent explicit
      // instead of leaving the contradiction in the renderer.
      pricingMode: fenum(form, 'pricingMode', ['flat', 'per_guest'] as const, 'flat'),
      amenities: flines(form, 'amenities'),
      included: flocalizedList(form, 'included'),
      excluded: flocalizedList(form, 'excluded'),
      heroImageId: fuuidOrNull(form, 'heroImageId', t('packages.hero_image')),
      status,
    }

    if (values.days < 1) throw new Error(t('packages.err_days_min'))
    if (values.maxGuests < 1) throw new Error(t('packages.err_max_guests_min'))

    const activityIds = fmulti(form, 'activityIds')
    const regionIds = fmulti(form, 'regionIds')

    const savedId = await db.transaction(async (tx) => {
      const before =
        id === 'new'
          ? null
          : ((await tx.select().from(packages).where(eq(packages.id, id)).limit(1))[0] ?? null)

      if (id !== 'new' && !before) throw new Error(t('packages.err_gone'))

      const [row] =
        id === 'new'
          ? await tx
              .insert(packages)
              .values({ ...values, publishedAt: status === 'published' ? new Date() : null })
              .returning()
          : await tx
              .update(packages)
              .set({
                ...values,
                publishedAt:
                  status === 'published'
                    ? (before?.publishedAt ?? new Date())
                    : (before?.publishedAt ?? null),
              })
              .where(eq(packages.id, id))
              .returning()

      if (!row) throw new Error(t('packages.err_save_failed'))

      await tx.delete(packageActivities).where(eq(packageActivities.packageId, row.id))
      if (activityIds.length > 0) {
        await tx.insert(packageActivities).values(
          activityIds.map((activityId, index) => ({
            packageId: row.id,
            activityId,
            sortOrder: index,
          })),
        )
      }

      await tx.delete(packageRegions).where(eq(packageRegions.packageId, row.id))
      if (regionIds.length > 0) {
        await tx
          .insert(packageRegions)
          .values(regionIds.map((regionId) => ({ packageId: row.id, regionId })))
      }

      await writeAudit(
        {
          actor: session,
          action: id === 'new' ? 'package.create' : 'package.update',
          entityType: 'package',
          entityId: row.id,
          before,
          after: { ...row, activityIds, regionIds },
        },
        tx,
      )

      return row.id
    })

    target = adminHref(`/packages/${savedId}`)
    outcome = { ok: t('packages.ok_saved') }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }

  redirect(withOutcome(target, outcome))
}

export async function setPackageStatus(id: string, status: string): Promise<void> {
  const session = await requireCapability('content.publish')
  const { t } = await getAdminI18n()
  let outcome: Outcome

  try {
    const next = status === 'published' ? 'published' : 'draft'

    await db.transaction(async (tx) => {
      const [before] = await tx.select().from(packages).where(eq(packages.id, id)).limit(1)
      if (!before) throw new Error(t('packages.err_gone'))

      const [after] = await tx
        .update(packages)
        .set({
          status: next,
          publishedAt:
            next === 'published' ? (before.publishedAt ?? new Date()) : before.publishedAt,
        })
        .where(eq(packages.id, id))
        .returning()

      await writeAudit(
        {
          actor: session,
          action: next === 'published' ? 'package.publish' : 'package.unpublish',
          entityType: 'package',
          entityId: id,
          before,
          after: after ?? null,
        },
        tx,
      )
    })

    outcome = {
      ok: next === 'published' ? t('packages.ok_published') : t('packages.ok_drafted'),
    }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }

  redirect(withOutcome(LIST, outcome))
}

export async function deletePackage(id: string): Promise<void> {
  const session = await requireCapability('content.write')
  const { t } = await getAdminI18n()
  let outcome: Outcome

  try {
    await db.transaction(async (tx) => {
      const [before] = await tx.select().from(packages).where(eq(packages.id, id)).limit(1)
      if (!before) throw new Error(t('packages.err_gone'))

      await tx
        .update(packages)
        .set({ deletedAt: new Date(), status: 'draft' })
        .where(eq(packages.id, id))

      await writeAudit(
        {
          actor: session,
          action: 'package.delete',
          entityType: 'package',
          entityId: id,
          before,
          after: { deletedAt: new Date().toISOString(), status: 'draft' },
        },
        tx,
      )
    })

    outcome = { ok: t('packages.ok_archived') }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }

  redirect(withOutcome(LIST, outcome))
}
