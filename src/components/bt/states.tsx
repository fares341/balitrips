/**
 * Interface states — states.html / screen 29-ui-states.
 *
 *  - `EmptyState`  round palm illustration + title (+ text) + one action.
 *  - `ErrorState`  pale-red panel: what failed, that the visitor's work is
 *                  safe, and a retry/next action (`.err-page`).
 *  - `Skeleton`    a shimmering block (`.skel`); `CardSkeleton` and
 *                  `ListSkeleton` are the two loading layouts in the package.
 *  - `Alert`       inline info / ok / warn / err message (`.alert-*`).
 *  - `Unavailable` dashed "sold out / not available" row (`.unav`).
 *
 * No 'use client'.
 */

import type { CSSProperties, ReactNode } from 'react'

import { Icon, type IconName } from '@/components/ui/icon'

export type EmptyStateProps = {
  icon?: IconName
  title: ReactNode
  text?: ReactNode
  /** Usually one Button/LinkButton (`size="sm"`). */
  action?: ReactNode
  /** Heading level for the title; defaults to a bold span. */
  as?: 'h2' | 'h3' | 'b'
  className?: string
  style?: CSSProperties
}

export function EmptyState({
  icon = 'search',
  title,
  text,
  action,
  as: Title = 'b',
  className,
  style,
}: EmptyStateProps) {
  return (
    <div className={['empty', className].filter(Boolean).join(' ')} style={style}>
      <span className="ill" aria-hidden="true">
        <Icon name={icon} size={34} />
      </span>
      <Title style={Title === 'b' ? undefined : { fontSize: 18 }}>{title}</Title>
      {text !== undefined && text !== null && (
        <p className="muted" style={{ maxWidth: '46ch' }}>
          {text}
        </p>
      )}
      {action}
    </div>
  )
}

export type ErrorStateProps = {
  title: ReactNode
  text?: ReactNode
  action?: ReactNode
  className?: string
}

export function ErrorState({ title, text, action, className }: ErrorStateProps) {
  return (
    <div className={['err-page', className].filter(Boolean).join(' ')} role="alert">
      <b>{title}</b>
      {text !== undefined && text !== null && <span style={{ fontSize: 14 }}>{text}</span>}
      {action}
    </div>
  )
}

export type SkeletonProps = {
  width?: number | string
  height?: number | string
  radius?: number | string
  style?: CSSProperties
  className?: string
}

export function Skeleton({ width = '100%', height = 14, radius, style, className }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={['skel', className].filter(Boolean).join(' ')}
      style={{ width, height, ...(radius === undefined ? {} : { borderRadius: radius }), ...style }}
    />
  )
}

/** Loading placeholder shaped like a catalogue card. */
export function CardSkeleton({ label }: { label?: string }) {
  return (
    <div className="card" aria-busy="true" aria-label={label}>
      <Skeleton height="auto" radius={0} style={{ aspectRatio: '16 / 9' }} />
      <div className="card-body">
        <Skeleton width="40%" />
        <Skeleton width="85%" height={20} />
        <Skeleton width="70%" />
      </div>
    </div>
  )
}

/** Loading placeholder for a list of rows with a thumbnail. */
export function ListSkeleton({ rows = 3, label }: { rows?: number; label?: string }) {
  return (
    <div className="stack" style={{ gap: 12 }} aria-busy="true" aria-label={label}>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <Skeleton width={56} height={56} radius={12} />
          <div style={{ flex: 1, display: 'grid', gap: 8 }}>
            <Skeleton width="70%" />
            <Skeleton width="40%" height={12} />
          </div>
        </div>
      ))}
    </div>
  )
}

export type AlertTone = 'info' | 'ok' | 'warn' | 'err'

const ALERT_ICON: Record<AlertTone, IconName> = {
  info: 'info',
  ok: 'check',
  warn: 'alert',
  err: 'alert',
}

export type AlertProps = {
  tone?: AlertTone
  title?: ReactNode
  children?: ReactNode
  className?: string
}

export function Alert({ tone = 'info', title, children, className }: AlertProps) {
  return (
    <div
      className={['alert', `alert-${tone}`, className].filter(Boolean).join(' ')}
      role={tone === 'err' ? 'alert' : 'status'}
    >
      <Icon name={ALERT_ICON[tone]} size={20} />
      <div>
        {title !== undefined && title !== null && <b>{title}</b>}
        {children}
      </div>
    </div>
  )
}

export function Unavailable({ title, text }: { title: ReactNode; text?: ReactNode }) {
  return (
    <div className="unav">
      <Icon name="lock" size={18} />
      <span>
        <b>{title}</b>
        {text !== undefined && text !== null && (
          <>
            <br />
            <small>{text}</small>
          </>
        )}
      </span>
    </div>
  )
}
