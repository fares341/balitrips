/**
 * ArticleCard.
 *
 * Ported from `ArticleCard` in design/handoff/bt-ui.jsx (lines 233-262),
 * including the `compact` variant used by the blog sidebar's "most read" list.
 *
 * The handoff printed a hard-coded English reading time (`a.read`, literally
 * `"6 min"`) into all three locales. There is no reading-time column — it was
 * never real data — so the meta line carries the publication date instead,
 * formatted for the active locale.
 */

import { useFormatter, useLocale, useTranslations } from 'next-intl'

import { Tag } from '@/components/shared'
import { Icon, Photo } from '@/components/ui'
import { Link } from '@/i18n/routing'
import type { Locale } from '@/i18n/config'
import { pick, pickOptional } from '@/lib/content/localize'
import type { ArticleSummary } from '@/lib/content/types'

export type ArticleCardProps = {
  article: ArticleSummary
  /** Thumbnail row for sidebars, rather than a full grid card. */
  compact?: boolean
  priority?: boolean
}

export function ArticleCard({ article, compact = false, priority = false }: ArticleCardProps) {
  const t = useTranslations()
  const locale = useLocale() as Locale
  const format = useFormatter()

  const title = pick(article.title, locale, article.slug)
  const excerpt = pickOptional(article.excerpt, locale)
  const categoryLabel =
    article.category === null ? null : pick(article.category.label, locale, article.category.key)

  const published = article.publishedAt === null ? null : new Date(article.publishedAt)
  const publishedLabel =
    published === null ? null : format.dateTime(published, { dateStyle: 'medium' })

  if (compact) {
    return (
      <Link href={article.href} className="bt-article-mini">
        <Photo
          src={article.hero?.url}
          alt=""
          radius={10}
          style={{ width: 64, height: 64, flexShrink: 0 }}
        />
        <span style={{ textAlign: 'start' }}>
          <span
            style={{
              fontWeight: 700,
              fontSize: 13.5,
              lineHeight: 1.3,
              display: 'block',
              color: 'var(--forest)',
            }}
          >
            {title}
          </span>
          {publishedLabel !== null && (
            <span className="muted" style={{ fontSize: 12 }}>
              {publishedLabel}
            </span>
          )}
        </span>
      </Link>
    )
  }

  return (
    <article className="card bt-cardhover" style={{ display: 'flex', flexDirection: 'column' }}>
      <Link href={article.href} className="bt-card-media" aria-label={title} tabIndex={-1}>
        <Photo
          src={article.hero?.url}
          alt={pick(article.hero?.alt, locale)}
          priority={priority}
          style={{ height: 190 }}
        />
      </Link>

      <div
        className="card-pad"
        style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}
      >
        {(categoryLabel !== null || publishedLabel !== null) && (
          <div className="row" style={{ gap: 10 }}>
            {categoryLabel !== null && <Tag variant="palm">{categoryLabel}</Tag>}
            {publishedLabel !== null && (
              <span className="muted" style={{ fontSize: 12.5 }}>
                {publishedLabel}
              </span>
            )}
          </div>
        )}

        <h3 style={{ fontSize: 20, lineHeight: 1.2, color: 'var(--forest)' }}>
          <Link href={article.href}>{title}</Link>
        </h3>

        {excerpt !== null && (
          <p className="muted" style={{ fontSize: 13.5, margin: 0, flex: 1 }}>
            {excerpt}
          </p>
        )}

        {/*
          Presentational, not a second link: the whole title is already an
          anchor to the same article, and a duplicate link adds a tab stop
          that reads "Read article" with no context.
        */}
        <span
          aria-hidden="true"
          style={{
            color: 'var(--orange-ink)',
            fontWeight: 700,
            fontSize: 14,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          {t('bh_read')} <Icon name="arrow" size={15} color="var(--orange-ink)" className="flip" />
        </span>
      </div>
    </article>
  )
}
