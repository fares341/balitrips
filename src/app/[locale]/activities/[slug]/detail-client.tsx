'use client'

/**
 * Small interactive pieces of the activity page (prototype activity.html):
 * the photo grid with its lightbox, the sticky section tabs that follow the
 * scroll, and the Share / Save buttons beside the title.
 */

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'

import { toggleFavorite } from '@/app/[locale]/_actions/favorites'
import { favoriteKey, setFavorite, useFavorites } from '@/components/bt/favorites-store'
import { useToast } from '@/components/shared/toast'
import { Icon } from '@/components/ui/icon'

// ---------------------------------------------------------------------------
// Gallery + lightbox
// ---------------------------------------------------------------------------

export type GalleryImage = { id: string; url: string; alt: string }

export function Gallery({ images }: { images: GalleryImage[] }) {
  const t = useTranslations()
  const [open, setOpen] = useState<number | null>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const shown = images.slice(0, 5)

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

  if (shown.length === 0) {
    return <div className="gal gal-empty" aria-hidden="true" />
  }

  const current = open === null ? null : images[open]

  return (
    <>
      <div className={`gal gal-${Math.min(shown.length, 5)}`}>
        {shown.map((image, index) => (
          <button
            key={image.id}
            type="button"
            onClick={() => setOpen(index)}
            aria-label={`${t('act_gal_view')} ${index + 1}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- CMS media, already sized derivatives */}
            <img
              src={image.url}
              alt={index === 0 ? image.alt : ''}
              loading={index === 0 ? 'eager' : 'lazy'}
              fetchPriority={index === 0 ? 'high' : undefined}
              decoding="async"
            />
            {index === 0 ? (
              <span className="all btn btn-light btn-sm">
                <Icon name="grid" size={16} /> {t('act_gal_all')}{' '}
                <span dir="ltr">{`(${images.length})`}</span>
              </span>
            ) : null}
          </button>
        ))}
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
