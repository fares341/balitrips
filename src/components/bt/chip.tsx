/**
 * Chips (filters) and tags (labels) — bt.css "Chips / tags".
 *
 *  - `Chip`: a toggle button for a filter. `active` sets aria-pressed, which
 *    is what fills it forest. `count` shows the small number after the label.
 *  - `ChipLink`: the same pill as a link (filter in the URL); `active` sets
 *    aria-current="page".
 *  - `ChipRow`: the row; `scroll` makes it a single edge-to-edge scrolling
 *    line on phones (`.chips.scroll`).
 *  - `Tag`: a non-interactive label. Status colours (`ok`, `warn`, `err`,
 *    `info`) are reserved for booking/payment state and always carry text.
 *
 * No 'use client' — a Chip only needs the directive where a parent passes
 * `onClick`.
 */

import type { ComponentPropsWithRef, ReactNode } from 'react'

import { Icon, type IconName } from '@/components/ui/icon'
import { Link } from '@/i18n/routing'

export type TagVariant =
  | 'default'
  | 'palm'
  | 'orange'
  | 'forest'
  | 'ok'
  | 'warn'
  | 'err'
  | 'info'
  | 'glass'
  | 'sun'

const TAG_CLASS: Record<TagVariant, string | null> = {
  default: null,
  palm: 'tag-palm',
  orange: 'tag-orange',
  forest: 'tag-forest',
  ok: 'tag-ok',
  warn: 'tag-warn',
  err: 'tag-err',
  info: 'tag-info',
  glass: 'tag-glass',
  /** Solid orange with forest ink — "Best first trip", "Signature". */
  sun: 'tag-sun',
}

export type TagProps = ComponentPropsWithRef<'span'> & {
  variant?: TagVariant
  icon?: IconName
}

export function Tag({ variant = 'default', icon, className, children, ...rest }: TagProps) {
  return (
    <span className={['tag', TAG_CLASS[variant], className].filter(Boolean).join(' ')} {...rest}>
      {icon !== undefined && <Icon name={icon} size={14} />}
      {children}
    </span>
  )
}

export type ChipVariant = 'default' | 'orange'

export type ChipProps = Omit<ComponentPropsWithRef<'button'>, 'type'> & {
  /** Whether the filter is applied. */
  active?: boolean
  /** Small count after the label (e.g. results in that category). */
  count?: number
  icon?: IconName
  /** Kept for pre-v3 call sites; v3 has a single chip style. */
  variant?: ChipVariant
}

export function Chip({
  active = false,
  count,
  icon,
  variant: _variant,
  className,
  children,
  ...rest
}: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={['chip', className].filter(Boolean).join(' ')}
      {...rest}
    >
      {icon !== undefined && <Icon name={icon} size={16} />}
      {children}
      {count !== undefined && ' '}
      {count !== undefined && (
        <span className="ct" dir="ltr">
          {count}
        </span>
      )}
    </button>
  )
}

export type ChipLinkProps = Omit<ComponentPropsWithRef<'a'>, 'href'> & {
  href: string
  active?: boolean
  count?: number
  icon?: IconName
}

export function ChipLink({
  href,
  active = false,
  count,
  icon,
  className,
  children,
  ...rest
}: ChipLinkProps) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={['chip', className].filter(Boolean).join(' ')}
      {...rest}
    >
      {icon !== undefined && <Icon name={icon} size={16} />}
      {children}
      {count !== undefined && ' '}
      {count !== undefined && (
        <span className="ct" dir="ltr">
          {count}
        </span>
      )}
    </Link>
  )
}

export type ChipRowProps = {
  children: ReactNode
  /** One scrolling line that bleeds to the screen edges on phones. */
  scroll?: boolean
  /** Accessible name when the row is a filter group. */
  label?: string
  className?: string
}

export function ChipRow({ children, scroll = false, label, className }: ChipRowProps) {
  return (
    <div
      className={['chips', scroll ? 'scroll' : null, className].filter(Boolean).join(' ')}
      role={label === undefined ? undefined : 'group'}
      aria-label={label}
    >
      {children}
    </div>
  )
}
