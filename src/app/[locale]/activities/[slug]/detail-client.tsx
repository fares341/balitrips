'use client'

/**
 * Small interactive pieces of the activity page (prototype activity.html):
 * the photo gallery (main photo, thumbnails, click-to-load video) with its
 * lightbox, the sticky section tabs that follow the scroll, the information
 * tabs, and the Share / Save buttons beside the title.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'

import { toggleFavorite } from '@/app/[locale]/_actions/favorites'
import { favoriteKey, setFavorite, useFavorites } from '@/components/bt/favorites-store'
import { useToast } from '@/components/shared/toast'
import { Icon } from '@/components/ui/icon'
import { Link } from '@/i18n/routing'

// ---------------------------------------------------------------------------
// Gallery + lightbox
// ---------------------------------------------------------------------------

export type GalleryImage = {
  id: string
  url: string
  alt: string
  srcSetAvif?: string | null
  srcSetWebp?: string | null
}

export type GalleryVideo = { provider: 'youtube' | 'vimeo'; embedUrl: string }

const SIZES = '(max-width: 1023px) 100vw, 62vw'

/** One photo as a <picture>; the first may carry a portrait version for phones. */
function Picture({
  image,
  mobile,
  eager,
  alt,
}: {
  image: GalleryImage
  mobile?: GalleryImage | null
  eager: boolean
  alt: string
}) {
  return (
    <picture>
      {mobile ? (
        <>
          {mobile.srcSetAvif ? (
            <source
              media="(max-width: 640px)"
              type="image/avif"
              srcSet={mobile.srcSetAvif}
              sizes="100vw"
            />
          ) : null}
          {mobile.srcSetWebp ? (
            <source
              media="(max-width: 640px)"
              type="image/webp"
              srcSet={mobile.srcSetWebp}
              sizes="100vw"
            />
          ) : null}
          <source media="(max-width: 640px)" srcSet={mobile.url} />
        </>
      ) : null}
      {image.srcSetAvif ? (
        <source type="image/avif" srcSet={image.srcSetAvif} sizes={SIZES} />
      ) : null}
      {image.srcSetWebp ? (
        <source type="image/webp" srcSet={image.srcSetWebp} sizes={SIZES} />
      ) : null}
      {/* eslint-disable-next-line @next/next/no-img-element -- CMS media, already sized derivatives */}
      <img
        src={image.url}
        alt={alt}
        loading={eager ? 'eager' : 'lazy'}
        fetchPriority={eager ? 'high' : undefined}
        decoding="async"
      />
    </picture>
  )
}

/**
 * Main photo + thumbnails (+ the video as the last thumbnail). The video is
 * our own photo with a play button until pressed; only then is the player
 * (youtube-nocookie / Vimeo with do-not-track) loaded.
 */
