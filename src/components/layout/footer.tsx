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

import { getLocale, getTranslations } from 'next-intl/server'

import { Icon, Logo, type IconName } from '@/components/ui'
import { Link } from '@/i18n/routing'

import { whatsappHref } from './contact-config'
import { getContact } from './contact-server'
import { withoutHidden } from '@/lib/content/public-sections'
import { linkLabel, safeHref, sectionShown, type SiteLink } from '@/lib/content/page-content'
import { readPageContent } from '@/lib/content/page-content-server'

import {
  FOOTER_QUICK_ROUTES,
  INFO_ROUTES,
  POLICIES_HREF,
  POLICY_ROUTES,
  policyLink,
} from './routes'

/** What Stripe Checkout accepts on this account — see /payment-methods. */
const PAYMENT_METHODS = ['VISA', 'Mastercard', 'Amex', 'Apple Pay', 'Google Pay']

/** Studio → «محتوى الموقع» → الفوتر sets these; the env values are the fallback. */
const SOCIAL_LINKS: { id: string; label: string; icon: IconName; env: string | undefined }[] = [
  {
    id: 'instagram',
    label: 'Instagram',
    icon: 'instagram',
    env: process.env.NEXT_PUBLIC_SOCIAL_INSTAGRAM,
  },
  { id: 'tiktok', label: 'TikTok', icon: 'tiktok', env: process.env.NEXT_PUBLIC_SOCIAL_TIKTOK },
  { id: 'youtube', label: 'YouTube', icon: 'youtube', env: process.env.NEXT_PUBLIC_SOCIAL_YOUTUBE },
  { id: 'facebook', label: 'Facebook', icon: 'globe', env: undefined },
  { id: 'x', label: 'X', icon: 'globe', env: undefined },
  { id: 'snapchat', label: 'Snapchat', icon: 'globe', env: undefined },
]

/** A footer link: site paths through the locale-aware Link, others as <a>. */
function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return href.startsWith('/') ? (
    <Link href={href}>{children}</Link>
  ) : (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  )
}

export async function Footer({ hidden = [] }: { hidden?: readonly string[] } = {}) {
  const t = await getTranslations()
  const locale = await getLocale()
  const year = new Date().getFullYear()
  const contact = await getContact()
  const wa = whatsappHref(contact.whatsappDigits)
  const WHATSAPP_DISPLAY = contact.whatsappDisplay
  const CONTACT_EMAIL = contact.email
  const content = await readPageContent()
  const social = SOCIAL_LINKS.flatMap((link) => {
    const href = safeHref(content.social[link.id as keyof typeof content.social] ?? '') ?? link.env
    return href ? [{ label: link.label, icon: link.icon, href }] : []
  })
  const shown = (section: string) => sectionShown(content, 'footer', section)
  const own = (links: SiteLink[] | null) =>
    links === null
      ? null
      : links.flatMap((link) => {
          const href = safeHref(link.href)
          return href ? [{ href, label: linkLabel(link, locale, (key) => t(key)) }] : []
        })
  const quick =
    own(content.footerQuick) ??
    withoutHidden(FOOTER_QUICK_ROUTES, hidden).map((r) => ({ href: r.href, label: t(r.key) }))
  const info =
    own(content.footerInfo) ?? INFO_ROUTES.map((r) => ({ href: r.href, label: t(r.key) }))

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

          {shown('quick') && (
            <nav aria-labelledby="ftr-quick">
              <h2 id="ftr-quick">{t('ft_nav')}</h2>
              <ul>
                {quick.map((route) => (
                  <li key={route.href}>
                    <FooterLink href={route.href}>{route.label}</FooterLink>
                  </li>
                ))}
              </ul>
            </nav>
          )}

          {shown('policies') && (
            <nav aria-labelledby="ftr-policies">
              <h2 id="ftr-policies">{t('ft_policies')}</h2>
              <ul>
                {/* L14: one cookie entry — "Cookie preferences" opens /cookies,
                  whose button reopens the consent panel. */}
                <li>
                  <Link href={POLICIES_HREF}>{t('ft_p_center')}</Link>
                </li>
                {POLICY_ROUTES.map((route) => (
                  <li key={route.href}>
                    <Link href={policyLink(route.href, locale)}>{t(route.key)}</Link>
                  </li>
                ))}
              </ul>
            </nav>
          )}

          {shown('general') && (
            <div>
              <h2 id="ftr-general">{t('foot_info')}</h2>
              <ul aria-labelledby="ftr-general">
                {info.map((route) => (
                  <li key={route.href}>
                    <FooterLink href={route.href}>{route.label}</FooterLink>
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
          )}
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
