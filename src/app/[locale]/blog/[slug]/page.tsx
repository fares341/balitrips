/**
 * Article detail.
 *
 * Ported from `ArticleDetailPage` in
 * design/handoff/sections-bt/page-content.jsx: hero image, category tag,
 * title, lede, prose body at 16.5px/1.8, the service-bridge CTA and a related
 * rail.
 *
 * Four things the handoff did that are not carried over:
 *
 *  1. **`findArticle(params.id) || ARTICLES[0]`.** Every unknown slug returned
 *     200 with a *different article's* content. That is duplicate content for
 *     a crawler and a lie to a reader. Unknown slugs `notFound()`.
 *  2. **`bodyParas(lang)`.** Three lorem paragraphs, identical for all 24
 *     articles, hard-coded in the component. The body is a real localized
 *     `jsonb` column now, and when it is empty the page renders the excerpt
 *     and stops — no filler, and no borrowing another article's text.
 *  3. **`a.read`.** A hard-coded `"6 min"` English literal printed into all
 *     three locales. There is no reading-time column; the meta line carries
 *     the publication date, formatted for the active locale.
 *  4. **`{...}[a.bridge] || "ar_bridge_map"`.** An article with no bridge, or
 *     one with a value outside the three the design defines, silently
 *     advertised the map. An unset bridge now renders no CTA at all — an
 *     editor who has not chosen a destination has not chosen the map.
 *
 * Exclusive articles (spec 2.3/2.4, `articles.required_entitlement`): title,
 * hero and excerpt are public; the body is fetched only after the viewer's
 * live entitlements pass, so an unentitled reader's HTML and RSC payload
 * never contain it. They get a paywall card pointing at /plans instead.
 */

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server'

import { ArticleCard } from '@/components/cards'
import { ProtectedContent } from '@/components/protect'
import { Breadcrumbs, LinkButton, Tag } from '@/components/shared'
import { Icon, Photo } from '@/components/ui'
import type { IconName } from '@/components/ui'
import { Link } from '@/i18n/routing'
import { contactLabel } from '@/lib/auth/phone'
import { pick, pickOptional } from '@/lib/content/localize'
import { FEATURES } from '@/lib/features'
import {
  getArticleBodyForViewer,
  getArticleHead,
  type ArticleHead,
} from '@/lib/content/extra-queries'
import { listArticles } from '@/lib/content/queries'
import type { ArticleSummary, LocalizedText } from '@/lib/content/types'
import { emptyEntitlements, loadEntitlements } from '@/lib/entitlements'
import type { Locale } from '@/i18n/config'
import { logActivity } from '@/lib/security/activity'
import { checkSecureAccess } from '@/lib/security/guard'

import { alternatesFor, toLocale } from '../../_seo-hreflang'
import { DEFAULT_SHARE_IMAGE } from '@/lib/seo/site-origin'

const BLOG_HREF = '/blog'
const PLANS_HREF = '/plans'
const RELATED_COUNT = 3

/**
 * Request-rendered: whether the body is in the response depends on who is
 * reading. A prerendered exclusive article would be either locked for its
 * subscribers or open to everyone.
 */
export const dynamic = 'force-dynamic'

/**
 * The three destinations the design defines for the in-article CTA.
 *
 * A `Record` rather than a chain of ternaries, and read through an index that
 * `noUncheckedIndexedAccess` types as possibly-undefined — which is exactly
 * the case the handoff papered over with `|| "ar_bridge_map"`.
 */
const BRIDGES: Record<string, { href: string; icon: IconName; labelKey: string }> = {
  map: { href: '/map', icon: 'pin', labelKey: 'ar_bridge_map' },
  activities: { href: '/activities', icon: 'compass', labelKey: 'ar_bridge_act' },
  driver: { href: '/driver', icon: 'car', labelKey: 'ar_bridge_driver' },
}

type PageParams = Promise<{ locale: string; slug: string }>

/**
 * Prerender every published article in every locale.
 *
 * Only `slug` is returned: the `[locale]` layout already declares its own
 * params, and Next runs this once per locale it produced.
 */
export async function generateStaticParams() {
  const articles = await listArticles({ limit: 200 })
  return articles.map((article) => ({ slug: article.slug }))
}

/**
 * The body split into paragraphs.
 *
 * Stored as plain text with blank lines between paragraphs, so a single
 * newline is a soft wrap and a blank line is a break — the convention every
 * CMS textarea already trains authors in. Returns `[]` for a null or
 * whitespace-only body, which is the signal to render nothing.
 */