export function Gallery({
  images,
  mobileHero = null,
  video = null,
}: {
  images: GalleryImage[]
  mobileHero?: GalleryImage | null
  video?: GalleryVideo | null
}) {
  const t = useTranslations()
  const [open, setOpen] = useState<number | null>(null)
  // A real video leads, on its own poster with a play button (client design).
  const [active, setActive] = useState<number | 'video'>(video && images.length > 0 ? 'video' : 0)
  const swipe = useRef<{ x: number; y: number } | null>(null)
  const [playing, setPlaying] = useState(false)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (open === null) return
    closeRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(null)
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        const rtl = document.documentElement.dir === 'rtl'
        const forward = (event.key === 'ArrowRight') !== rtl
        setOpen((i) => (i === null ? i : (i + (forward ? 1 : -1) + images.length) % images.length))
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, images.length])

  if (images.length === 0 && !video) {
    return <div className="gal gal-empty" aria-hidden="true" />
  }

  const current = open === null ? null : images[open]
  const index = active === 'video' ? null : Math.min(active, Math.max(0, images.length - 1))
  const shown = index === null ? null : images[index]
  const poster = images[0] ?? null
  const showVideo = active === 'video' || (images.length === 0 && video !== null)
  const providerName = video?.provider === 'vimeo' ? 'Vimeo' : 'YouTube'

  return (
    <>
      <div className="mgal">
        <div
          className="mgal-main"
          onTouchStart={(event) => {
            const touch = event.touches[0]
            swipe.current = touch ? { x: touch.clientX, y: touch.clientY } : null
          }}
          onTouchEnd={(event) => {
            const start = swipe.current
            const touch = event.changedTouches[0]
            swipe.current = null
            if (!start || !touch || images.length < 2) return
            const dx = touch.clientX - start.x
            if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(touch.clientY - start.y)) return
            // Swiping toward the reading direction's start shows the next photo.
            const rtl = document.documentElement.dir === 'rtl'
            const step = dx < 0 !== rtl ? 1 : -1
            const from = active === 'video' ? 0 : active
            setPlaying(false)
            setActive((from + step + images.length) % images.length)
          }}
        >
          {showVideo && video ? (
            playing ? (
              <iframe
                src={video.embedUrl}
                title={t('act_video_label')}
                allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
              />
            ) : (
              <button
                type="button"
                className="mgal-play"
                onClick={() => setPlaying(true)}
                aria-describedby="mgal-video-note"
              >
                {poster ? <Picture image={poster} eager alt="" /> : null}
                <span className="mgal-play-btn">
                  <Icon name="play" size={30} />
                  <span>{t('act_video_play')}</span>
                </span>
              </button>
            )
          ) : shown && index !== null ? (
            <button
              type="button"
              className="mgal-photo"
              onClick={() => setOpen(index)}
              aria-label={`${t('act_gal_view')} ${index + 1}`}
            >
              <Picture
                image={shown}
                mobile={index === 0 ? mobileHero : null}
                eager={index === 0}
                alt={shown.alt}
              />
              {images.length > 1 ? (
                <span className="all btn btn-light btn-sm">
                  <Icon name="grid" size={16} /> {t('act_gal_all')}{' '}
                  <span dir="ltr">{`(${images.length})`}</span>
                </span>
              ) : null}
            </button>
          ) : null}
        </div>
        {images.length > 1 || video ? (
          <div className="mgal-thumbs" role="group" aria-label={t('act_gal_thumbs')}>
            {images.slice(0, 8).map((image, i) => (
              <button
                key={image.id}
                type="button"
                aria-pressed={active === i}
                aria-label={`${t('act_gal_view')} ${i + 1}`}
                onClick={() => {
                  setActive(i)
                  setPlaying(false)
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- CMS thumbnail */}
                <img src={image.url} alt="" loading="lazy" decoding="async" />
              </button>
            ))}
            {video ? (
              <button
                type="button"
                className="mgal-vthumb"
                aria-pressed={active === 'video'}
                onClick={() => setActive('video')}
              >
                {poster ? (
                  // eslint-disable-next-line @next/next/no-img-element -- CMS thumbnail
                  <img src={poster.url} alt="" loading="lazy" decoding="async" />
                ) : null}
                <span>
                  <Icon name="play" size={18} /> {t('act_video_label')}
                </span>
              </button>
            ) : null}
          </div>
        ) : null}
        {video ? (
          <small id="mgal-video-note" className="muted mgal-note">
            {t('act_video_note', { provider: providerName })}
          </small>
        ) : null}
      </div>

      {current ? (
        <div
          className="lb"
          role="dialog"
          aria-modal="true"
          aria-label={t('act_gal_title')}
          onClick={(event) => {
            if (event.target === event.currentTarget) setOpen(null)
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- full-size CMS photo */}
          <img src={current.url} alt={current.alt} />
          <button
            ref={closeRef}
            type="button"
            className="icon-btn x"
            aria-label={t('c_close')}
            onClick={() => setOpen(null)}
          >
            <Icon name="cross" size={22} />
          </button>
          {images.length > 1 ? (
            <>
              <button
                type="button"
                className="icon-btn pv"
                aria-label={t('act_gal_prev')}
                onClick={() => setOpen((i) => ((i ?? 0) - 1 + images.length) % images.length)}
              >
                <Icon name="chevronr" size={22} className="flip-ltr" />
              </button>
              <button
                type="button"
                className="icon-btn nx"
                aria-label={t('act_gal_next')}
                onClick={() => setOpen((i) => ((i ?? 0) + 1) % images.length)}
              >
                <Icon name="chevronr" size={22} className="flip" />
              </button>
            </>
          ) : null}
          <span className="lb-count" dir="ltr">
            {(open ?? 0) + 1} / {images.length}
          </span>
        </div>
      ) : null}
    </>
  )
}

// ---------------------------------------------------------------------------
// Section tabs
// ---------------------------------------------------------------------------

/**
 * The in-page section bar «Packages / Overview / Details» (owner, Oct 2026).
 *
 * Sticky at the top of the viewport (the site header scrolls away), it
 * highlights the section being read, scrolls smoothly on click and lands the
 * heading just below itself (`scroll-margin-top` on the sections). It sits at
 * the top, so it never meets the phone's bottom book bar.
 */
