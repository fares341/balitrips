/**
 * Phase 6: the supplier adapter contract.
 *
 * Every way of talking to a supplier is an adapter with the same shape. Studio
 * and the worker only ever call these methods; what each one does for a given
 * supplier is the adapter's business. A method an adapter does not implement
 * is simply absent — callers check, and Studio says "not available for this
 * connection" rather than pretending.
 *
 * This build ships two REAL adapters (./registry.ts):
 *   manual  staff book with the supplier by phone/WhatsApp, exactly as today;
 *           the adapter only records what was done.
 *   csv     the supplier sends a spreadsheet; staff upload it, preview the
 *           changes and apply them (./csv.ts).
 *
 * Remote connection types (REST, GraphQL, webhooks, OAuth…) exist as SETTINGS
 * so a connection can be described and its keys stored safely, but they have
 * no adapter until a developer writes one against that supplier's real API,
 * documentation and agreement — see docs/integrations.md. No adapter here
 * fakes a remote call.
 */

import type { SecretBag } from './crypto'
import type { WebhookCheck } from './webhook'

export const CONNECTION_TYPES = [
  'manual',
  'csv',
  'rest',
  'graphql',
  'webhook',
  'oauth2',
  'api_key',
  'scheduled',
] as const
export type ConnectionType = (typeof CONNECTION_TYPES)[number]

export function isConnectionType(value: unknown): value is ConnectionType {
  return typeof value === 'string' && (CONNECTION_TYPES as readonly string[]).includes(value)
}

export const SERVICES = ['products', 'prices', 'availability', 'bookings'] as const
export type Service = (typeof SERVICES)[number]

export const ENVIRONMENTS = ['sandbox', 'production'] as const
export type Environment = (typeof ENVIRONMENTS)[number]

export const INTEGRATION_STATUSES = ['active', 'paused', 'error'] as const
export type IntegrationStatus = (typeof INTEGRATION_STATUSES)[number]

/** What an adapter is told about its connection. Never contains a secret. */
export interface IntegrationInfo {
  id: string
  supplierId: string
  name: string
  connectionType: ConnectionType
  environment: Environment
  services: readonly Service[]
}

export interface AdapterContext {
  integration: IntegrationInfo
  /** Decrypted keys; values readable only through `get()`. */
  secrets: SecretBag
}

/** Counts from one import — what the log and Studio show. */
export interface ImportResult {
  received: number
  applied: number
  skipped: number
}

export interface BookingRequest {
  orderItemId: string
  externalProductId: string | null
  travelDate: string | null
  travelTime: string | null
  guests: number
  /** Our booking reference to quote to the supplier. */
  reference: string
}

export interface BookingResult {
  /** The supplier's reference, when it gave one. */
  supplierRef: string | null
  /** Where our booking stands after the call. */
  status: 'confirmed' | 'pending_supplier' | 'failed'
  /** Shown to staff. */
  note: string | null
}

export interface InboundWebhook {
  body: string
  headers: Headers
}

export interface SupplierAdapter {
  type: ConnectionType
  /** Does this build contain a working implementation for this type? */
  implemented: boolean
  importProducts?(context: AdapterContext): Promise<ImportResult>
  importPrices?(context: AdapterContext): Promise<ImportResult>
  importAvailability?(context: AdapterContext): Promise<ImportResult>
  createBooking?(context: AdapterContext, booking: BookingRequest): Promise<BookingResult>
  cancelBooking?(context: AdapterContext, supplierRef: string): Promise<BookingResult>
  getBookingStatus?(context: AdapterContext, supplierRef: string): Promise<BookingResult>
  /** Default: the HMAC scheme in ./webhook.ts with the connection's signing secret. */
  verifyWebhook?(context: AdapterContext, request: InboundWebhook): WebhookCheck
  /** Act on a verified, de-duplicated webhook (runs in the worker). */
  handleWebhook?(context: AdapterContext, payload: unknown): Promise<ImportResult>
}

/** The operations Studio lists for a connection, in display order. */
export const ADAPTER_OPERATIONS = [
  'importProducts',
  'importPrices',
  'importAvailability',
  'createBooking',
  'cancelBooking',
  'getBookingStatus',
  'verifyWebhook',
  'handleWebhook',
] as const satisfies readonly (keyof SupplierAdapter)[]

export type AdapterOperation = (typeof ADAPTER_OPERATIONS)[number]

export function supports(adapter: SupplierAdapter, operation: AdapterOperation): boolean {
  return typeof adapter[operation] === 'function'
}

/** Can "Sync now" do anything for this adapter? */
export function canSync(adapter: SupplierAdapter): boolean {
  return (
    supports(adapter, 'importProducts') ||
    supports(adapter, 'importPrices') ||
    supports(adapter, 'importAvailability')
  )
}
