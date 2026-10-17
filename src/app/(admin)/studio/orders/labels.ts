import type { Translate } from '../../_i18n'

/** Staff-facing names for stored status/method codes. Unknown codes are shown as-is. */

const ORDER_STATUS_KEYS: Record<string, string> = {
  pending: 'orders.status_pending',
  paid: 'orders.status_paid',
  confirmed: 'orders.status_confirmed',
  cancelled: 'orders.status_cancelled',
  refunded: 'orders.status_refunded',
  partially_refunded: 'orders.status_partially_refunded',
}

const FULFILMENT_KEYS: Record<string, string> = {
  pending: 'orders.fulfil_pending',
  confirmed: 'orders.fulfil_confirmed',
  delivered: 'orders.fulfil_delivered',
  cancelled: 'orders.fulfil_cancelled',
  refunded: 'orders.fulfil_refunded',
}

const BOOKING_STATUS_KEYS: Record<string, string> = {
  created: 'orders.bs_created',
  sent_to_provider: 'orders.bs_sent_to_provider',
  confirmed: 'orders.bs_confirmed',
  completed: 'orders.bs_completed',
  cancel_requested: 'orders.bs_cancel_requested',
  cancelled: 'orders.bs_cancelled',
  refunded: 'orders.bs_refunded',
}

const PAYMENT_STATUS_KEYS: Record<string, string> = {
  requires_action: 'payments.status_requires_action',
  processing: 'payments.status_processing',
  succeeded: 'payments.status_succeeded',
  failed: 'payments.status_failed',
  cancelled: 'payments.status_cancelled',
  refunded: 'payments.status_refunded',
}

const PAYMENT_METHOD_KEYS: Record<string, string> = {
  card: 'payments.method_card',
  apple_pay: 'payments.method_apple_pay',
  google_pay: 'payments.method_google_pay',
  bank_transfer: 'payments.method_bank_transfer',
  manual: 'payments.method_manual',
  link: 'payments.method_link',
}

function label(t: Translate, keys: Record<string, string>, code: string): string {
  const key = keys[code]
  return key ? t(key) : code.replace(/_/g, ' ')
}

export function orderStatusLabel(t: Translate, status: string): string {
  return label(t, ORDER_STATUS_KEYS, status)
}

export function fulfilmentLabel(t: Translate, status: string): string {
  return label(t, FULFILMENT_KEYS, status)
}

/** Provider-facing booking status of one item (`order_items.booking_status`). */
export function bookingStatusLabel(t: Translate, status: string): string {
  return label(t, BOOKING_STATUS_KEYS, status)
}

export function paymentStatusLabel(t: Translate, status: string): string {
  return label(t, PAYMENT_STATUS_KEYS, status)
}

export function paymentMethodName(t: Translate, method: string | null | undefined): string | null {
  return method ? label(t, PAYMENT_METHOD_KEYS, method) : null
}

const PROVIDER_KEYS: Record<string, string> = {
  stripe: 'payments.provider_stripe',
  manual: 'payments.provider_manual',
  sandbox: 'payments.provider_sandbox',
}

/** Where a payment went through (stored as a short code such as `stripe`). */
export function paymentProviderName(t: Translate, provider: string): string {
  return label(t, PROVIDER_KEYS, provider)
}

const ACCESS_KIND_KEYS: Record<string, string> = {
  basic: 'entitlements.kind_basic',
  map_access: 'entitlements.kind_map_access',
  vip: 'entitlements.kind_vip',
}

/** What a customer's access unlocks (stored as `basic`, `map_access` or `vip`). */
export function accessKindLabel(t: Translate, kind: string): string {
  return label(t, ACCESS_KIND_KEYS, kind)
}
