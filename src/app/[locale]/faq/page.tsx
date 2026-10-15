/**
 * Frequently asked questions.
 *
 * Its own page, linked from the footer's "General information" column: the
 * home page no longer carries an FAQ accordion. The answers are the existing
 * copy used on the home, activity and itinerary pages, grouped by topic, so
 * one wording is maintained in one place per question.
 */

import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { whatsappLink } from '@/components/layout/contact-config'
import { Accordion } from '@/components/shared'
import { locales } from '@/i18n/config'
import { Link } from '@/i18n/routing'

import { pageMetadata } from '../_meta'
import { toLocale } from '../_seo-hreflang'
import { PageBanner } from '../_ui/page-banner'
import { FAQ_GROUPS as GROUPS } from './groups'

const FAQ_PATH = '/faq'

type PageProps = { params: Promise<{ locale: string }> }

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }))
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale: raw } = await params
  const locale = toLocale(raw)
  const t = await getTranslations({ locale })
  return pageMetadata({ locale, path: FAQ_PATH, title: t('faq_title'), description: t('faq_sub') })
}

export default async function FaqPage({ params }: PageProps) {
  const { locale: raw } = await params
  const locale = toLocale(raw)
  setRequestLocale(locale)

  const t = await getTranslations({ locale })
  const wa = whatsappLink()

  return (
    <main>
      <PageBanner
        tag={t('ad_faq')}
        title={t('faq_title')}
        subtitle={t('faq_sub')}
        trail={[{ label: t('c_home'), href: '/' }, { label: t('faq_title') }]}
        breadcrumbLabel={t('c_breadcrumb')}
      />

      <div className="bt-band bt-band-ivory">
        <div className="wrap bt-pfaq">
          {GROUPS.map((group, index) => (
            <div key={group.title} style={{ marginTop: index === 0 ? 0 : 48 }}>
              <h2 id={`faq-${group.title}`} className="bt-faq-h">
                {t(group.title)}
              </h2>
              <Accordion
                className="bt-pacc"
                defaultOpen={-1}
                items={group.items.map((item) => ({
                  id: item.q,
                  question: t(item.q),
                  answer: t(item.a),
                }))}
              />
            </div>
          ))}

          <p className="bt-pfaq-more">
            {t('home_faq_more')}{' '}
            {wa !== null ? (
              <a href={wa} target="_blank" rel="noopener noreferrer">
                {t('wa_chat')}
              </a>
            ) : (
              <Link href="/contact">{t('navr_contact')}</Link>
            )}
          </p>
        </div>
      </div>
    </main>
  )
}
