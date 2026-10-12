/**
 * Footer.
 *
 * Ported from `Footer` in design/handoff/bt-ui.jsx (lines 411-451): four
 * columns — brand, quick links, policies, contact and payment — on the forest
 * surface.
 *
 * No 'use client'. Nothing here is interactive, so the whole footer is server
 * markup and costs the client bundle nothing.
 *
 * Three fixes over the handoff:
 *
 *  1. **The policy links go somewhere.** They were `href="#"`. On a site that
 *     takes card payments the cancellation ladder and refund terms are the
 *     evidence that wins a chargeback — they have to be reachable, linkable
 *     and archivable, so they are real routes.
 *  2. **The nav column shares the header's route table** instead of repeating
 *     a second hand-maintained copy of the same ten entries.
 *  3. **Social links are configuration, not markup.** The handoff shipped
 *     three `href="#"` anchors. Real profile URLs are business data, so they
 *     come from the environment and the row renders only once they are set —
 *     better an absent row than three links that go nowhere or, worse, to an
 *     account the brand does not own.
 */

import { getTranslations } from 'next-intl/server'

import { Icon, Logo } from '@/components/ui'
import { Link } from '@/i18n/routing'

import { NAV_ROUTES, POLICY_ROUTES } from './routes'

/** Contact details carried over from the design's footer. */
const CONTACT = {
  phone: '+966 4815 654 4666',
  website: 'https://www.balitrips.com',
  websiteLabel: 'www.balitrips.com',
  offices: 'Bali · Jeddah, KSA',
}

/** Card schemes shown as plain wordmarks, exactly as in the design. */
const PAYMENT_METHODS = ['VISA', 'MC', 'Amex', 'Mada', 'Apple Pay']

/**
 * Set `NEXT_PUBLIC_SOCIAL_INSTAGRAM`, `…_TIKTOK` and `…_YOUTUBE` to the real
 * profile URLs. Unset entries are dropped rather than rendered dead.
 */
const SOCIAL_LINKS = [
  { label: 'Instagram', href: process.env.NEXT_PUBLIC_SOCIAL_INSTAGRAM },
  { label: 'TikTok', href: process.env.NEXT_PUBLIC_SOCIAL_TIKTOK },
  { label: 'YouTube', href: process.env.NEXT_PUBLIC_SOCIAL_YOUTUBE },
].filter((link): link is { label: string; href: string } => Boolean(link.href))

export async function Footer() {
  const t = await getTranslations()
  const year = new Date().getFullYear()

  return (
    <footer className="bg-forest bt-footer">
      <div className="wrap">
        <div className="bt-foot-cols">
          <div className="bt-foot-brand">
            <div
              style={{
                background: 'var(--ivory)',
                display: 'inline-block',
                padding: '10px 14px',
                borderRadius: 14,
              }}
            >
              <Logo height={30} />
            </div>
            <p
              style={{
                color: 'rgba(255,251,248,0.8)',
                marginTop: 16,
                maxWidth: '38ch',
                lineHeight: 1.6,
              }}
            >
              {t('ft_brand_b')}
            </p>
            {SOCIAL_LINKS.length > 0 && (
              <div style={{ display: 'flex', gap: 12, marginTop: 18 }}>
                {SOCIAL_LINKS.map((social) => (
                  <a
                    key={social.label}
                    href={social.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: 'var(--palm)', fontSize: 13.5, fontWeight: 600 }}
                  >
                    {social.label}
                  </a>
                ))}
              </div>
            )}
          </div>

          <nav className="bt-foot-col" aria-label={t('ft_nav')}>
            <h4>{t('ft_nav')}</h4>
            {NAV_ROUTES.map((route) => (
              <Link key={route.href} href={route.href} className="bt-foot-link">
                {t(route.key)}
              </Link>
            ))}
          </nav>

          <nav className="bt-foot-col" aria-label={t('ft_policies')}>
            <h4>{t('ft_policies')}</h4>
            {POLICY_ROUTES.map((route) => (
              <Link key={route.href} href={route.href} className="bt-foot-link">
                {t(route.key)}
              </Link>
            ))}
          </nav>

          <div className="bt-foot-col">
            <h4>{t('ft_contact')}</h4>
            <span className="bt-foot-line">
              <Icon name="whatsapp" size={16} color="var(--palm)" /> {CONTACT.phone}
            </span>
            <a
              href={CONTACT.website}
              className="bt-foot-line"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Icon name="globe" size={16} color="var(--palm)" /> {CONTACT.websiteLabel}
            </a>
            <span className="bt-foot-line">
              <Icon name="pin" size={16} color="var(--palm)" /> {CONTACT.offices}
            </span>

            <div style={{ marginTop: 14 }}>
              <div
                style={{
                  fontSize: 12,
                  color: 'rgba(255,251,248,0.6)',
                  marginBottom: 8,
                  textTransform: 'uppercase',
                  letterSpacing: '.08em',
                  fontWeight: 700,
                }}
              >
                {t('ft_pay')}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {PAYMENT_METHODS.map((method) => (
                  <span key={method} className="bt-pay">
                    {method}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="bt-foot-bottom">
          <span>
            © {year} {t('foot_rights')}
          </span>
        </div>
      </div>
    </footer>
  )
}