export function SectionNav({
  sections,
  label,
}: {
  sections: { id: string; label: string }[]
  label: string
}) {
  const [current, setCurrent] = useState(sections[0]?.id ?? '')
  const [stuck, setStuck] = useState(false)
  const barRef = useRef<HTMLElement>(null)

  useEffect(() => {
    let frame = 0
    const update = () => {
      frame = 0
      const bar = barRef.current
      const offset = (bar?.offsetHeight ?? 0) + 24
      let active = sections[0]?.id ?? ''
      for (const section of sections) {
        const el = document.getElementById(section.id)
        if (el && el.getBoundingClientRect().top - offset <= 0) active = section.id
      }
      // At the very bottom the last section is the one being read.
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
        const last = sections[sections.length - 1]
        if (last && document.getElementById(last.id)) active = last.id
      }
      setCurrent(active)
      setStuck(bar !== null && bar.getBoundingClientRect().top <= 0.5)
    }
    const onScroll = () => {
      if (frame === 0) frame = window.requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (frame !== 0) window.cancelAnimationFrame(frame)
    }
  }, [sections])

  return (
    <nav ref={barRef} className={stuck ? 'anav stuck' : 'anav'} aria-label={label}>
      <div className="anav-in">
        {sections.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            aria-current={current === s.id ? 'location' : undefined}
            onClick={(event) => {
              const target = document.getElementById(s.id)
              if (!target) return
              event.preventDefault()
              const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
              target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
              history.replaceState(null, '', `#${s.id}`)
              setCurrent(s.id)
            }}
          >
            {s.label}
          </a>
        ))}
      </div>
    </nav>
  )
}

// ---------------------------------------------------------------------------
// Share / Save
// ---------------------------------------------------------------------------

export function ShareButton() {
  const t = useTranslations()
  const { toast } = useToast()
  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      onClick={async () => {
        const url = window.location.href.split('#')[0] ?? window.location.href
        try {
          await navigator.clipboard.writeText(url)
          toast(t('act_link_copied'))
        } catch {
          toast(t('act_link_copy_manual'))
        }
      }}
    >
      <Icon name="share" size={16} /> {t('act_share')}
    </button>
  )
}

export function SaveButton({ activityId }: { activityId: string }) {
  const t = useTranslations()
  const { toast } = useToast()
  const favorites = useFavorites()
  const key = favoriteKey('activity', activityId)
  const pressed = favorites.keys.has(key)
  const [pending, setPending] = useState(false)

  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      aria-pressed={pressed}
      aria-busy={pending || undefined}
      onClick={async () => {
        if (favorites.loaded && !favorites.signedIn) {
          toast(t('bt_fav_signin'), { link: { href: '/account', label: t('bt_login') } })
          return
        }
        setPending(true)
        try {
          const result = await toggleFavorite('activity', activityId)
          if (result.ok) {
            setFavorite(key, result.saved)
            toast(
              t(result.saved ? 'bt_fav_added' : 'bt_fav_removed'),
              result.saved ? { link: { href: '/account/favorites', label: t('bt_view') } } : {},
            )
          } else if (result.reason === 'signed_out') {
            toast(t('bt_fav_signin'), { link: { href: '/account', label: t('bt_login') } })
          } else {
            toast(t('c_error'), { error: true })
          }
        } finally {
          setPending(false)
        }
      }}
    >
      <Icon name="heart" size={16} /> {pressed ? t('act_saved') : t('act_save')}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Information tabs (معلومات مهمة / سياسة الإلغاء والتعديل / الأسئلة الشائعة)
// ---------------------------------------------------------------------------

export function InfoTabs({
  label,
  tabs,
}: {
  label: string
  tabs: { id: string; title: string; content: ReactNode }[]
}) {
  const [current, setCurrent] = useState(tabs[0]?.id ?? '')
  const refs = useRef<Record<string, HTMLButtonElement | null>>({})
  const selected = tabs.find((tab) => tab.id === current) ?? tabs[0]
  if (!selected) return null

  const move = (delta: number) => {
    const index = tabs.findIndex((tab) => tab.id === selected.id)
    const next = tabs[(index + delta + tabs.length) % tabs.length]
    if (!next) return
    setCurrent(next.id)
    refs.current[next.id]?.focus()
  }

  return (
    <div className="itabs">
      <div className="tabs itabs-list" role="tablist" aria-label={label}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            ref={(el) => {
              refs.current[tab.id] = el
            }}
            type="button"
            role="tab"
            id={`itab-${tab.id}`}
            aria-selected={tab.id === selected.id}
            aria-controls={`ipanel-${tab.id}`}
            tabIndex={tab.id === selected.id ? 0 : -1}
            onClick={() => setCurrent(tab.id)}
            onKeyDown={(event) => {
              const rtl = document.documentElement.dir === 'rtl'
              if (event.key === 'ArrowRight') move(rtl ? -1 : 1)
              else if (event.key === 'ArrowLeft') move(rtl ? 1 : -1)
              else return
              event.preventDefault()
            }}
          >
            {tab.title}
          </button>
        ))}
      </div>
      <div
        className="itabs-panel"
        role="tabpanel"
        id={`ipanel-${selected.id}`}
        aria-labelledby={`itab-${selected.id}`}
        tabIndex={0}
      >
        {selected.content}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// «فعاليات مشابهة قد تعجبك» — a row of small cards with arrows
