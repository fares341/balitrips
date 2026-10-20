'use server'

import { and, eq, isNull } from 'drizzle-orm'
import { redirect } from 'next/navigation'

import { db } from '@/db'
import {
  activitySupplierOffers,
  externalProductMappings,
  integrationImports,
  supplierIntegrations,
  suppliers,
} from '@/db/schema'
import {
  canSync,
  ENVIRONMENTS,
  isConnectionType,
  SERVICES,
  type ConnectionType,
} from '@/lib/integrations/adapter'
import { integrationsKeyStatus, lastFour, openJson, sealJson } from '@/lib/integrations/crypto'
import {
  CONFLICT_POLICIES,
  CSV_MAX_BYTES,
  isConflictPolicy,
  readImportRows,
} from '@/lib/integrations/csv'
import { applyImport } from '@/lib/integrations/imports'
import { adapterFor, isImplemented } from '@/lib/integrations/registry'
import { logIntegration } from '@/lib/integrations/service'
import { generateWebhookSecret } from '@/lib/integrations/webhook'
import { enqueueIntegrationSync } from '@/worker/queues'

import { adminHref } from '../../_lib/admin-path'
import { writeAudit } from '../../_lib/audit'
import { fenum, fint, fintOrNull, fstr, fuuid, isUuid } from '../../_lib/form'
import { getAdminI18n } from '../../_lib/i18n'
import { errorMessage, isRedirectError, localizeMessage, withOutcome } from '../../_lib/result'
import { requireCapability } from '../../_lib/session'
import type { Translate } from '../../_i18n'
import type { WebhookSecretState } from './contract'

/**
 * Studio → Integrations (Phase 6). Admin only (`integrations.write`), every
 * change audited. Secrets go in, never out: the browser receives "saved" and
 * the last four characters, and the one exception — a NEW webhook signing
 * secret, which the supplier must be given — is returned once to the page
 * that asked for it (`createWebhookSecret`), never in a URL.
 */

type Outcome = { ok: string } | { err: string }

const LIST = adminHref('/integrations')
const detail = (id: string) => adminHref(`/integrations/${id}`)

const FIELD_NAME = /^[a-z][a-z0-9_]{0,39}$/

function assertKey(t: Translate): void {
  const status = integrationsKeyStatus()
  if (status !== 'ok') throw new Error(t(`int.err_key_${status}`))
}

async function loadIntegration(id: string, t: Translate) {
  if (!isUuid(id)) throw new Error(t('int.err_gone'))
  const [row] = await db
    .select()
    .from(supplierIntegrations)
    .where(eq(supplierIntegrations.id, id))
    .limit(1)
  if (!row) throw new Error(t('int.err_gone'))
  return row
}

/** Audit-safe view of a row: no sealed columns. */
function auditView(row: typeof supplierIntegrations.$inferSelect) {
  return {
    name: row.name,
    connectionType: row.connectionType,
    environment: row.environment,
    status: row.status,
    services: row.services,
    conflictPolicy: row.conflictPolicy,
    retryLimit: row.retryLimit,
    retryDelaySeconds: row.retryDelaySeconds,
    rateLimitPerMinute: row.rateLimitPerMinute,
    credentialFields: Object.keys(row.credentialsHint ?? {}),
    webhookSecret: row.webhookSecretHint ? 'set' : 'none',
  }
}

export async function createIntegration(form: FormData): Promise<void> {
  const session = await requireCapability('integrations.write')
  const { t } = await getAdminI18n()
  let outcome: Outcome
  let target = LIST
  try {
    const supplierId = fuuid(form, 'supplierId', t('int.supplier'))
    const name = (fstr(form, 'name') ?? '').trim().slice(0, 120)
    if (name === '') throw new Error(t('int.err_name'))
    const type = fstr(form, 'connectionType') ?? ''
    if (!isConnectionType(type)) throw new Error(t('int.err_type'))
    const [supplier] = await db
      .select({ id: suppliers.id })
      .from(suppliers)
      .where(and(eq(suppliers.id, supplierId), isNull(suppliers.deletedAt)))
      .limit(1)
    if (!supplier) throw new Error(t('int.err_supplier'))

    const row = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(supplierIntegrations)
        .values({
          supplierId,
          name,
          connectionType: type,
          environment: 'sandbox',
          // Everything starts paused; a person turns it on.
          status: 'paused',
          services: type === 'csv' ? ['products', 'prices', 'availability'] : ['bookings'],
          createdBy: session.userId,
        })
        .returning()
      if (!created) throw new Error(t('int.err_gone'))
      await writeAudit(
        {
          actor: session,
          action: 'integration.create',
          entityType: 'integration',
          entityId: created.id,
          before: null,
          after: auditView(created),
        },
        tx,
      )
      return created
    })
    target = detail(row.id)
    outcome = { ok: t('int.ok_created') }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  redirect(withOutcome(target, outcome))
}

