/**
 * Footer — v3 package (bt.js `renderFooter`, screens 01-home / 29-ui-states).
 *
 * Deep-forest band with the palm arc in the corner and four columns:
 *   1. light logo, one paragraph about the platform, round social buttons;
 *   2. Quick links (`FOOTER_QUICK_ROUTES`, the package's order);
 *   3. Policies (`POLICY_ROUTES` — the package's five plus cookies and image
 *      credits, which the licences require us to link);
 *   4. General — FAQ, contact, payment methods with the card marks, and the
 *      contact lines.
 * Bottom row: light logo, copyright, site version (the real build version).
 *
 * Social buttons and the WhatsApp line come from configuration; unset ones
 * are dropped rather than rendered as dead links.
 *
 * No 'use client'.
 */

import { CookieSettingsButton } from '@/components/analytics/consent-banner'
import { getTranslations } from 'next-intl/server'

import { Icon, Logo, type IconName } from '@/components/ui'
import { Link } from '@/i18n/routing'

import { whatsappHref } from './contact-config'
import { getContact } from './contact-server'
import { FOOTER_QUICK_ROUTES, INFO_ROUTES, POLICY_ROUTES } from './routes'

/** What Stripe Checkout accepts on this account — see /payment-methods. */
const PAYMENT_METHODS = ['VISA', 'Mastercard', 'Amex', 'Apple Pay', 'Google Pay']

const SOCIAL_LINKS: { label: string; icon: IconName; href: string | undefined }[] = [
  { label: 'Instagram', icon: 'instagram', href: process.env.NEXT_PUBLIC_SOCIAL_INSTAGRAM },
  { label: 'TikTok', icon: 'tiktok', href: process.env.NEXT_PUBLIC_SOCIAL_TIKTOK },
  { label: 'YouTube', icon: 'youtube', href: process.env.NEXT_PUBLIC_SOCIAL_YOUTUBE },
]

export async function Footer() {
  const t = await getTranslations()
  const year = new Date().getFullYear()
  const contact = await getContact()
  const wa = whatsappHref(contact.whatsappDigits)
  const WHATSAPP_DISPLAY = contact.whatsappDisplay
  const CONTACT_EMAIL = contact.email
  const social = SOCIAL_LINKS.filter(
    (link): link is { label: string; icon: IconName; href: string } => Boolean(link.href),
  )

  return (
    <footer className="ftr">
      <div className="arc" aria-hidden="true" />
      <div className="wrap">
        <div className="ftr-grid">
          <div className="ftr-about">
            <Logo variant="light" height={42} className="ftr-logo" />
            <p>{t('bt_ftr_about')}</p>
            {(social.length > 0 || wa !== null) && (
              <div className="soc" role="group" aria-label={t('foot_social')}>
                {social.map((link) => (
                  <a
                    key={link.label}
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={link.label}
                  >
                    <Icon name={link.icon} size={18} />
                  </a>
                ))}
                {wa !== null && (
                  <a href={wa} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp">
                    <Icon name="whatsapp" size={18} />
                  </a>
                )}
              </div>
            )}
          </div>

          <nav aria-labelledby="ftr-quick">
            <h4 id="ftr-quick">{t('ft_nav')}</h4>
            <ul>
              {FOOTER_QUICK_ROUTES.map((route) => (
                <li key={route.href}>
                  <Link href={route.href}>{t(route.key)}</Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-labelledby="ftr-policies">
            <h4 id="ftr-policies">{t('ft_policies')}</h4>
            <ul>
              {POLICY_ROUTES.map((route) => (
                <li key={route.href}>
                  <Link href={route.href}>{t(route.key)}</Link>
                </li>
              ))}
              <li>
                <CookieSettingsButton />
              </li>
            </ul>
          </nav>

          <div>
            <h4 id="ftr-general">{t('foot_info')}</h4>
            <ul aria-labelledby="ftr-general">
              {INFO_ROUTES.map((route) => (
                <li key={route.href}>
                  <Link href={route.href}>{t(route.key)}</Link>
                </li>
              ))}
              <li style={{ marginTop: 8 }}>
                <Link href="/payment-methods" className="ftr-pay-label">
                  {t('pm_title')}
                </Link>
                <div className="pay-row" aria-label={t('ft_pay')} role="list">
                  {PAYMENT_METHODS.map((method) => (
                    <span key={method} role="listitem" dir="ltr">
                      {method}
                    </span>
                  ))}
                </div>
              </li>
              <li className="ftr-contact" style={{ marginTop: 8 }}>
                {wa !== null && WHATSAPP_DISPLAY !== null && (
                  <a href={wa} target="_blank" rel="noopener noreferrer">
                    <Icon name="whatsapp" size={16} />
                    <span dir="ltr">{WHATSAPP_DISPLAY}</span>
                  </a>
                )}
                <a href={`mailto:${CONTACT_EMAIL}`}>
                  <Icon name="mail" size={16} />
                  <span dir="ltr">{CONTACT_EMAIL}</span>
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="ftr-bottom">
          <Logo variant="light" height={26} />
          <span>
            © <span dir="ltr">{year}</span> {t('foot_rights')}
          </span>
        </div>
      </div>
    </footer>
  )
}
