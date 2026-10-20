/**
 * Phase 6: the database side of supplier integrations — loading a connection
 * for an adapter, writing the log, keeping the counters and alerting.
 *
 * Secrets: `loadAdapterContext` is the ONLY function that selects the sealed
 * columns, and it hands them on as a `SecretBag`. Studio pages select named,
 * non-secret columns (`integrationPublicColumns`).
 */

import { and, eq, sql } from 'drizzle-orm'

import { db } from '@/db'
import { integrationLogs, supplierIntegrations } from '@/db/schema'
import { sendAlert } from '@/lib/monitoring/alerts'

import {
  isConnectionType,
  type AdapterContext,
  type ConnectionType,
  type Environment,
  type IntegrationInfo,
  type Service,
} from './adapter'
import { openJson, SecretBag } from './crypto'
import { sha256Hex } from './webhook'

/** Everything about a connection that may be shown in Studio. No secrets. */
export const integrationPublicColumns = {
  id: supplierIntegrations.id,
  supplierId: supplierIntegrations.supplierId,
  name: supplierIntegrations.name,
  connectionType: supplierIntegrations.connectionType,
  environment: supplierIntegrations.environment,
  status: supplierIntegrations.status,
  credentialsHint: supplierIntegrations.credentialsHint,
  webhookSecretHint: supplierIntegrations.webhookSecretHint,
  services: supplierIntegrations.services,
  conflictPolicy: supplierIntegrations.conflictPolicy,
  retryLimit: supplierIntegrations.retryLimit,
  retryDelaySeconds: supplierIntegrations.retryDelaySeconds,
  rateLimitPerMinute: supplierIntegrations.rateLimitPerMinute,
  rateLimitNote: supplierIntegrations.rateLimitNote,
  tokenExpiresAt: supplierIntegrations.tokenExpiresAt,
  lastSyncAt: supplierIntegrations.lastSyncAt,
  lastErrorAt: supplierIntegrations.lastErrorAt,
  lastError: supplierIntegrations.lastError,
  successCount: supplierIntegrations.successCount,
  failureCount: supplierIntegrations.failureCount,
  consecutiveFailures: supplierIntegrations.consecutiveFailures,
  notes: supplierIntegrations.notes,
  createdAt: supplierIntegrations.createdAt,
  updatedAt: supplierIntegrations.updatedAt,
} as const

export function toInfo(row: {
  id: string
  supplierId: string
  name: string
  connectionType: string
  environment: string
  services: string[]
}): IntegrationInfo | null {
  if (!isConnectionType(row.connectionType)) return null
  return {
    id: row.id,
    supplierId: row.supplierId,
    name: row.name,
    connectionType: row.connectionType as ConnectionType,
    environment: (row.environment === 'production' ? 'production' : 'sandbox') as Environment,
    services: row.services as Service[],
  }
}

export interface LoadedIntegration {
  context: AdapterContext
  status: string
  retryLimit: number
  retryDelaySeconds: number
  /** Opened webhook signing secret, or null when none is set. */
  webhookSecret: string | null
}

/**
 * A connection with its secrets opened, for an adapter or the webhook
 * endpoint. Throws when INTEGRATIONS_KEY cannot open what is stored.
 */
export async function loadAdapterContext(integrationId: string): Promise<LoadedIntegration | null> {
  const [row] = await db
    .select({
      id: supplierIntegrations.id,
      supplierId: supplierIntegrations.supplierId,
      name: supplierIntegrations.name,
      connectionType: supplierIntegrations.connectionType,
      environment: supplierIntegrations.environment,
      services: supplierIntegrations.services,
      status: supplierIntegrations.status,
      retryLimit: supplierIntegrations.retryLimit,
      retryDelaySeconds: supplierIntegrations.retryDelaySeconds,
      credentialsSealed: supplierIntegrations.credentialsSealed,
      webhookSecretSealed: supplierIntegrations.webhookSecretSealed,
    })
    .from(supplierIntegrations)
    .where(eq(supplierIntegrations.id, integrationId))
    .limit(1)
  if (!row) return null
  const info = toInfo(row)
  if (info === null) return null
  const secrets = new SecretBag(row.credentialsSealed ? openJson(row.credentialsSealed) : {})
  const webhookSecret = row.webhookSecretSealed
    ? (openJson(row.webhookSecretSealed).value ?? null)
    : null
  return {
    context: { integration: info, secrets },
    status: row.status,
    retryLimit: row.retryLimit,
    retryDelaySeconds: row.retryDelaySeconds,
    webhookSecret,
  }
}

/** After this many failures in a row the admins are told (then at most every 6 hours). */
export const ALERT_AFTER_FAILURES = 3

