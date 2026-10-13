/**
 * Footer.
 *
 * A deep-forest band: the brand and contact block, three link columns, a
 * giant faint "Bali Trips" wordmark set behind them, and one legal line.
 *
 * No 'use client'. Nothing here is interactive, so the whole footer is server
 * markup and costs the client bundle nothing.
 *
 * Kept from the previous footer:
 *
 *  1. **The policy links go somewhere** — they are real routes, because on a
 *     site that takes card payments the refund terms are what wins a
 *     chargeback.
 *  2. **The link columns share the header's route table** rather than a
 *     second hand-maintained list. They are split by href, and any route the
 *     split does not name falls into the second column, so a new entry in
 *     `NAV_ROUTES` can never silently disappear from the footer.
 *  3. **Social links are configuration.** Unset profiles are dropped rather
 *     than rendered as dead links.
 */

import { getTranslations } from 'next-intl/server'

import { Icon, Logo } from '@/components/ui'
import { Link } from '@/i18n/routing'

import { CONTACT_EMAIL, WHATSAPP_DISPLAY, whatsappLink } from './contact-config'
import { HOME_HREF, NAV_ROUTES, POLICY_ROUTES } from './routes'

/** Card schemes shown as plain wordmarks. */
const PAYMENT_METHODS = ['VISA', 'MC', 'Amex', 'Mada', 'Apple Pay']

/** Where on the island — the first footer column, in this order. The rest go to "Company". */
const EXPLORE_ORDER = ['/map', '/explore', '/itineraries', '/activities', '/events', '/packages']
const EXPLORE_HREFS = new Set(EXPLORE_ORDER)

const SOCIAL_LINKS = [
  { label: 'Instagram', href: process.env.NEXT_PUBLIC_SOCIAL_INSTAGRAM },
  { label: 'TikTok', href: process.env.NEXT_PUBLIC_SOCIAL_TIKTOK },
  { label: 'YouTube', href: process.env.NEXT_PUBLIC_SOCIAL_YOUTUBE },
].filter((link): link is { label: string; href: string } => Boolean(link.href))

export async function Footer() {
  const t = await getTranslations()
  const year = new Date().getFullYear()
  const wa = whatsappLink()

  const explore = NAV_ROUTES.filter((route) => EXPLORE_HREFS.has(route.href)).sort(
    (a, b) => EXPLORE_ORDER.indexOf(a.href) - EXPLORE_ORDER.indexOf(b.href),
  )
  const company = NAV_ROUTES.filter(
    (route) => !EXPLORE_HREFS.has(route.href) && route.href !== HOME_HREF,
  )

  return (
    <footer className="bt-footer">
      {/* Decorative: the brand name as texture. The logo above carries the
          accessible name. */}
      <div className="bt-foot-wordmark" aria-hidden="true">
        Bali Trips
      </div>

      <div className="wrap bt-foot-inner">
        <div className="bt-foot-cols">
          <div className="bt-foot-brand">
            <Logo height={34} onLight={false} className="bt-foot-logo" />
            <p className="bt-foot-tagline">{t('ft_brand_b')}</p>

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

          <nav className="bt-foot-col" aria-label={t('foot_explore')}>
            <h2>{t('foot_explore')}</h2>
            {explore.map((route) => (
              <Link key={route.href} href={route.href} className="bt-foot-link">
                {t(route.key)}
              </Link>
            ))}
          </nav>

          <nav className="bt-foot-col" aria-label={t('foot_company')}>
            <h2>{t('foot_company')}</h2>
            {company.map((route) => (
              <Link key={route.href} href={route.href} className="bt-foot-link">
                {t(route.key)}
              </Link>
            ))}
          </nav>

          <nav className="bt-foot-col" aria-label={t('ft_policies')}>
            <h2>{t('ft_policies')}</h2>
            {POLICY_ROUTES.map((route) => (
              <Link key={route.href} href={route.href} className="bt-foot-link">
                {t(route.key)}
              </Link>
            ))}
          </nav>
        </div>

        <div className="bt-foot-bottom">
          <span>
            © {year} {t('foot_rights')}
          </span>
          <div className="bt-foot-pay">
            <span className="bt-foot-pay-t">{t('ft_pay')}</span>
            {PAYMENT_METHODS.map((method) => (
              <span key={method} className="bt-pay">
                {method}
              </span>
            ))}
          </div>
        </div>
      </div>
    </footer>
  )
}
