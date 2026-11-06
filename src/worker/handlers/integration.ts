/**
 * Phase 6: supplier connection jobs.
 *
 *   integration.sync     "Sync now" — run the adapter's import methods for the
 *                        services the connection handles.
 *   integration.webhook  act on one verified, de-duplicated inbound webhook.
 *
 * A failure is logged on the connection AND thrown, so pg-boss retries it with
 * exponential backoff and, when the retries run out, dead-letters it (the
 * monitor then alerts the admins). Neither job ever runs for a paused
 * connection.
 */

import { and, eq } from 'drizzle-orm'

import { db } from '@/db'
import { webhookEvents } from '@/db/schema'
import {
  canSync,
  supports,
  type AdapterOperation,
  type ImportResult,
  type Service,
} from '@/lib/integrations/adapter'
import { adapterFor } from '@/lib/integrations/registry'
import { loadAdapterContext, logIntegration } from '@/lib/integrations/service'
import { sha256Hex, WEBHOOK_PROVIDER } from '@/lib/integrations/webhook'

import type { IntegrationSyncJob, IntegrationWebhookJob } from '../queues'

const IMPORTS: readonly { operation: AdapterOperation; service: Service; log: string }[] = [
  { operation: 'importProducts', service: 'products', log: 'sync.products' },
  { operation: 'importPrices', service: 'prices', log: 'sync.prices' },
  { operation: 'importAvailability', service: 'availability', log: 'sync.availability' },
]

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export async function handleIntegrationSync(job: IntegrationSyncJob): Promise<object> {
  const loaded = await loadAdapterContext(job.integrationId)
  if (loaded === null) return { skipped: 'gone' }
  const { context } = loaded
  if (loaded.status === 'paused') {
    await logIntegration({
      integrationId: job.integrationId,
      direction: 'internal',
      operation: 'sync',
      status: 'skipped',
      details: { reason: 'paused', trigger: job.trigger },
    })
    return { skipped: 'paused' }
  }

  const adapter = adapterFor(context.integration.connectionType)
  if (!canSync(adapter)) {
    await logIntegration({
      integrationId: job.integrationId,
      direction: 'internal',
      operation: 'sync',
      status: 'skipped',
      details: { reason: 'nothing_to_pull', trigger: job.trigger },
    })
    return { skipped: 'nothing_to_pull' }
  }

  const results: Record<string, object> = {}
  for (const step of IMPORTS) {
    if (!supports(adapter, step.operation)) continue
    if (!context.integration.services.includes(step.service)) continue
    const run = adapter[step.operation] as
      | ((ctx: typeof context) => Promise<ImportResult>)
      | undefined
    if (!run) continue
    const started = Date.now()
    try {
      const result = await run(context)
      results[step.service] = result
      await logIntegration({
        integrationId: job.integrationId,
        direction: 'out',
        operation: step.log,
        status: 'ok',
        durationMs: Date.now() - started,
        details: { ...result, trigger: job.trigger },
      })
    } catch (error) {
      await logIntegration({
        integrationId: job.integrationId,
        direction: 'out',
        operation: step.log,
        status: 'error',
        durationMs: Date.now() - started,
        error: message(error),
        details: { trigger: job.trigger },
      })
      throw error
    }
  }
  return results
}

export async function handleIntegrationWebhook(job: IntegrationWebhookJob): Promise<object> {
  const [event] = await db
    .select()
    .from(webhookEvents)
    .where(
      and(eq(webhookEvents.id, job.webhookEventId), eq(webhookEvents.provider, WEBHOOK_PROVIDER)),
    )
    .limit(1)
  if (!event) return { skipped: 'gone' }
  if (event.processedAt !== null) return { skipped: 'already_processed' }

  const loaded = await loadAdapterContext(job.integrationId)
  if (loaded === null) return { skipped: 'connection_gone' }
  if (loaded.status === 'paused') {
    // Kept unprocessed: the monitor queues it again once the connection is
    // resumed (src/worker/handlers/monitor.ts).
    return { skipped: 'paused' }
  }

  const adapter = adapterFor(loaded.context.integration.connectionType)
  const payloadText = JSON.stringify(event.payload ?? null)
  const started = Date.now()
  let result: object = { handled: false }
  if (adapter.handleWebhook) {
    try {
      result = await adapter.handleWebhook(loaded.context, event.payload)
      await logIntegration({
        integrationId: job.integrationId,
        direction: 'in',
        operation: 'webhook.process',
        status: 'ok',
        durationMs: Date.now() - started,
        payload: payloadText,
        details: { eventType: event.eventType, ...result },
      })
    } catch (error) {
      await logIntegration({
        integrationId: job.integrationId,
        direction: 'in',
        operation: 'webhook.process',
        status: 'error',
        durationMs: Date.now() - started,
        error: message(error),
        payload: payloadText,
        details: { eventType: event.eventType },
      })
      throw error
    }
  } else {
    // No adapter code acts on this connection's events yet: it was received,
    // verified and recorded, and that is all that happens.
    await logIntegration({
      integrationId: job.integrationId,
      direction: 'in',
      operation: 'webhook.process',
      status: 'skipped',
      payload: payloadText,
      details: { eventType: event.eventType, reason: 'no_handler' },
    })
  }

  // Handled: keep the proof (hash, size), drop the content — supplier events
  // can carry traveller names.
  await db
    .update(webhookEvents)
    .set({
      processedAt: new Date(),
      payload: { redacted: true, sha256: sha256Hex(payloadText), bytes: payloadText.length },
    })
    .where(eq(webhookEvents.id, event.id))
  return result
}
