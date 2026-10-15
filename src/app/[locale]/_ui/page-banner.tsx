/**
 * PageBanner.
 *
 * Ported from `PageBanner` in design/handoff/bt-ui.jsx (lines 59-75): the
 * photo-backed header that opens every non-home page — breadcrumbs, an orange
 * tag, an `h1` and an optional lede.
 *
 * Two changes from the handoff:
 *
 *  1. **The image is a real record, not a search phrase.** The prototype built
 *     a loremflickr URL out of `"bali,landscape,ocean"`. Banners take a
 *     `MediaDto` from the content layer, and `<Photo>` renders a neutral
 *     surface when there is nothing to show — rather than a stock photo of
 *     somewhere the brand does not operate. The backdrop is decorative, so its
 *     alt is empty: the `h1` directly below already names the page.
 *  2. **Crumbs are links.** `Breadcrumbs` already fixed that; this passes it
 *     `href`s instead of the handoff's `navigate()` callbacks.
 *
 * Route-private (`_ui` is not a route segment). It lives here because
 * `src/components/shared` is owned by another agent; promote it there when the
 * ownership boundary allows.
 */

import type { ReactNode } from 'react'

import { Breadcrumbs, type Crumb } from '@/components/shared'
import { Photo } from '@/components/ui'
import type { MediaDto } from '@/lib/content/types'

export type PageBannerProps = {
  /** Backdrop. Null renders the neutral placeholder, never a broken image. */
  image?: MediaDto | null
  /** A fixed brand photo (public/brand) used when `image` is null. */
  imageSrc?: string | null
  /** Small orange pill above the title. */
  tag?: string
  title: string
  subtitle?: string | null
  trail?: Crumb[]
  /** Accessible name for the breadcrumb landmark, already translated. */
  breadcrumbLabel?: string
  /** Taller variant used by the map and driver pages. */
  tall?: boolean
  children?: ReactNode
}

export function PageBanner({
  image = null,
  imageSrc = null,
  tag,
  title,
  subtitle = null,
  trail,
  breadcrumbLabel,
  tall = false,
  children,
}: PageBannerProps) {
  return (
    <div className={tall ? 'bt-banner tall' : 'bt-banner'}>
      <Photo
        src={image?.url ?? imageSrc}
        alt=""
        priority
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      />
      <div className="bt-banner-veil" aria-hidden="true" />

      <div className="wrap bt-banner-inner">
        {trail !== undefined && trail.length > 0 && (
          <Breadcrumbs trail={trail} light label={breadcrumbLabel} />
        )}

        {tag !== undefined && (
          <span
            className="tag"
            style={{ background: 'var(--orange)', color: 'var(--on-orange)', width: 'fit-content' }}
          >
            {tag}
          </span>
        )}

        <h1 className="bt-banner-title">{title}</h1>

        {subtitle !== null && <p className="bt-banner-sub">{subtitle}</p>}

        {children}
      </div>

      {/*
        No attribution overlay on the hero.
        Every CC BY and CC BY-SA image still has to be credited -- that is a
        licence condition, not a courtesy -- but it is credited on /credits,
        which is linked from the footer and lists photographer, licence and
        source for every image. Burning it into the artwork was stacking three
        lines of URL across the call-to-action buttons on a phone.
      */}
    </div>
  )
}
