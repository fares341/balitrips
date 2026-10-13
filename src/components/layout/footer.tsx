/**
 * Footer.
 *
 * A deep-forest band in the four columns the client specified:
 *
 *   1. about the platform — logo, one paragraph, a link to /about;
 *   2. quick links — every public page (`NAV_ROUTES`);
 *   3. policies — privacy, terms, cancellation & refund, platform use, map
 *      use, then cookies and image credits (`POLICY_ROUTES`);
 *   4. general information — FAQ, contact, payment methods (with the card
 *      marks), and the social and contact channels.
 *
 * Below them: the logo, the copyright line and the site version.
 *
 * No 'use client'. Nothing here is interactive, so the whole footer is server
 * markup and costs the client bundle nothing.
 *
 * Kept from the previous footer:
 *
 *  1. **The policy links go somewhere** — they are real routes, because on a
 *     site that takes card payments the refund terms are what wins a
 *     chargeback.
 *  2. **The quick links are the header's route table**, not a second
 *     hand-maintained list, so a page added to `NAV_ROUTES` appears here too.
 *  3. **Social links are configuration.** Unset profiles are dropped rather
 *     than rendered as dead links.
 */

import { getTranslations } from 'next-intl/server'

import { Icon, Logo } from '@/components/ui'
import { Link } from '@/i18n/routing'
import { APP_VERSION } from '@/lib/app-version'

import { CONTACT_EMAIL, WHATSAPP_DISPLAY, whatsappLink } from './contact-config'
import { INFO_ROUTES, NAV_ROUTES, POLICY_ROUTES } from './routes'

/**
 * Card marks shown beside "Payment methods". What Stripe Checkout accepts on
 * this account — see /payment-methods, which explains each one.
 */
const PAYMENT_METHODS = ['VISA', 'Mastercard', 'Amex', 'Apple Pay', 'Google Pay']

const SOCIAL_LINKS = [
  { label: 'Instagram', href: process.env.NEXT_PUBLIC_SOCIAL_INSTAGRAM },
  { label: 'TikTok', href: process.env.NEXT_PUBLIC_SOCIAL_TIKTOK },
  { label: 'YouTube', href: process.env.NEXT_PUBLIC_SOCIAL_YOUTUBE },
].filter((link): link is { label: string; href: string } => Boolean(link.href))

export async function Footer() {
  const t = await getTranslations()
  const year = new Date().getFullYear()
  const wa = whatsappLink()

  return (
    <footer className="bt-footer">
      {/* Decorative: the brand name as texture. The logo carries the
          accessible name. */}
      <div className="bt-foot-wordmark" aria-hidden="true">
        Bali Trips
      </div>

      <div className="wrap bt-foot-inner">
        <div className="bt-foot-cols">
          {/* 1 — about the platform */}
          <div className="bt-foot-col bt-foot-brand">
            <h2 id="foot-about">{t('foot_about')}</h2>
            <p className="bt-foot-tagline">{t('ft_brand_b')}</p>
            <Link href="/about" className="bt-foot-more">
              {t('home_intro_cta')}
              <Icon name="arrow" size={15} className="flip" />
            </Link>
          </div>

          {/* 2 — quick links to every page */}
          <nav className="bt-foot-col bt-foot-quick" aria-labelledby="foot-quick">
            <h2 id="foot-quick">{t('ft_nav')}</h2>
            <div className="bt-foot-quick-list">
              {NAV_ROUTES.map((route) => (
                <Link key={route.href} href={route.href} className="bt-foot-link">
                  {t(route.key)}
                </Link>
              ))}
            </div>
          </nav>

          {/* 3 — policies */}
          <nav className="bt-foot-col" aria-labelledby="foot-policies">
            <h2 id="foot-policies">{t('ft_policies')}</h2>
            {POLICY_ROUTES.map((route) => (
              <Link key={route.href} href={route.href} className="bt-foot-link">
                {t(route.key)}
              </Link>
            ))}
          </nav>

          {/* 4 — general information */}
          <div className="bt-foot-col">
            <h2 id="foot-info">{t('foot_info')}</h2>
            {INFO_ROUTES.map((route) => (
              <Link key={route.href} href={route.href} className="bt-foot-link">
                {t(route.key)}
              </Link>
            ))}

            <ul className="bt-foot-pay" aria-label={t('ft_pay')}>
              {PAYMENT_METHODS.map((method) => (
                <li key={method} className="bt-pay">
                  {method}
                </li>
              ))}
            </ul>

            <h3 className="bt-foot-sub">{t('foot_social')}</h3>
            <div className="bt-foot-contact">
              {wa !== null && (
                <a href={wa} className="bt-foot-line" target="_blank" rel="noopener noreferrer">
                  <Icon name="whatsapp" size={17} />
                  {/* Isolated LTR run: in Arabic the bidi algorithm otherwise
                      reverses the digit groups of a phone number. */}
                  <span dir="ltr">{WHATSAPP_DISPLAY}</span>
                </a>
              )}
              <a href={`mailto:${CONTACT_EMAIL}`} className="bt-foot-line">
                <Icon name="mail" size={17} />
                <span dir="ltr">{CONTACT_EMAIL}</span>
              </a>
            </div>
            {SOCIAL_LINKS.length > 0 && (
              <div className="bt-foot-social">
                {SOCIAL_LINKS.map((social) => (
                  <a
                    key={social.label}
                    href={social.href}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {social.label}
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="bt-foot-bottom">
          <Logo height={28} onLight={false} className="bt-foot-logo" />
          <span>
            © {year} {t('foot_rights')}
          </span>
          <span className="bt-foot-ver" dir="ltr">
            v{APP_VERSION}
          </span>
        </div>
      </div>
    </footer>
  )
}
