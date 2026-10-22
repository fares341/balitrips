/**
 * Contact.
 *
 * Ported from `ContactPage` in design/handoff/sections-bt/page-explore.jsx:
 * four contact cards beside the message form.
 *
 * The page itself is a Server Component and is statically rendered in all
 * three locales — the only client code is `<ContactForm>`, which owns the form
 * state and calls the server action. The handoff's form sent nothing at all;
 * see ./actions.ts.
 *
 * Contact details are configuration, not markup. The handoff hard-coded the
 * WhatsApp number and the address into JSX in two places (here and the
 * footer), which had already drifted. They come from the environment with the
 * design's values as the fallback, so a real deployment can change them
 * without a code change.
 */

import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { Icon } from '@/components/ui'
import { locales } from '@/i18n/config'
import { Link } from '@/i18n/routing'

import { alternatesFor, toLocale } from '../_seo-hreflang'
import { PlainHead } from '../_ui/plain-head'
import { ContactForm } from './contact-form'
import { getContact } from '@/components/layout/contact-server'
import { DEFAULT_SHARE_IMAGE } from '@/lib/seo/site-origin'

const CONTACT_HREF = '/contact'

/** Office lines, in the design's order. */
const OFFICES = ['Seminyak, Bali · Indonesia', 'Jeddah · Saudi Arabia']

type PageParams = Promise<{ locale: string }>

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }))
}

export async function generateMetadata({ params }: { params: PageParams }): Promise<Metadata> {
  const { locale: raw } = await params
  const locale = toLocale(raw)
  const t = await getTranslations({ locale })

  return {
    title: t('navr_contact'),
    description: t('co_sub'),
    alternates: alternatesFor(CONTACT_HREF, locale),
    openGraph: {
      images: [DEFAULT_SHARE_IMAGE],
      type: 'website',
      title: t('co_title'),
      description: t('co_sub'),
      locale,
    },
  }
}

export default async function ContactPage({ params }: { params: PageParams }) {
  const { locale: raw } = await params
  setRequestLocale(raw)

  const locale = toLocale(raw)
  const t = await getTranslations({ locale })
  const contact = await getContact()
  const PHONE = contact.whatsappDisplay ?? ''
  const EMAIL = contact.email

  return (
    <main>
      {/*
        No editorial image for this page — the handoff synthesised one from
        `flickr("canggu,beach")`, which was a placeholder service, not content.
        `PageBanner` renders its neutral surface behind the veil instead.
      */}
      <PlainHead
        title={t('navr_contact')}
        lede={t('co4_sub')}
        breadcrumbLabel={t('c_breadcrumb')}
        trail={[{ label: t('c_home'), href: '/' }, { label: t('navr_contact') }]}
      />

      <section className="bg-ivory sec-tight">
        <div className="wrap bt-contact-grid">
          <div className="bt-contact-cards">
            <a
              href={`https://wa.me/${contact.whatsappDigits ?? ''}`}
              target="_blank"
              rel="noopener noreferrer"
              className="bt-contact-card"
            >
              <span className="bt-contact-ic" style={{ background: 'var(--palm-soft)' }}>
                <Icon name="whatsapp" size={22} color="var(--forest)" />
              </span>
              <span>
                <span className="bt-contact-t">{t('co_wa')}</span>
                {/*
                  `dir="ltr"` on the number: an Arabic page is RTL, and a
                  phone number is not — without it the leading `+` jumps to
                  the wrong end and the groups reorder.
                */}
                <span className="bt-contact-b" dir="ltr">
                  {PHONE}
                </span>
                <span className="bt-contact-b muted">{t('co_wa_b')}</span>
              </span>
            </a>

            <a href={`mailto:${EMAIL}`} className="bt-contact-card">
              <span className="bt-contact-ic" style={{ background: 'rgba(255,144,0,.14)' }}>
                <Icon name="mail" size={22} color="var(--orange-deep)" />
              </span>
              <span>
                <span className="bt-contact-t">{t('co_mail')}</span>
                <span className="bt-contact-b" dir="ltr">
                  {EMAIL}
                </span>
                <span className="bt-contact-b muted">{t('co_mail_b')}</span>
              </span>
            </a>

            {/*
              Not an anchor: the handoff gave these two `className
              ="bt-contact-card"` on a `div` with `cursor: default`, which is
              right — there is nowhere for them to go. The stylesheet only
              applies the hover treatment to `a.bt-contact-card`.
            */}
            <div className="bt-contact-card">
              <span className="bt-contact-ic" style={{ background: 'var(--palm-soft)' }}>
                <Icon name="pin" size={22} color="var(--forest)" />
              </span>
              <span>
                <span className="bt-contact-t">{t('co_office')}</span>
                {OFFICES.map((office) => (
                  <span key={office} className="bt-contact-b">
                    {office}
                  </span>
                ))}
              </span>
            </div>

            <div className="bt-contact-card">
              <span className="bt-contact-ic" style={{ background: 'rgba(255,144,0,.14)' }}>
                <Icon name="clock" size={22} color="var(--orange-deep)" />
              </span>
              <span>
                <span className="bt-contact-t">{t('co_hours')}</span>
                <span className="bt-contact-b">{t('co_hours_b')}</span>
              </span>
            </div>

            <Link href="/faq" className="bt-contact-card">
              <span className="bt-contact-ic" style={{ background: 'var(--palm-soft)' }}>
                <Icon name="info" size={22} color="var(--forest)" />
              </span>
              <span style={{ flex: 1 }}>
                <span className="bt-contact-t">{t('co4_quick_t')}</span>
                <span className="bt-contact-b muted">{t('co4_quick_b')}</span>
              </span>
              <Icon name="chevronr" size={18} className="flip" />
            </Link>
          </div>

          <div className="card card-pad">
            <h2 style={{ fontSize: 21, marginBottom: 18 }}>{t('co_form_t')}</h2>
            <ContactForm />
          </div>
        </div>
      </section>
    </main>
  )
}