export async function saveIntegrationSettings(id: string, form: FormData): Promise<void> {
  const session = await requireCapability('integrations.write')
  const { t } = await getAdminI18n()
  let outcome: Outcome
  try {
    const before = await loadIntegration(id, t)
    const name = (fstr(form, 'name') ?? '').trim().slice(0, 120)
    if (name === '') throw new Error(t('int.err_name'))
    const services = SERVICES.filter((service) => form.get(`service_${service}`) === 'on')
    const tokenText = fstr(form, 'tokenExpiresAt')
    const tokenExpiresAt =
      tokenText && /^\d{4}-\d{2}-\d{2}$/.test(tokenText) ? new Date(`${tokenText}T00:00:00Z`) : null
    const retryLimit = fint(form, 'retryLimit', 5, t('int.retry_limit'))
    const retryDelaySeconds = fint(form, 'retryDelaySeconds', 60, t('int.retry_delay'))
    if (retryLimit < 0 || retryLimit > 20) throw new Error(t('int.err_retry_limit'))
    if (retryDelaySeconds < 5 || retryDelaySeconds > 3600) throw new Error(t('int.err_retry_delay'))
    const rateLimitPerMinute = fintOrNull(form, 'rateLimitPerMinute', t('int.rate_limit'))
    if (rateLimitPerMinute !== null && (rateLimitPerMinute < 1 || rateLimitPerMinute > 100_000)) {
      throw new Error(t('int.err_rate_limit'))
    }

    const values = {
      name,
      environment: fenum(form, 'environment', ENVIRONMENTS, 'sandbox'),
      conflictPolicy: fenum(form, 'conflictPolicy', CONFLICT_POLICIES, 'flag'),
      services,
      retryLimit,
      retryDelaySeconds,
      rateLimitPerMinute,
      rateLimitNote: (fstr(form, 'rateLimitNote') ?? '').trim().slice(0, 200) || null,
      tokenExpiresAt,
      notes: (fstr(form, 'notes') ?? '').trim().slice(0, 4000) || null,
      updatedAt: new Date(),
    }
    await db.transaction(async (tx) => {
      const [after] = await tx
        .update(supplierIntegrations)
        .set(values)
        .where(eq(supplierIntegrations.id, id))
        .returning()
      await writeAudit(
        {
          actor: session,
          action: 'integration.update',
          entityType: 'integration',
          entityId: id,
          before: auditView(before),
          after: after ? auditView(after) : null,
        },
        tx,
      )
    })
    outcome = { ok: t('int.ok_saved') }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  redirect(withOutcome(detail(id), outcome))
}

/** Turn a connection on or pause it. Pausing keeps everything; nothing runs. */
export async function setIntegrationStatus(id: string, form: FormData): Promise<void> {
  const session = await requireCapability('integrations.write')
  const { t } = await getAdminI18n()
  let outcome: Outcome
  try {
    const before = await loadIntegration(id, t)
    const next = form.get('status') === 'active' ? 'active' : 'paused'
    if (
      next === 'active' &&
      isConnectionType(before.connectionType) &&
      !isImplemented(before.connectionType)
    ) {
      throw new Error(t('int.err_needs_developer'))
    }
    await db.transaction(async (tx) => {
      await tx
        .update(supplierIntegrations)
        .set({
          status: next,
          ...(next === 'active' ? { consecutiveFailures: 0 } : {}),
          updatedAt: new Date(),
        })
        .where(eq(supplierIntegrations.id, id))
      await writeAudit(
        {
          actor: session,
          action: next === 'active' ? 'integration.activate' : 'integration.pause',
          entityType: 'integration',
          entityId: id,
          before: { status: before.status },
          after: { status: next },
        },
        tx,
      )
    })
    outcome = { ok: t(next === 'active' ? 'int.ok_activated' : 'int.ok_paused') }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  redirect(withOutcome(detail(id), outcome))
}

/**
 * Save (or replace) one key. The value is sealed with INTEGRATIONS_KEY and
 * merged with the other stored keys; only its last four characters are kept
 * readable. Without a valid INTEGRATIONS_KEY nothing is saved.
 */
export async function saveCredential(id: string, form: FormData): Promise<void> {
  const session = await requireCapability('integrations.write')
  const { t } = await getAdminI18n()
  let outcome: Outcome
  try {
    assertKey(t)
    const field = (fstr(form, 'field') ?? '').trim().toLowerCase()
    if (!FIELD_NAME.test(field)) throw new Error(t('int.err_field'))
    const value = fstr(form, 'value') ?? ''
    if (value.trim() === '' || value.length > 8000) throw new Error(t('int.err_value'))

    await db.transaction(async (tx) => {
      const [row] = await tx
        .select({
          sealed: supplierIntegrations.credentialsSealed,
          hint: supplierIntegrations.credentialsHint,
        })
        .from(supplierIntegrations)
        .where(eq(supplierIntegrations.id, id))
        .limit(1)
        .for('update')
      if (!row) throw new Error(t('int.err_gone'))
      const current = row.sealed ? openJson(row.sealed) : {}
      const next = { ...current, [field]: value.trim() }
      const hint = { ...(row.hint ?? {}), [field]: lastFour(value) }
      await tx
        .update(supplierIntegrations)
        .set({ credentialsSealed: sealJson(next), credentialsHint: hint, updatedAt: new Date() })
        .where(eq(supplierIntegrations.id, id))
      await writeAudit(
        {
          actor: session,
          action: 'integration.credential_set',
          entityType: 'integration',
          entityId: id,
          // The field name only — never the value, not even its last four.
          before: { field, existed: field in current },
          after: { field, saved: true },
        },
        tx,
      )
    })
    outcome = { ok: t('int.ok_credential', { field }) }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  redirect(withOutcome(detail(id), outcome))
}

export async function removeCredential(id: string, form: FormData): Promise<void> {
  const session = await requireCapability('integrations.write')
  const { t } = await getAdminI18n()
  let outcome: Outcome
  try {
    assertKey(t)
    const field = (fstr(form, 'field') ?? '').trim()
    if (!FIELD_NAME.test(field)) throw new Error(t('int.err_field'))
    await db.transaction(async (tx) => {
      const [row] = await tx
        .select({
          sealed: supplierIntegrations.credentialsSealed,
          hint: supplierIntegrations.credentialsHint,
        })
        .from(supplierIntegrations)
        .where(eq(supplierIntegrations.id, id))
        .limit(1)
        .for('update')
      if (!row) throw new Error(t('int.err_gone'))
      const current = row.sealed ? openJson(row.sealed) : {}
      delete current[field]
      const hint = { ...(row.hint ?? {}) }
      delete hint[field]
      const empty = Object.keys(current).length === 0
      await tx
        .update(supplierIntegrations)
        .set({
          credentialsSealed: empty ? null : sealJson(current),
          credentialsHint: empty ? null : hint,
          updatedAt: new Date(),
        })
        .where(eq(supplierIntegrations.id, id))
      await writeAudit(
        {
          actor: session,
          action: 'integration.credential_remove',
          entityType: 'integration',
          entityId: id,
          before: { field },
          after: null,
        },
        tx,
      )
    })
    outcome = { ok: t('int.ok_credential_removed', { field }) }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  redirect(withOutcome(detail(id), outcome))
}

/**
 * Generate (or replace) the webhook signing secret. Returned ONCE to the
 * page, to be given to the supplier; stored sealed, shown afterwards only as
 * its last four characters. Replacing it stops the old one working at once.
 */
export async function createWebhookSecret(
  id: string,
  _previous: WebhookSecretState,
): Promise<WebhookSecretState> {
  const session = await requireCapability('integrations.write')
  const { t } = await getAdminI18n()
  try {
    assertKey(t)
    const before = await loadIntegration(id, t)
    const secret = generateWebhookSecret()
    await db.transaction(async (tx) => {
      await tx
        .update(supplierIntegrations)
        .set({
          webhookSecretSealed: sealJson({ value: secret }),
          webhookSecretHint: lastFour(secret),
          updatedAt: new Date(),
        })
        .where(eq(supplierIntegrations.id, id))
      await writeAudit(
        {
          actor: session,
          action: before.webhookSecretHint
            ? 'integration.webhook_rotate'
            : 'integration.webhook_create',
          entityType: 'integration',
          entityId: id,
          before: { webhookSecret: before.webhookSecretHint ? 'set' : 'none' },
          after: { webhookSecret: 'set' },
        },
        tx,
      )
    })
    return { status: 'created', secret, error: null }
  } catch (error) {
    if (isRedirectError(error)) throw error
    // Translated here: the client form must not import the server-only helpers.
    return { status: 'error', secret: null, error: localizeMessage(errorMessage(error), t) }
  }
}

/** "Sync now": queue a pull (retried with backoff by the worker). */
export async function syncNow(id: string): Promise<void> {
  const session = await requireCapability('integrations.write')
  const { t } = await getAdminI18n()
  let outcome: Outcome
  try {
    const row = await loadIntegration(id, t)
    if (!isConnectionType(row.connectionType)) throw new Error(t('int.err_type'))
    if (row.status === 'paused') throw new Error(t('int.err_paused'))
    if (!canSync(adapterFor(row.connectionType as ConnectionType))) {
      throw new Error(t('int.err_nothing_to_sync'))
    }
    const jobId = await enqueueIntegrationSync(
      { integrationId: id, trigger: 'manual' },
      { retryLimit: row.retryLimit, retryDelaySeconds: row.retryDelaySeconds },
    )
    await writeAudit({
      actor: session,
      action: 'integration.sync_now',
      entityType: 'integration',
      entityId: id,
      before: null,
      after: { queued: jobId !== null },
    })
    outcome = jobId === null ? { err: t('int.err_queue') } : { ok: t('int.ok_sync_queued') }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  redirect(withOutcome(detail(id), outcome))
}

/* --------------------------------------------------------------------------
   Mapping (supplier id ↔ our supplier offer)
   -------------------------------------------------------------------------- */

export async function addMapping(id: string, form: FormData): Promise<void> {
  const session = await requireCapability('integrations.write')
  const { t } = await getAdminI18n()
  let outcome: Outcome
  try {
    const integration = await loadIntegration(id, t)
    const externalId = (fstr(form, 'externalId') ?? '').trim()
    if (externalId === '' || externalId.length > 160) throw new Error(t('int.err_external_id'))
    const offerId = fuuid(form, 'offerId', t('int.offer'))
    const [offer] = await db
      .select({ id: activitySupplierOffers.id })
      .from(activitySupplierOffers)
      .where(
        and(
          eq(activitySupplierOffers.id, offerId),
          // Only this supplier's offers can be linked.
          eq(activitySupplierOffers.supplierId, integration.supplierId),
        ),
      )
      .limit(1)
    if (!offer) throw new Error(t('int.err_offer'))
    await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(externalProductMappings)
        .values({
          integrationId: id,
          externalId,
          internalKind: 'offer',
          internalId: offerId,
          label: (fstr(form, 'label') ?? '').trim().slice(0, 200) || null,
        })
        .returning()
      await writeAudit(
        {
          actor: session,
          action: 'integration.mapping_add',
          entityType: 'integration',
          entityId: id,
          before: null,
          after: { externalId, offerId, mappingId: row?.id ?? null },
        },
        tx,
      )
    })
    outcome = { ok: t('int.ok_mapped', { id: externalId }) }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  redirect(withOutcome(`${detail(id)}#mappings`, outcome))
}

export async function removeMapping(id: string, form: FormData): Promise<void> {
  const session = await requireCapability('integrations.write')
  const { t } = await getAdminI18n()
  let outcome: Outcome
  try {
    const mappingId = fuuid(form, 'mappingId', t('int.mapping'))
    await db.transaction(async (tx) => {
      const [removed] = await tx
        .delete(externalProductMappings)
        .where(
          and(
            eq(externalProductMappings.id, mappingId),
            eq(externalProductMappings.integrationId, id),
          ),
        )
        .returning()
      if (!removed) throw new Error(t('int.err_gone'))
      await writeAudit(
        {
          actor: session,
          action: 'integration.mapping_remove',
          entityType: 'integration',
          entityId: id,
          before: { externalId: removed.externalId, offerId: removed.internalId },
          after: null,
        },
        tx,
      )
    })
    outcome = { ok: t('int.ok_unmapped') }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  redirect(withOutcome(`${detail(id)}#mappings`, outcome))
}

/* --------------------------------------------------------------------------
   CSV import: upload → preview → apply
   -------------------------------------------------------------------------- */

export async function uploadImport(id: string, form: FormData): Promise<void> {
  const session = await requireCapability('integrations.write')
  const { t } = await getAdminI18n()
  let outcome: Outcome
  let target = detail(id)
  try {
    const integration = await loadIntegration(id, t)
    if (integration.connectionType !== 'csv') throw new Error(t('int.err_not_csv'))
    const file = form.get('file')
    if (!(file instanceof File) || file.size === 0) throw new Error(t('int.err_file'))
    if (file.size > CSV_MAX_BYTES) throw new Error(t('int.err_file_size'))
    const body = await file.text()
    const { rows, errors } = readImportRows(body)
    if (rows.length === 0 && errors.length > 0 && errors[0]?.code === 'header') {
      throw new Error(t('int.csv_err_header'))
    }
    const [row] = await db
      .insert(integrationImports)
      .values({
        integrationId: id,
        fileName: file.name.slice(0, 200),
        body,
        rowCount: rows.length + errors.length,
        status: 'previewed',
        createdBy: session.userId,
      })
      .returning({ id: integrationImports.id })
    if (!row) throw new Error(t('int.err_gone'))
    await logIntegration({
      integrationId: id,
      direction: 'in',
      operation: 'csv.upload',
      status: 'ok',
      payload: body,
      counts: false,
      details: { importId: row.id, rows: rows.length, invalid: errors.length },
    })
    await writeAudit({
      actor: session,
      action: 'integration.import_upload',
      entityType: 'integration',
      entityId: id,
      before: null,
      after: { importId: row.id, fileName: file.name.slice(0, 200), rows: rows.length },
    })
    target = adminHref(`/integrations/${id}/imports/${row.id}`)
    outcome = { ok: t('int.ok_uploaded') }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  redirect(withOutcome(target, outcome))
}

export async function applyImportAction(id: string, importId: string): Promise<void> {
  const session = await requireCapability('integrations.write')
  const { t } = await getAdminI18n()
  const page = adminHref(`/integrations/${id}/imports/${importId}`)
  let outcome: Outcome
  const started = Date.now()
  try {
    // Costs and availability are prices and places: also needs `prices.write`.
    await requireCapability('prices.write')
    const integration = await loadIntegration(id, t)
    if (integration.status === 'paused') throw new Error(t('int.err_paused'))
    const policy = isConflictPolicy(integration.conflictPolicy)
      ? integration.conflictPolicy
      : 'flag'
    const result = await db.transaction(async (tx) => {
      const [stored] = await tx
        .select()
        .from(integrationImports)
        .where(and(eq(integrationImports.id, importId), eq(integrationImports.integrationId, id)))
        .limit(1)
        .for('update')
      if (!stored) throw new Error(t('int.err_gone'))
      if (stored.status !== 'previewed') throw new Error(t('int.err_import_done'))
      const applied = await applyImport(tx, {
        integrationId: id,
        supplierId: integration.supplierId,
        body: stored.body,
        policy,
      })
      await tx
        .update(integrationImports)
        .set({
          status: 'applied',
          summary: applied.summary,
          appliedAt: new Date(),
          appliedBy: session.userId,
          updatedAt: new Date(),
        })
        .where(eq(integrationImports.id, importId))
      await writeAudit(
        {
          actor: session,
          action: 'integration.import_apply',
          entityType: 'integration',
          entityId: id,
          before: null,
          after: { importId, ...applied.summary },
        },
        tx,
      )
      return applied
    })
    await logIntegration({
      integrationId: id,
      direction: 'internal',
      operation: 'csv.apply',
      status: 'ok',
      durationMs: Date.now() - started,
      details: { importId, ...result.summary },
    })
    outcome = {
      ok: t('int.ok_applied', {
        count: result.summary.create + result.summary.update,
        open: result.summary.conflict + result.summary.unmapped,
      }),
    }
  } catch (error) {
    if (isRedirectError(error)) throw error
    await logIntegration({
      integrationId: id,
      direction: 'internal',
      operation: 'csv.apply',
      status: 'error',
      durationMs: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
      details: { importId },
    })
    outcome = { err: errorMessage(error) }
  }
  redirect(withOutcome(page, outcome))
}

export async function discardImport(id: string, importId: string): Promise<void> {
  const session = await requireCapability('integrations.write')
  const { t } = await getAdminI18n()
  let outcome: Outcome
  try {
    const [row] = await db
      .update(integrationImports)
      .set({ status: 'discarded', body: '', updatedAt: new Date() })
      .where(
        and(
          eq(integrationImports.id, importId),
          eq(integrationImports.integrationId, id),
          eq(integrationImports.status, 'previewed'),
        ),
      )
      .returning({ id: integrationImports.id })
    if (!row) throw new Error(t('int.err_import_done'))
    await writeAudit({
      actor: session,
      action: 'integration.import_discard',
      entityType: 'integration',
      entityId: id,
      before: null,
      after: { importId },
    })
    outcome = { ok: t('int.ok_discarded') }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  redirect(withOutcome(detail(id), outcome))
}
