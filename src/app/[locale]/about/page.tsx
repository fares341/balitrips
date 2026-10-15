/**
 * About — v3 screen 23 (design-reference/prototype/about.html).
 *
 *   hero (arched photo, "Your gateway to Bali", our local experts) ·
 *   vision & mission · what makes us different · why Bali · how we earn
 *   your trust
 *
 * No personal name (client revision 1: "our local experts") and no numbers:
 * the package shows real figures only once they are verified.
 * Statically rendered in all three locales.
 */

import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { Breadcrumbs, LinkButton } from '@/components/bt'
import { Icon } from '@/components/ui'
import { locales } from '@/i18n/config'
import { Link } from '@/i18n/routing'

import { alternatesFor, toLocale } from '../_seo-hreflang'

const ABOUT_HREF = '/about'

/** "What makes us different" — title/body message keys. */
const DIFF = ['ab4_d1', 'ab4_d2', 'ab4_d3', 'ab4_d4', 'ab4_d5', 'ab4_d6'] as const
/** "How we earn your trust". */
const TRUST = ['ab4_t1', 'ab4_t2', 'ab4_t3', 'ab4_t4'] as const

type PageParams = Promise<{ locale: string }>

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }))
}

export async function generateMetadata({ params }: { params: PageParams }): Promise<Metadata> {
  const { locale: raw } = await params
  const locale = toLocale(raw)
  const t = await getTranslations({ locale })

  return {
    title: t('navr_about'),
    description: t('ab4_lede'),
    alternates: alternatesFor(ABOUT_HREF, locale),
    openGraph: {
      type: 'website',
      title: t('ab4_title'),
      description: t('ab4_lede'),
      locale,
    },
  }
}

export default async function AboutPage({ params }: { params: PageParams }) {
  const { locale: raw } = await params
  setRequestLocale(raw)

  const locale = toLocale(raw)
  const t = await getTranslations({ locale })

  const checks = (keys: readonly string[]) => (
    <ul className="ab-diff" role="list">
      {keys.map((key) => (
        <li key={key}>
          <Icon name="check" size={20} stroke={2.4} />
          <span>
            <b>{t(`${key}_t`)}</b>
            <span className="muted">{t(`${key}_b`)}</span>
          </span>
        </li>
      ))}
    </ul>
  )

  return (
    <main className="ab-page">
      <section className="ab-hero">
        <div className="arc" aria-hidden="true" />
        <div className="wrap">
          <Breadcrumbs
            label={t('c_breadcrumb')}
            trail={[{ label: t('c_home'), href: '/' }, { label: t('navr_about') }]}
          />
          <div className="ab-grid">
            <div className="stack" style={{ gap: 18 }}>
              <span className="eyebrow">{t('navr_about')}</span>
              <h1 className="display ab-title">{t('ab4_title')}</h1>
              <p className="lede">{t('ab4_lede')}</p>
              <p className="muted">{t('ab4_story')}</p>
              <div className="row">
                <LinkButton href="/services">{t('c_startplan')}</LinkButton>
                <LinkButton href="/contact" variant="ghost">
                  {t('ab4_contact')}
                </LinkButton>
              </div>
            </div>
            <div className="ab-img">
              {/* eslint-disable-next-line @next/next/no-img-element -- fixed brand photo */}
              <img src="/brand/temple-gate.jpg" alt="" />
            </div>
          </div>
        </div>
      </section>

      <section className="sec-tight">
        <div className="wrap ab-vm">
          <div>
            <h2>{t('about_vision_t')}</h2>
            <p>{t('ab4_vision')}</p>
          </div>
          <div>
            <h2>{t('about_mission_t')}</h2>
            <p>{t('ab4_mission')}</p>
          </div>
        </div>
      </section>

      <section className="sec">
        <div className="wrap stack" style={{ gap: 22 }}>
          <span className="eyebrow">{t('ab4_diff_eyebrow')}</span>
          <h2 className="h2">{t('ab4_diff_title')}</h2>
          {checks(DIFF)}
        </div>
      </section>

      <section className="sec bg-ivory2">
        <div className="wrap ab-why">
          <div className="stack" style={{ gap: 14 }}>
            <span className="eyebrow">{t('ab4_why_eyebrow')}</span>
            <h2 className="h2">{t('ab4_why_title')}</h2>
            <p className="muted">{t('ab4_why_b')}</p>
            <Link className="link" href="/explore" style={{ alignSelf: 'flex-start' }}>
              {t('ab4_why_link')}
            </Link>
          </div>
          <div className="ph">
            {/* eslint-disable-next-line @next/next/no-img-element -- fixed brand photos */}
            <img src="/brand/rice-walk.jpg" alt="" loading="lazy" />
            {/* eslint-disable-next-line @next/next/no-img-element -- fixed brand photos */}
            <img src="/brand/kelingking.jpg" alt="" loading="lazy" />
          </div>
        </div>
      </section>

      <section className="sec">
        <div className="wrap stack" style={{ gap: 18 }}>
          <span className="eyebrow">{t('ab4_trust_eyebrow')}</span>
          <h2 className="h2">{t('ab4_trust_title')}</h2>
          {checks(TRUST)}
        </div>
      </section>
    </main>
  )
}
