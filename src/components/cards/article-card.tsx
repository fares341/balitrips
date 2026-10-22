/**
 * ArticleCard — v3 `articleCard` (bt.js).
 *
 * Image 16:10; category tag and date; title; excerpt; "Read article →".
 * `compact` is the thumbnail row used in sidebars.
 */

import { useFormatter, useLocale, useTranslations } from 'next-intl'

import { Card, CardBody, CardMedia, CardText, CardTitle } from '@/components/bt/card'
import { Tag } from '@/components/bt/chip'
import { Icon, Photo } from '@/components/ui'
import type { Locale } from '@/i18n/config'
import { Link } from '@/i18n/routing'
import { pick, pickAlt, pickOptional } from '@/lib/content/localize'
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
          <span className="card-title" style={{ fontSize: 14, display: 'block' }}>
            {title}
          </span>
          {publishedLabel !== null && (
            <span className="muted" style={{ fontSize: 12.5 }}>
              {publishedLabel}
            </span>
          )}
        </span>
      </Link>
    )
  }

  return (
    <Card>
      <CardMedia
        src={article.hero?.url}
        alt={pickAlt(article.hero?.alt, locale, title)}
        srcSetAvif={article.hero?.srcSetAvif}
        srcSetWebp={article.hero?.srcSetWebp}
        ratio="16/10"
        priority={priority}
      />
      <CardBody>
        {(categoryLabel !== null || publishedLabel !== null) && (
          <div className="row" style={{ gap: 8 }}>
            {categoryLabel !== null && <Tag variant="palm">{categoryLabel}</Tag>}
            {publishedLabel !== null && (
              <span className="muted" style={{ fontSize: 13 }}>
                {publishedLabel}
              </span>
            )}
          </div>
        )}
        <CardTitle href={article.href}>{title}</CardTitle>
        {excerpt !== null && <CardText>{excerpt}</CardText>}
        {/* Presentational: the stretched title link already opens the article. */}
        <span
          className="link"
          aria-hidden="true"
          style={{ marginTop: 'auto', alignSelf: 'flex-start' }}
        >
          {t('bt_read_article')} <Icon name="arrow" size={15} className="flip" />
        </span>
      </CardBody>
    </Card>
  )
}
