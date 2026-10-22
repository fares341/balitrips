import Link from 'next/link'

import { buildQuery } from '../_lib/result'
import { uiI18n } from './i18n-server'

/**
 * Scrollable table wrapper — wide tables scroll sideways inside it, long ones
 * scroll under a sticky header, and the page body never scrolls sideways.
 */
export function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="a-table-wrap">
      <table className="a-table">{children}</table>
    </div>
  )
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="a-empty">{children}</div>
}

export type PillTone = 'neutral' | 'good' | 'warn' | 'bad' | 'info'

export function Pill({
  tone = 'neutral',
  children,
}: {
  tone?: PillTone
  children: React.ReactNode
}) {
  return <span className={`a-pill ${tone}`}>{children}</span>
}

const ORDER_TONES: Record<string, PillTone> = {
  pending: 'warn',
  authorized: 'warn',
  paid: 'info',
  confirmed: 'good',
  cancelled: 'bad',
  refunded: 'bad',
  partially_refunded: 'warn',
}

const ORDER_STATUS_KEYS: Record<string, string> = {
  pending: 'ui.order_pending',
  authorized: 'ca.order_authorized',
  paid: 'ui.order_paid',
  confirmed: 'ui.order_confirmed',
  cancelled: 'ui.order_cancelled',
  refunded: 'ui.order_refunded',
  partially_refunded: 'ui.order_partially_refunded',
}

export async function OrderStatusPill({ status }: { status: string }) {
  const { t } = await uiI18n()
  const key = ORDER_STATUS_KEYS[status]
  return (
    <Pill tone={ORDER_TONES[status] ?? 'neutral'}>{key ? t(key) : status.replace(/_/g, ' ')}</Pill>
  )
}

const PUBLISH_KEYS: Record<string, string> = {
  draft: 'common.draft',
  published: 'common.published',
  archived: 'common.archived',
  hidden: 'ae.status_pill_hidden',
  unavailable: 'ae.status_pill_unavailable',
}

export async function PublishPill({ status }: { status: string }) {
  const { t } = await uiI18n()
  const key = PUBLISH_KEYS[status]
  const tone =
    status === 'published'
      ? 'good'
      : status === 'unavailable'
        ? 'warn'
        : status === 'hidden'
          ? 'info'
          : 'neutral'
  return <Pill tone={tone}>{key ? t(key) : status}</Pill>
}

/**
 * Offset pagination.
 *
 * Offset rather than keyset deliberately: admin lists are small, always
 * filtered, and an operator expects "page 4" to mean page 4.
 */
export async function Pager({
  basePath,
  searchParams,
  page,
  pageSize,
  total,
}: {
  basePath: string
  searchParams: Record<string, string | string[] | undefined>
  page: number
  pageSize: number
  total: number
}) {
  const { t } = await uiI18n()
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)

  return (
    <nav className="a-pager" aria-label={t('ui.pagination')}>
      <span>{t('ui.pager_range', { from, to, total })}</span>
      {page > 1 ? (
        <Link
          className="a-btn ghost small"
          href={`${basePath}${buildQuery(searchParams, { page: page - 1 })}`}
          rel="prev"
        >
          {t('common.previous')}
        </Link>
      ) : null}
      {page < pageCount ? (
        <Link
          className="a-btn ghost small"
          href={`${basePath}${buildQuery(searchParams, { page: page + 1 })}`}
          rel="next"
        >
          {t('common.next')}
        </Link>
      ) : null}
    </nav>
  )
}

/** Timestamps are rendered in Bali time — every date this product shows is one. */
export async function When({ value }: { value: Date | string | null }) {
  if (!value) return <span className="a-muted">—</span>
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return <span className="a-muted">—</span>

  const { intl } = await uiI18n()
  return (
    <time dateTime={date.toISOString()} className="a-when">
      {new Intl.DateTimeFormat(intl, {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Asia/Makassar',
      }).format(date)}
    </time>
  )
}
