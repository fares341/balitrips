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
  const [active, setActive] = useState<number | 'video'>(0)
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
        <div className="mgal-main">
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

export function SectionNav({ sections }: { sections: { id: string; label: string }[] }) {
  const t = useTranslations()
  const [current, setCurrent] = useState(sections[0]?.id ?? '')

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) if (entry.isIntersecting) setCurrent(entry.target.id)
      },
      { rootMargin: '-40% 0px -55% 0px' },
    )
    for (const s of sections) {
      const el = document.getElementById(s.id)
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [sections])

  return (
    <nav className="sec-nav tabs" aria-label={t('act_sections')}>
      {sections.map((s) => (
        <a
          key={s.id}
          href={`#${s.id}`}
          aria-current={current === s.id ? 'page' : undefined}
          onClick={(event) => {
            event.preventDefault()
            const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
            document.getElementById(s.id)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' })
            setCurrent(s.id)
          }}
        >
          {s.label}
        </a>
      ))}
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
