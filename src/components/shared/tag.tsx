/**
 * Tag and Chip.
 *
 * Ported from the `.tag` / `.chip` rules in design/handoff/bt-styles.css.
 *
 * They look similar and are not the same thing:
 *  - **Tag** is a static label — a category, a region, a day count. It renders
 *    a `<span>` and is never clickable.
 *  - **Chip** is a filter control. It renders a real `<button>` and reports its
 *    on/off state through `aria-pressed`.
 *
 * The handoff blurred this: `FilterBar` used `<button className="chip">` with
 * an `active` class and no ARIA at all, so a screen reader heard ten identical
 * unlabelled buttons with no indication which filter was applied.
 */

import type { ComponentPropsWithRef } from 'react'

export type TagVariant = 'default' | 'palm' | 'forest' | 'orange'

const TAG_CLASS: Record<TagVariant, string | null> = {
  default: null,
  palm: 'tag-palm',
  forest: 'tag-forest',
  // Present in the handoff stylesheet and used by PackageCard for the
  // "driver included" badge. Kept so the port does not lose a state.
  orange: 'tag-orange',
}

export type TagProps = ComponentPropsWithRef<'span'> & {
  variant?: TagVariant
}

export function Tag({ variant = 'default', className, ...rest }: TagProps) {
  return (
    <span className={['tag', TAG_CLASS[variant], className].filter(Boolean).join(' ')} {...rest} />
  )
}

/**
 * Chips only have two colour treatments in the stylesheet: the forest default
 * and `.chip.orange`, which is used for the sort row. `palm` and `forest` are
 * Tag-only — there is no `.chip.palm` rule to hang them on, and inventing one
 * belongs in components.css, not here.
 */
export type ChipVariant = 'default' | 'orange'

export type ChipProps = Omit<ComponentPropsWithRef<'button'>, 'type'> & {
  variant?: ChipVariant
  /** Whether the filter this chip represents is currently applied. */
  active?: boolean
}

export function Chip({
  variant = 'default',
  active = false,
  className,
  style,
  ...rest
}: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={[
        'chip',
        variant === 'orange' ? 'orange' : null,
        active ? 'active' : null,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      // The stylesheet's own `.chip` min-height is 40px. Filter rows are a
      // primary mobile interaction, so lift it to the 44px target rather than
      // repeating the handoff's per-call-site `style={{ minHeight: 42 }}`.
      style={{ minHeight: 44, ...style }}
      {...rest}
    />
  )
}