function paragraphsOf(body: LocalizedText | null, locale: Locale): string[] {
  const text = pick(body, locale)
  if (text.trim() === '') return []
  return text
    .split(/\r?\n\s*\r?\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph !== '')
}

export async function generateMetadata({ params }: { params: PageParams }): Promise<Metadata> {
  const { locale: raw, slug } = await params
  const locale = toLocale(raw)

  const article = await getArticleHead(slug)
  if (!article) return {}

  const title = pick(article.title, locale, article.slug)
  const description = pickOptional(article.excerpt, locale) ?? undefined
  const href = `${BLOG_HREF}/${article.slug}`

  return {
    title,
    description,
    alternates: alternatesFor(href, locale),
    openGraph: {
      type: 'article',
      title,
      description,
      locale,
      publishedTime: article.publishedAt ?? undefined,
      images: article.hero === null ? [DEFAULT_SHARE_IMAGE] : [{ url: article.hero.url }],
    },
  }
}

export default async function ArticlePage({ params }: { params: PageParams }) {
  const { locale: raw, slug } = await params
  setRequestLocale(raw)

  const locale = toLocale(raw)
  const article = await getArticleHead(slug)
  if (!article) notFound()

  // Public articles never touch the session; exclusive ones check the
  // viewer's live entitlements through the same guard as the map.
  let held = emptyEntitlements()
  let signedIn = false
  let access: Awaited<ReturnType<typeof checkSecureAccess>> | null = null
  if (article.requiredEntitlement !== null) {
    access = await checkSecureAccess('article')
    signedIn = access.ok
    if (access.ok) held = await loadEntitlements(access.user.id)
  }
  const gate = await getArticleBodyForViewer(article.id, held)

  // Exclusive body shown to its subscriber: copy protection + a watermark
  // carrying who they are and today's date (Bali time), as on the map.
  let watermark: string | null = null
  if (access?.ok === true && article.requiredEntitlement !== null) {
    if (gate.locked) {
      // Recorded for review, but NOT as `why: 'not_entitled'`: exclusive
      // articles are listed publicly with a lock badge, so a curious member
      // opening a handful of teasers would trip `unauthorized_probe` and be
      // suspended. A distinct reason keeps the trail without that rule.
      await logActivity({
        action: 'unauthorized_access',
        userId: access.user.id,
        ip: access.ip,
        deviceId: access.deviceId,
        details: { resource: `article:${article.slug}`, why: 'paywall_preview' },
      })
    } else {
      watermark = `${contactLabel(access.user)} · ${new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Makassar' }).format(new Date())}`
    }
  }

  const t = await getTranslations({ locale })
  const format = await getFormatter({ locale })

  const title = pick(article.title, locale, article.slug)
  const excerpt = pickOptional(article.excerpt, locale)
  const categoryLabel =
    article.category === null ? null : pick(article.category.label, locale, article.category.key)
  const publishedAt = article.publishedAt === null ? null : new Date(article.publishedAt)

  const paragraphs = gate.locked ? [] : paragraphsOf(gate.body, locale)
  // A driver bridge points at the map while the driver service is off.
  const bridgeKey = article.bridge === 'driver' && !FEATURES.driver ? 'map' : article.bridge
  const bridge = bridgeKey === null ? undefined : BRIDGES[bridgeKey]
  const related = await relatedArticles(article, locale)

  return (
    <main className="bt-detailwrap">
      <div className="wrap">
        <Breadcrumbs
          label={t('c_breadcrumb')}
          trail={[
            { label: t('c_home'), href: '/' },
            { label: t('navr_blog'), href: BLOG_HREF },
            { label: title },
          ]}
        />
      </div>

      <article className="wrap" style={{ maxWidth: 820 }}>
        {article.hero !== null && (
          <div className="bt-slider" style={{ height: 360 }}>
            <Photo
              src={article.hero.url}
              alt={pick(article.hero.alt, locale)}
              priority
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
            />
          </div>
        )}

        {(categoryLabel !== null ||
          publishedAt !== null ||
          article.requiredEntitlement !== null) && (
          <div className="row" style={{ gap: 10, marginTop: 22 }}>
            {categoryLabel !== null && <Tag variant="palm">{categoryLabel}</Tag>}
            {article.requiredEntitlement !== null && (
              <span className="tag tag-orange">
                <Icon name="lock" size={12} />{' '}
                {article.requiredEntitlement === 'vip' ? t('art_badge_vip') : t('art_badge_map')}
              </span>
            )}
            {publishedAt !== null && (
              <time className="muted" style={{ fontSize: 13 }} dateTime={article.publishedAt ?? ''}>
                {format.dateTime(publishedAt, { dateStyle: 'long' })}
              </time>
            )}
          </div>
        )}

        <h1 style={{ fontSize: 'clamp(28px,5vw,44px)', marginTop: 14 }}>{title}</h1>

        {excerpt !== null && (
          <p className="lede" style={{ marginTop: 16, fontWeight: 500 }}>
            {excerpt}
          </p>
        )}

        {/*
          Absent when `articles.body` is null or blank. The excerpt above is
          then the whole article — which is honest — rather than three
          paragraphs of filler copied from every other post.
        */}
        {paragraphs.length > 0 && (
          <ProtectedContent
            className="bt-article-body"
            label={watermark}
            printNote={t('art_print_blocked')}
          >
            {paragraphs.map((paragraph, index) => (
              <p key={`${index}-${paragraph.slice(0, 24)}`}>{paragraph}</p>
            ))}
          </ProtectedContent>
        )}

        {gate.locked && (
          <div
            className="card card-pad"
            role="note"
            style={{
              marginTop: 28,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 12,
              textAlign: 'center',
            }}
          >
            <span className="bt-paywall-ic">
              <Icon name="lock" size={20} color="#fff" />
            </span>
            <h2 style={{ fontSize: 20, margin: 0 }}>
              {article.requiredEntitlement === 'vip' ? t('art_lock_vip_t') : t('art_lock_map_t')}
            </h2>
            <p className="muted" style={{ margin: 0, maxWidth: '46ch' }}>
              {t('art_lock_b')}
            </p>
            <div className="row" style={{ gap: 10, justifyContent: 'center' }}>
              <LinkButton href={PLANS_HREF} variant="orange">
                {t('art_lock_cta')}
              </LinkButton>
              {!signedIn && (
                <LinkButton href="/account" variant="ghost">
                  {t('art_lock_signin')}
                </LinkButton>
              )}
            </div>
          </div>
        )}

        {bridge !== undefined && (
          // A link, not the handoff's `<button onClick={navigate}>`: it is a
          // navigation to a real page and has to be openable in a new tab and
          // followable by a crawler.
          <Link href={bridge.href} className="bt-bridge">
            <Icon name={bridge.icon} size={24} color="#fff" />
            <span style={{ flex: 1, textAlign: 'start', fontWeight: 800, fontSize: 18 }}>
              {t(bridge.labelKey)}
            </span>
            <Icon name="arrow" size={20} color="#fff" className="flip" />
          </Link>
        )}
      </article>

      {related.length > 0 && (
        <div className="wrap">
          <section className="bt-related">
            <h2 className="bt-related-h">{t('ar_related')}</h2>
            <div className="grid bt-grid-3auto">
              {related.map((item) => (
                <ArticleCard key={item.id} article={item} />
              ))}
            </div>
          </section>
        </div>
      )}
    </main>
  )
}

/**
 * Related reads.
 *
 * `articles` carries no self-referencing link table — the handoff's `related`
 * array was authored by hand in a JS literal and had already gone stale for
 * half the entries. Same category first, because that is the strongest signal
 * the schema actually holds; the latest articles fill in when the piece is
 * uncategorised or is the only one in its category. The article being read is
 * always excluded.
 */
async function relatedArticles(article: ArticleHead, locale: Locale): Promise<ArticleSummary[]> {
  const sameCategory =
    article.category === null
      ? []
      : await listArticles({
          locale,
          categoryKey: article.category.key,
          limit: RELATED_COUNT + 1,
        })

  const picked = sameCategory.filter((item) => item.id !== article.id).slice(0, RELATED_COUNT)
  if (picked.length === RELATED_COUNT) return picked

  const latest = await listArticles({ locale, limit: RELATED_COUNT + picked.length + 1 })
  const seen = new Set([article.id, ...picked.map((item) => item.id)])

  for (const item of latest) {
    if (picked.length === RELATED_COUNT) break
    if (seen.has(item.id)) continue
    seen.add(item.id)
    picked.push(item)
  }

  return picked
}