export interface LogEntry {
  integrationId: string | null
  direction: 'in' | 'out' | 'internal'
  operation: string
  endpoint?: string | null
  status: 'ok' | 'error' | 'skipped'
  httpStatus?: number | null
  durationMs?: number | null
  error?: string | null
  /** Hashed, never stored. */
  payload?: string | null
  /** Counts and ids only — no personal data. */
  details?: Record<string, unknown> | null
  /** Count towards the success/failure counters (default: yes unless skipped). */
  counts?: boolean
}

/** Write one log row and keep the connection's counters. Never throws. */
export async function logIntegration(entry: LogEntry): Promise<void> {
  try {
    await db.insert(integrationLogs).values({
      integrationId: entry.integrationId,
      direction: entry.direction,
      operation: entry.operation.slice(0, 40),
      endpoint: entry.endpoint?.slice(0, 300) ?? null,
      status: entry.status,
      httpStatus: entry.httpStatus ?? null,
      durationMs: entry.durationMs ?? null,
      error: entry.error ? entry.error.slice(0, 2000) : null,
      payloadHash: entry.payload ? sha256Hex(entry.payload) : null,
      payloadBytes: entry.payload ? Buffer.byteLength(entry.payload) : null,
      details: entry.details ?? null,
    })
    if (entry.integrationId === null) return
    const counts = entry.counts ?? entry.status !== 'skipped'
    if (!counts) return

    if (entry.status === 'ok') {
      await db
        .update(supplierIntegrations)
        .set({
          successCount: sql`${supplierIntegrations.successCount} + 1`,
          consecutiveFailures: 0,
          lastSyncAt: new Date(),
          // A connection that works again is no longer in error.
          status: sql`case when ${supplierIntegrations.status} = 'error' then 'active' else ${supplierIntegrations.status} end`,
        })
        .where(eq(supplierIntegrations.id, entry.integrationId))
      return
    }

    const [row] = await db
      .update(supplierIntegrations)
      .set({
        failureCount: sql`${supplierIntegrations.failureCount} + 1`,
        consecutiveFailures: sql`${supplierIntegrations.consecutiveFailures} + 1`,
        lastErrorAt: new Date(),
        lastError: (entry.error ?? 'failed').slice(0, 2000),
      })
      .where(eq(supplierIntegrations.id, entry.integrationId))
      .returning({
        name: supplierIntegrations.name,
        consecutive: supplierIntegrations.consecutiveFailures,
      })
    if (row && row.consecutive >= ALERT_AFTER_FAILURES) {
      await db
        .update(supplierIntegrations)
        .set({ status: 'error', alertedAt: new Date() })
        .where(
          and(
            eq(supplierIntegrations.id, entry.integrationId),
            // Paused stays paused: an operator chose that.
            sql`${supplierIntegrations.status} <> 'paused'`,
          ),
        )
      await sendAlert(
        'staff_alert_integration',
        `integration:${entry.integrationId}`,
        { name: row.name.slice(0, 80), count: row.consecutive },
        6,
        `/integrations/${entry.integrationId}`,
      )
    }
  } catch (error) {
    console.error('[integrations] could not write the log', { operation: entry.operation, error })
  }
}

/**
 * Staff recorded a supplier's confirmation by hand (Orders → line). When that
 * supplier has a manual or CSV connection, the connection's log shows it —
 * the manual adapter's whole job is to record. Never throws.
 */
export async function recordManualConfirmation(input: {
  supplierId: string
  orderItemId: string
  hasReference: boolean
}): Promise<void> {
  try {
    const rows = await db
      .select({ id: supplierIntegrations.id })
      .from(supplierIntegrations)
      .where(
        and(
          eq(supplierIntegrations.supplierId, input.supplierId),
          sql`${supplierIntegrations.connectionType} in ('manual', 'csv')`,
          sql`${supplierIntegrations.status} <> 'paused'`,
        ),
      )
    for (const row of rows) {
      await logIntegration({
        integrationId: row.id,
        direction: 'internal',
        operation: 'booking.confirmed_by_staff',
        status: 'ok',
        details: { orderItemId: input.orderItemId, reference: input.hasReference },
      })
    }
  } catch (error) {
    console.error('[integrations] could not record a manual confirmation', error)
  }
}

/** Open problems per connection, for Studio's dashboard and system health. */
export async function integrationErrorCounts(): Promise<{
  connections: number
  failing: number
  errorsLast24h: number
}> {
  const [connections] = await db
    .select({
      total: sql<number>`count(*)::int`,
      failing: sql<number>`count(*) filter (where ${supplierIntegrations.status} = 'error')::int`,
    })
    .from(supplierIntegrations)
  const [logs] = await db
    .select({ errors: sql<number>`count(*)::int` })
    .from(integrationLogs)
    .where(
      and(
        eq(integrationLogs.status, 'error'),
        sql`${integrationLogs.createdAt} > now() - interval '24 hours'`,
      ),
    )
  return {
    connections: connections?.total ?? 0,
    failing: connections?.failing ?? 0,
    errorsLast24h: logs?.errors ?? 0,
  }
}
