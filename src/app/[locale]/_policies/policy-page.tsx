/**
 * The prose shell shared by the policy pages.
 *
 * In the handoff these were `href="#"` in the footer — four dead anchors on a
 * site that takes card payments. That is not only a broken link:
 *
 *  - a payment provider will not open a live account without a published
 *    refund and cancellation policy, so `/refund` is a prerequisite for taking
 *    money at all;
 *  - the refund terms are the evidence that wins a chargeback, and evidence
 *    has to be at a stable, archivable URL that a card scheme can be pointed
 *    at months later;
 *  - a cookie banner cannot link to "cookie preferences" if there is no page
 *    describing what is set.
 *
 * So the routes exist now, with the real structure — heading, effective date,
 * body, a way to ask a question — and a body that says plainly that the
 * wording is still with the lawyers. A page that admits it is a draft is
 * honest; four `#` links are not, and neither is invented legal text, which is
 * worse than none: it would be quoted back at the business in a dispute.
 *
 * Route-private (`_policies` is not a route segment). Each policy page
 * files is a thin wrapper that names its policy.
 */

import type { Metadata } from 'next'
import { getFormatter, getTranslations } from 'next-intl/server'

import { Breadcrumbs, LinkButton } from '@/components/shared'
import { POLICY_ROUTES } from '@/components/layout/routes'
import { Icon } from '@/components/ui'
import type { Locale } from '@/i18n/config'
import { Link } from '@/i18n/routing'

import { alternatesFor } from '../_seo-hreflang'

export type PolicyId = 'terms' | 'privacy' | 'refund' | 'cookies' | 'platform-use' | 'map-use'

type PolicyCopy = {
  /** Message key for the page title. Shared with the footer's link label. */
  titleKey: string
  /** Message key for the standfirst under the title. */
  subKey: string
  /** Message key for the "what this will cover" paragraph. */
  scopeKey: string
  /**
   * The date this text was last changed, as `YYYY-MM-DD`.
   *
   * A literal, not `new Date()`: a date that moves with every deployment tells
   * a reader nothing and would silently rewrite the effective date of terms
   * someone has already agreed to. Update it when the wording changes.
   */
  updated: string
  /**
   * Headed sections of plain policy text. Pages that have them render them in
   * place of the "what this page will cover" paragraph; the placeholder note
   * still stands above them until the wording is signed off.
   */
  sections?: readonly { titleKey: string; bodyKey: string }[]
}

/** `pol_pu1_t`/`pol_pu1_b` … `pol_puN_*` — numbered key pairs, in order. */
function sectionKeys(prefix: string, count: number): { titleKey: string; bodyKey: string }[] {
  return Array.from({ length: count }, (_, index) => ({
    titleKey: `${prefix}${index + 1}_t`,
    bodyKey: `${prefix}${index + 1}_b`,
  }))
}

const POLICIES: Record<PolicyId, PolicyCopy> = {
  terms: {
    titleKey: 'ft_p_terms',
    subKey: 'pol_terms_sub',
    scopeKey: 'pol_terms_scope',
    updated: '2026-08-07',
  },
  privacy: {
    titleKey: 'ft_p_privacy',
    subKey: 'pol_privacy_sub',
    scopeKey: 'pol_privacy_scope',
    updated: '2026-08-07',
  },
  refund: {
    titleKey: 'ft_p_refund',
    subKey: 'pol_refund_sub',
    scopeKey: 'pol_refund_scope',
    updated: '2026-08-07',
  },
  cookies: {
    titleKey: 'ft_p_cookies',
    subKey: 'pol_cookies_sub',
    scopeKey: 'pol_cookies_scope',
    updated: '2026-08-07',
  },
  'platform-use': {
    titleKey: 'ft_p_platform_use',
    subKey: 'pol_platform_sub',
    scopeKey: 'pol_platform_scope',
    updated: '2026-10-13',
    sections: sectionKeys('pol_pu', 6),
  },
  /**
   * Matches what the product actually enforces: per-plan device limits
   * (src/lib/security/devices.ts), the email-and-date watermark and the
   * copy/print blocking on the map (map/map-protect.tsx), and automatic
   * suspension on abuse (src/lib/security/bans.ts).
   */
  'map-use': {
    titleKey: 'ft_p_map_use',
    subKey: 'pol_map_sub',
    scopeKey: 'pol_map_scope',
    updated: '2026-10-13',
    sections: sectionKeys('pol_mu', 6),
  },
}

/**
 * The page's own path.
 *
 * Resolved from the shared route table so the canonical URL cannot drift from
 * the link in the footer. The folder name is the fallback, and is also what
 * actually determines the route — so the fallback is correct by construction
 * rather than a guess.
 */
