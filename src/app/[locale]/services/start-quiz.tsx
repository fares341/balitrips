'use client'

/**
 * "Not sure where to start? Answer two questions" (services.html `.quiz`).
 *
 * Two answers — how many days, who is travelling — and the page suggests
 * one real itinerary (the closest length) and one real package (the closest
 * length that fits the group), each opening its own page, plus a custom trip.
 * Nothing is stored or sent; the suggestions are picked from the catalogue
 * the server passed in.
 */

import { useState } from 'react'
import { useTranslations } from 'next-intl'

import { Chip } from '@/components/bt/chip'
import { Icon } from '@/components/ui'
import { Link } from '@/i18n/routing'

export type QuizOption = {
  id: string
  kind: 'itinerary' | 'package'
  href: string
  name: string
  days: number
  /** Packages only. */
  maxGuests: number | null
  /** Formatted. */
  price: string
  image: string | null
}

const DAYS = [
  { key: '3', days: 3, label: 'sv4_q_d3' },
  { key: '5', days: 5, label: 'sv4_q_d5' },
  { key: '7', days: 7, label: 'sv4_q_d7' },
  { key: '10', days: 10, label: 'sv4_q_d10' },
] as const

const WHO = [
  { key: 'couple', guests: 2, label: 'sv4_q_couple' },
  { key: 'family', guests: 4, label: 'sv4_q_family' },
  { key: 'friends', guests: 4, label: 'sv4_q_friends' },
  { key: 'relax', guests: 2, label: 'sv4_q_relax' },
] as const

function closest(options: readonly QuizOption[], days: number): QuizOption | undefined {
  return [...options].sort((a, b) => Math.abs(a.days - days) - Math.abs(b.days - days))[0]
}

export function StartQuiz({
  itineraries,
  packages,
  customHref,
}: {
  itineraries: readonly QuizOption[]
  packages: readonly QuizOption[]
  customHref: string
}) {
  const t = useTranslations()
  const [days, setDays] = useState<(typeof DAYS)[number] | null>(null)
  const [who, setWho] = useState<(typeof WHO)[number] | null>(null)

  const itinerary = days ? closest(itineraries, days.days) : undefined
  const fitting = who ? packages.filter((p) => (p.maxGuests ?? 0) >= who.guests) : []
  const pkg = days && who ? closest(fitting.length > 0 ? fitting : packages, days.days) : undefined

  return (
    <div className="wrap sv-quiz">
      <div className="stack" style={{ gap: 12 }}>
        <span className="eyebrow">{t('sv4_q_eyebrow')}</span>
        <h2 className="h2">{t('sv4_q_title')}</h2>
        <div className="field">
          <span className="label" id="sv-q-days">
            {t('sv4_q_days')}
          </span>
          <div className="chips" role="group" aria-labelledby="sv-q-days">
            {DAYS.map((option) => (
              <Chip
                key={option.key}
                active={days?.key === option.key}
                onClick={() => setDays(option)}
              >
                {t(option.label)}
              </Chip>
            ))}
          </div>
        </div>
        <div className="field">
          <span className="label" id="sv-q-who">
            {t('sv4_q_who')}
          </span>
          <div className="chips" role="group" aria-labelledby="sv-q-who">
            {WHO.map((option) => (
              <Chip
                key={option.key}
                active={who?.key === option.key}
                onClick={() => setWho(option)}
              >
                {t(option.label)}
              </Chip>
            ))}
          </div>
        </div>
      </div>

      <div className="stack" style={{ gap: 10 }} aria-live="polite">
        {days === null || who === null ? (
          <div className="panel panel-ivory empty sv-q-empty">
            <span className="ill" aria-hidden="true">
              <Icon name="sparkle" size={34} />
            </span>
            <b>{t('sv4_q_pick')}</b>
          </div>
        ) : (
          <>
            <b style={{ color: 'var(--forest)' }}>{t('sv4_q_suggest')}</b>
            {[itinerary, pkg].map((option) =>
              option === undefined ? null : (
                <Link key={option.id} href={option.href} className="sv-sugg">
                  {option.image !== null ? (
                    // eslint-disable-next-line @next/next/no-img-element -- catalogue photo thumbnail
                    <img src={option.image} alt="" loading="lazy" />
                  ) : (
                    <span className="sv-sugg-ph" aria-hidden="true">
                      <Icon name={option.kind === 'itinerary' ? 'doc' : 'box'} size={26} />
                    </span>
                  )}
                  <span className="sv-sugg-b">
                    <span
                      className={option.kind === 'itinerary' ? 'tag tag-palm' : 'tag tag-orange'}
                    >
                      {t(option.kind === 'itinerary' ? 'sv4_q_iti' : 'sv4_q_pkg')}
                    </span>
                    <b>{option.name}</b>
                    <small className="muted">
                      {t('c_days_n', { n: option.days })} · <bdi dir="ltr">{option.price}</bdi>
                    </small>
                  </span>
                  <Icon name="chevronr" size={20} className="flip" />
                </Link>
              ),
            )}
            <Link href={customHref} className="btn btn-ghost" style={{ alignSelf: 'flex-start' }}>
              {t('sv4_q_custom')}
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
