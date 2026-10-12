/**
 * Button and LinkButton.
 *
 * Ported from the `.btn` family in design/handoff/bt-styles.css. The handoff
 * had no button component at all — every call site wrote
 * `<button className="btn btn-forest" style={{ minHeight: 42, fontSize: 13.5 }}>`
 * by hand, which is why the prototype shipped seven different button heights
 * and a dozen font sizes. The visual language lives in components.css; this
 * file owns the *contract*.
 *
 * No 'use client'. A button with no handler renders fine from a Server
 * Component; the moment a call site passes `onClick` that call site needs the
 * directive, which is where the decision belongs.
 *
 * Three deliberate departures from the handoff:
 *
 *  1. **44px floor.** The handoff dropped to `minHeight: 42` on card CTAs and
 *     the stepper, under the 44x44 CSS-px target both WCAG 2.5.8 and the iOS
 *     HIG ask for. `size="sm"` here is 44, not 42.
 *  2. **`type="button"` by default.** Half the handoff's in-form buttons had no
 *     type, so they defaulted to `submit` and silently posted the form.
 *  3. **Locale-aware hrefs.** LinkButton routes internal links through the
 *     next-intl `Link`, so /activities becomes /ar/activities under Arabic.
 *     The prototype's `navigate()` pushed `"#" + name` and lost the locale.
 */

import type { ComponentPropsWithRef, CSSProperties } from 'react'

import { Link } from '@/i18n/routing'
import type { Locale } from '@/i18n/config'

export type ButtonVariant = 'orange' | 'forest' | 'ghost' | 'light'

export type ButtonSize = 'sm' | 'md' | 'lg'

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  orange: 'btn-orange',
  forest: 'btn-forest',
  ghost: 'btn-ghost',
  light: 'btn-light',
}

/**
 * Size metrics.
 *
 * Applied inline rather than as `.btn-sm` / `.btn-lg` classes so the 44px
 * floor holds even if components.css is loaded late or overridden. `md`
 * restates the stylesheet's own values, which keeps all three sizes in one
 * readable table instead of one being invisible.
 */
const SIZE_STYLE: Record<ButtonSize, CSSProperties> = {
  sm: { minHeight: 44, fontSize: 13.5, paddingBlock: 10, paddingInline: 18 },
  md: { minHeight: 48, fontSize: 15, paddingBlock: 15, paddingInline: 26 },
  lg: { minHeight: 56, fontSize: 17, paddingBlock: 18, paddingInline: 32 },
}

type StyleProps = {
  /** Colour treatment. Defaults to `orange`, the primary CTA. */
  variant?: ButtonVariant
  /** Stretch to the full width of the container (`.btn-block`). */
  block?: boolean
  /** Target size. All three clear the 44px minimum touch target. */
  size?: ButtonSize
}

/** Size is carried inline via SIZE_STYLE, so it contributes no class. */
function buttonClass(
  { variant = 'orange', block }: Omit<StyleProps, 'size'>,
  extra: string | undefined,
): string {
  return ['btn', VARIANT_CLASS[variant], block ? 'btn-block' : null, extra]
    .filter(Boolean)
    .join(' ')
}

export type ButtonProps = ComponentPropsWithRef<'button'> & StyleProps

export function Button({
  variant = 'orange',
  block = false,
  size = 'md',
  className,
  style,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClass({ variant, block }, className)}
      style={{ ...SIZE_STYLE[size], ...style }}
      {...rest}
    />
  )
}

/**
 * Anything with a scheme, a protocol-relative `//`, or a bare fragment is
 * outside the locale-prefixed route tree and must not be handed to next-intl's
 * `Link` — it would prepend `/ar` to `mailto:` and `tel:` and break them.
 */
function isExternalHref(href: string): boolean {
  return /^([a-z][a-z0-9+.-]*:|\/\/|#)/i.test(href)
}

export type LinkButtonProps = Omit<ComponentPropsWithRef<'a'>, 'href'> &
  StyleProps & {
    /** Internal path (`/activities`) or absolute URL (`https://…`, `tel:…`). */
    href: string
    /** Force a specific locale for internal links. Defaults to the active one. */
    locale?: Locale
  }

export function LinkButton({
  href,
  locale,
  variant = 'orange',
  block = false,
  size = 'md',
  className,
  style,
  target,
  rel,
  ...rest
}: LinkButtonProps) {
  const cls = buttonClass({ variant, block }, className)
  const css: CSSProperties = { ...SIZE_STYLE[size], ...style }

  // Opening a new tab without this leaks `window.opener` to the destination.
  const safeRel = target === '_blank' ? (rel ?? 'noopener noreferrer') : rel

  if (isExternalHref(href)) {
    return <a href={href} className={cls} style={css} target={target} rel={safeRel} {...rest} />
  }

  return (
    <Link
      href={href}
      locale={locale}
      className={cls}
      style={css}
      target={target}
      rel={safeRel}
      {...rest}
    />
  )
}
