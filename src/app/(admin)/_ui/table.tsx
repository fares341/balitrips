import Link from 'next/link'

import { buildQuery } from '../_lib/result'

/** Horizontally scrollable table wrapper — the page body never scrolls. */
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
  paid: 'info',
  confirmed: 'good',
  cancelled: 'bad',
  refunded: 'bad',
  partially_refunded: 'warn',
}

export function OrderStatusPill({ status }: { status: string }) {
  return <Pill tone={ORDER_TONES[status] ?? 'neutral'}>{status.replace(/_/g, ' ')}</Pill>
}

export function PublishPill({ status }: { status: string }) {
  return <Pill tone={status === 'published' ? 'good' : 'neutral'}>{status}</Pill>
}

/**
 * Offset pagination.
 *
 * Offset rather than keyset deliberately: admin lists are small, always
 * filtered, and an operator expects "page 4" to mean page 4.
 */
export function Pager({
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
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)

  return (
    <div className="a-pager">
      <span>
        {from}–{to} of {total}
      </span>
      {page > 1 ? (
        <Link
          className="a-btn ghost small"
          href={`${basePath}${buildQuery(searchParams, { page: page - 1 })}`}
        >
          Previous
        </Link>
      ) : null}
      {page < pageCount ? (
        <Link
          className="a-btn ghost small"
          href={`${basePath}${buildQuery(searchParams, { page: page + 1 })}`}
        >
          Next
        </Link>
      ) : null}
    </div>
  )
}

/** Timestamps are rendered in Bali time — every date this product shows is one. */
export function When({ value }: { value: Date | string | null }) {
  if (!value) return <span className="a-muted">—</span>
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return <span className="a-muted">—</span>

  return (
    <time dateTime={date.toISOString()} className="a-mono">
      {new Intl.DateTimeFormat('en-GB', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Asia/Makassar',
      }).format(date)}
    </time>
  )
}