// ---------------------------------------------------------------------------

export type RelatedItem = {
  id: string
  href: string
  name: string
  area: string | null
  /** Formatted «from» price; null when the activity has none set. */
  price: string | null
  imageUrl: string | null
  unavailable: boolean
}

export function RelatedRow({ title, items }: { title: string; items: RelatedItem[] }) {
  const t = useTranslations()
  const rail = useRef<HTMLDivElement>(null)
  const scroll = (direction: 1 | -1) => {
    const el = rail.current
    if (!el) return
    const rtl = document.documentElement.dir === 'rtl'
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    el.scrollBy({
      left: direction * (rtl ? -1 : 1) * Math.max(200, el.clientWidth * 0.8),
      behavior: reduce ? 'auto' : 'smooth',
    })
  }
  return (
    <div className="relrow">
      <div className="relrow-head">
        <h2 className="h3">
          <Icon name="map" size={20} /> {title}
        </h2>
        {items.length > 2 ? (
          <span className="row" style={{ gap: 6 }}>
            <button
              type="button"
              className="icon-btn relrow-arrow"
              aria-label={t('act_gal_prev')}
              onClick={() => scroll(-1)}
            >
              <Icon name="chevronr" size={18} className="flip-ltr" />
            </button>
            <button
              type="button"
              className="icon-btn relrow-arrow"
              aria-label={t('act_gal_next')}
              onClick={() => scroll(1)}
            >
              <Icon name="chevronr" size={18} className="flip" />
            </button>
          </span>
        ) : null}
      </div>
      <div className="relrow-rail" ref={rail} role="list">
        {items.map((item) => (
          <article key={item.id} className="relcard" role="listitem">
            <Link className="relcard-img" href={item.href} tabIndex={-1} aria-hidden="true">
              {item.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- CMS media, already sized
                <img src={item.imageUrl} alt="" loading="lazy" decoding="async" />
              ) : null}
            </Link>
            <FavHeart activityId={item.id} name={item.name} />
            <Link className="relcard-name" href={item.href}>
              {item.name}
            </Link>
            {item.unavailable ? (
              <small className="why">{t('act_unavailable_tag')}</small>
            ) : item.price ? (
              <b className="price" dir="ltr">
                {item.price}
              </b>
            ) : null}
            {item.area ? (
              <small className="muted">
                <Icon name="pin" size={13} /> {item.area}
              </small>
            ) : null}
          </article>
        ))}
      </div>
    </div>
  )
}

/** The heart on a small card: same favourites as «Save» beside the title. */
function FavHeart({ activityId, name }: { activityId: string; name: string }) {
  const t = useTranslations()
  const { toast } = useToast()
  const favorites = useFavorites()
  const key = favoriteKey('activity', activityId)
  const pressed = favorites.keys.has(key)
  return (
    <button
      type="button"
      className="icon-btn relcard-fav"
      aria-pressed={pressed}
      aria-label={`${t('act_save')} · ${name}`}
      onClick={async () => {
        if (favorites.loaded && !favorites.signedIn) {
          toast(t('bt_fav_signin'), { link: { href: '/account', label: t('bt_login') } })
          return
        }
        const result = await toggleFavorite('activity', activityId)
        if (result.ok) setFavorite(key, result.saved)
        else if (result.reason === 'signed_out') {
          toast(t('bt_fav_signin'), { link: { href: '/account', label: t('bt_login') } })
        } else toast(t('c_error'), { error: true })
      }}
    >
      <Icon name="heart" size={16} />
    </button>
  )
}
