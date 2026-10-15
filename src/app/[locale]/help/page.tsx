/**
 * Help center — v3 screen 26 (design-reference/prototype/help.html).
 *
 *   forest heading with a search box (→ the site search) · help topics, each
 *   opening its own page · track a booking · talk to a person
 *
 * Statically rendered in all three locales.
 */

import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { Breadcrumbs, LinkButton } from '@/components/bt'
import { Icon, type IconName } from '@/components/ui'
import { locales } from '@/i18n/config'
import { getPathname, Link } from '@/i18n/routing'

import { pageMetadata } from '../_meta'
import { toLocale } from '../_seo-hreflang'

const HELP_PATH = '/help'

const TOPICS: readonly { icon: IconName; key: string; href: string }[] = [
  { icon: 'cal', key: 'hp_t1', href: '/faq' },
  { icon: 'card', key: 'hp_t2', href: '/refund' },
  { icon: 'map', key: 'hp_t3', href: '/map-use' },
  { icon: 'doc', key: 'hp_t4', href: '/account/schedules' },
  { icon: 'user', key: 'hp_t5', href: '/account' },
]

type PageProps = { params: Promise<{ locale: string }> }

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }))
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale: raw } = await params
  const locale = toLocale(raw)
  const t = await getTranslations({ locale })
  return pageMetadata({ locale, path: HELP_PATH, title: t('hp_nav'), description: t('hp_title') })
}

export default async function HelpPage({ params }: PageProps) {
  const { locale: raw } = await params
  const locale = toLocale(raw)
  setRequestLocale(locale)

  const t = await getTranslations({ locale })

  return (
    <main>
      <section className="hp-head">
        <div className="arc" aria-hidden="true" />
        <div className="wrap">
          <div className="hp-crumbs">
            <Breadcrumbs
              light
              label={t('c_breadcrumb')}
              trail={[{ label: t('c_home'), href: '/' }, { label: t('hp_nav') }]}
            />
          </div>
          <h1 className="h1">{t('hp_title')}</h1>
          <form
            className="hp-search"
            action={getPathname({ href: '/search', locale })}
            method="get"
            role="search"
          >
            <input
              name="q"
              type="search"
              placeholder={t('hp_search_ph')}
              aria-label={t('hp_search')}
              autoComplete="off"
              enterKeyHint="search"
            />
            <button className="btn btn-primary btn-sm" type="submit">
              {t('hp_search')}
            </button>
          </form>
        </div>
      </section>

      <section className="sec">
        <div className="wrap stack" style={{ gap: 24 }}>
          <ul className="hp-topics" role="list">
            {TOPICS.map((topic) => (
              <li key={topic.key}>
                <Link href={topic.href}>
                  <span className="ic" aria-hidden="true">
                    <Icon name={topic.icon} size={22} />
                  </span>
                  <b>{t(`${topic.key}_t`)}</b>
                  <span className="muted">{t(`${topic.key}_b`)}</span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="grid hp-more">
            <div className="panel stack">
              <b style={{ color: 'var(--forest)' }}>{t('hp_track_t')}</b>
              <span className="muted">{t('hp_track_b')}</span>
              <LinkButton href="/account" variant="forest" size="sm">
                {t('hp_track_cta')}
              </LinkButton>
            </div>
            <div className="panel stack">
              <b style={{ color: 'var(--forest)' }}>{t('hp_talk_t')}</b>
              <span className="muted">{t('hp_talk_b')}</span>
              <LinkButton href="/contact" variant="ghost" size="sm">
                {t('navr_contact')}
              </LinkButton>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