export function policyHref(id: PolicyId): string {
  const key = POLICIES[id].titleKey
  return POLICY_ROUTES.find((route) => route.key === key)?.href ?? `/${id}`
}

/**
 * Metadata for one policy.
 *
 * `robots: { index: false }` while the body is a placeholder: an indexed page
 * that says "pending legal review" is worse than no result, and the page will
 * be re-crawled the moment the directive is removed with the real text.
 */
export async function policyMetadata(id: PolicyId, locale: Locale): Promise<Metadata> {
  const copy = POLICIES[id]
  const t = await getTranslations({ locale })

  return {
    title: t(copy.titleKey),
    description: t(copy.subKey),
    alternates: alternatesFor(policyHref(id), locale),
    robots: { index: false, follow: true },
    openGraph: {
      type: 'website',
      title: t(copy.titleKey),
      description: t(copy.subKey),
      locale,
    },
  }
}

export async function PolicyPage({ id, locale }: { id: PolicyId; locale: Locale }) {
  const copy = POLICIES[id]

  const [t, format] = await Promise.all([getTranslations({ locale }), getFormatter({ locale })])

  const title = t(copy.titleKey)

  // Parsed as UTC and formatted as UTC, so the date reads the same in Bali,
  // Jeddah and New York. A bare `new Date('2026-08-07')` is UTC midnight and
  // would render as the 6th for any reader west of Greenwich.
  const updatedAt = new Date(`${copy.updated}T00:00:00Z`)

  return (
    <main className="bt-detailwrap">
      <div className="wrap">
        <Breadcrumbs
          label={t('c_breadcrumb')}
          trail={[{ label: t('c_home'), href: '/' }, { label: title }]}
        />
        <div className="pol-lay">
          {/* The policies side by side (v3 policy.html), the current one filled */}
          <nav className="pol-nav" aria-label={t('pol_eyebrow')}>
            {POLICY_ROUTES.map((route) => (
              <Link
                key={route.href}
                href={route.href}
                aria-current={route.key === copy.titleKey ? 'page' : undefined}
              >
                {t(route.key)}
              </Link>
            ))}
          </nav>
          <div className="pol-body">
            <div className="eyebrow" style={{ marginTop: 18 }}>
              <span
                aria-hidden="true"
                style={{ width: 18, height: 2, background: 'var(--orange)', borderRadius: 2 }}
              />
              {t('pol_eyebrow')}
            </div>

            <h1 style={{ fontSize: 'clamp(28px,5vw,44px)', marginTop: 14 }}>{title}</h1>

            <p className="lede" style={{ marginTop: 16 }}>
              {t(copy.subKey)}
            </p>

            <p className="muted" style={{ fontSize: 13.5, fontWeight: 600, marginTop: 16 }}>
              {t('pol_updated')}:{' '}
              <time dateTime={copy.updated}>
                {format.dateTime(updatedAt, { dateStyle: 'long', timeZone: 'UTC' })}
              </time>
            </p>

            {/*
          The placeholder marker. A `note` landmark with its own heading, so it
          is reachable and announced as a distinct block rather than read as
          part of the policy it is standing in for.
        */}
            <div
              role="note"
              aria-labelledby="policy-placeholder"
              className="card card-pad"
              style={{ marginTop: 28, borderColor: 'var(--orange)' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <span className="bt-vm-ic" style={{ background: 'rgba(255,144,0,0.16)' }}>
                  <Icon name="shield" size={18} color="var(--orange-deep)" />
                </span>
                <h2 id="policy-placeholder" style={{ fontSize: 17 }}>
                  {t('pol_placeholder_t')}
                </h2>
              </div>
              <p className="muted" style={{ fontSize: 14, margin: 0 }}>
                {t('pol_placeholder_b')}
              </p>
            </div>

            {copy.sections !== undefined ? (
              <div className="bt-article-body">
                {copy.sections.map((section, index) => (
                  <div key={section.titleKey}>
                    <h2 id={`policy-s${index + 1}`} style={{ fontSize: 21, marginBottom: 10 }}>
                      {index + 1}. {t(section.titleKey)}
                    </h2>
                    <p>{t(section.bodyKey)}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bt-article-body">
                <h2 style={{ fontSize: 21, marginBottom: 14 }}>{t('pol_scope')}</h2>
                <p>{t(copy.scopeKey)}</p>
                <p>{t('pol_help')}</p>
              </div>
            )}

            <div className="panel row between pol-ask">
              <b style={{ color: 'var(--forest)' }}>{t('pol4_ask')}</b>
              <LinkButton href="/contact" variant="ghost" size="sm">
                {t('navr_contact')}
              </LinkButton>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
