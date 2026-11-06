/**
 * Button and LinkButton — the v3 `.btn` family (bt.css "Buttons").
 *
 * Variants (design-system.html "Buttons"):
 *   primary   orange fill, #13301A text, orange shadow — ONE main action per
 *             view (book, pay, start planning). `orange` is an alias.
 *   secondary forest fill, ivory text ("Details"). `forest` is an alias.
 *   ghost     transparent, hairline border ("Add to My Trip").
 *   light     white fill, forest text — on photos and orange bands.
 *   glass     translucent white — on dark imagery only.
 *   dark      forest-deep fill — on the orange CTA band.
 * Sizes: sm 40px · md 48px · lg 56px. `loading` keeps the width and shows a
 * spinner; it also sets aria-busy and blocks clicks.
 *
 * No 'use client': a button without a handler renders from a Server
 * Component. `type="button"` by default so a button inside a form never
 * submits by accident.
 */

import type { ComponentPropsWithRef, ReactNode } from 'react'

import { Icon, type IconName } from '@/components/ui/icon'
import type { Locale } from '@/i18n/config'
import { Link } from '@/i18n/routing'

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'ghost'
  | 'light'
  | 'glass'
  | 'dark'
  | 'orange'
  | 'forest'

export type ButtonSize = 'sm' | 'md' | 'lg'

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: 'btn-primary',
  orange: 'btn-primary',
  secondary: 'btn-forest',
  forest: 'btn-forest',
  ghost: 'btn-ghost',
  light: 'btn-light',
  glass: 'btn-glass',
  dark: 'btn-dark',
}

const SIZE_CLASS: Record<ButtonSize, string | null> = { sm: 'btn-sm', md: null, lg: 'btn-lg' }

const ICON_SIZE: Record<ButtonSize, number> = { sm: 16, md: 18, lg: 20 }

export type ButtonStyleProps = {
  /** Colour treatment. Defaults to `primary` (orange). */
  variant?: ButtonVariant
  /** 40 / 48 / 56 px tall. Defaults to `md`. */
  size?: ButtonSize
  /** Full width of the container. */
  block?: boolean
  /** Spinner in place of the label; width is kept. */
  loading?: boolean
  /** Icon before the label. Directional glyphs (arrow, back) mirror in RTL. */
  icon?: IconName
  /** Icon after the label. */
  iconEnd?: IconName
}

const DIRECTIONAL: ReadonlySet<IconName> = new Set<IconName>(['arrow', 'back', 'chevronr'])

export function buttonClass(
  { variant = 'primary', size = 'md', block = false, loading = false }: ButtonStyleProps,
  extra?: string,
): string {
  return [
    'btn',
    VARIANT_CLASS[variant],
    SIZE_CLASS[size],
    block ? 'btn-block' : null,
    loading ? 'is-loading' : null,
    extra,
  ]
    .filter(Boolean)
    .join(' ')
}

function content(
  children: ReactNode,
  icon: IconName | undefined,
  iconEnd: IconName | undefined,
  size: ButtonSize,
) {
  const s = ICON_SIZE[size]
  return (
    <>
      {icon !== undefined && (
        <Icon name={icon} size={s} className={DIRECTIONAL.has(icon) ? 'flip' : undefined} />
      )}
      {children}
      {iconEnd !== undefined && (
        <Icon name={iconEnd} size={s} className={DIRECTIONAL.has(iconEnd) ? 'flip' : undefined} />
      )}
    </>
  )
}

export type ButtonProps = ComponentPropsWithRef<'button'> & ButtonStyleProps

export function Button({
  variant = 'primary',
  size = 'md',
  block = false,
  loading = false,
  icon,
  iconEnd,
  className,
  type = 'button',
  disabled,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClass({ variant, size, block, loading }, className)}
      disabled={disabled}
      aria-busy={loading || undefined}
      {...rest}
    >
      {content(children, icon, iconEnd, size)}
    </button>
  )
}

function isExternalHref(href: string): boolean {
  return /^([a-z][a-z0-9+.-]*:|\/\/|#)/i.test(href)
}

export type LinkButtonProps = Omit<ComponentPropsWithRef<'a'>, 'href'> &
  ButtonStyleProps & {
    /** Internal path (`/activities`) or absolute URL (`https://…`, `tel:…`). */
    href: string
    /** Force a locale for internal links. Defaults to the active one. */
    locale?: Locale
  }

export function LinkButton({
  href,
  locale,
  variant = 'primary',
  size = 'md',
  block = false,
  loading = false,
  icon,
  iconEnd,
  className,
  target,
  rel,
  children,
  ...rest
}: LinkButtonProps) {
  const cls = buttonClass({ variant, size, block, loading }, className)
  // Opening a new tab without this leaks `window.opener` to the destination.
  const safeRel = target === '_blank' ? (rel ?? 'noopener noreferrer') : rel
  const inner = content(children, icon, iconEnd, size)

  if (isExternalHref(href)) {
    return (
      <a href={href} className={cls} target={target} rel={safeRel} {...rest}>
        {inner}
      </a>
    )
  }
  return (
    <Link href={href} locale={locale} className={cls} target={target} rel={safeRel} {...rest}>
      {inner}
    </Link>
  )
}

export type IconButtonProps = ComponentPropsWithRef<'button'> & {
  icon: IconName
  /** Required: an icon-only button needs an accessible name. */
  label: string
  /** Numeric badge (cart, favorites). Hidden when 0 or undefined. */
  badge?: number
  iconSize?: number
}

/** 44px round icon button (`.icon-btn`), with an optional orange counter. */
export function IconButton({
  icon,
  label,
  badge,
  iconSize = 21,
  className,
  type = 'button',
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      className={['icon-btn', className].filter(Boolean).join(' ')}
      aria-label={label}
      title={label}
      {...rest}
    >
      <Icon name={icon} size={iconSize} />
      {badge !== undefined && badge > 0 && (
        <span className="badge" dir="ltr">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </button>
  )
}
