/**
 * ActivityCard — v3 `activityCard` (design-reference/prototype/assets/bt.js).
 *
 * Image 4:3 with the first category as a glass chip and the heart; a meta row
 * (area, duration) with the real rating at the end (hidden when there is
 * none); the title; one short line cut from the description (`cardLine`);
 * then "From $X / person" and the actions.
 *
 * The whole card opens the activity (stretched title link). `action` replaces
 * the default "+ Trip" button — pages pass their add-to-trip control there.
 *
 * No 'use client'; the heart is a small client island.
 */

import type { ReactNode } from 'react'
import { useLocale, useTranslations } from 'next-intl'

import { LinkButton } from '@/components/bt/button'
import {
  Card,
  CardActions,
  CardBody,
  CardFoot,
  CardMedia,
  CardMeta,
  CardText,
  CardTitle,
  formatPrice,
  PriceFrom,
  Stars,
  type CardMetaItem,
} from '@/components/bt/card'
import { Tag } from '@/components/bt/chip'
import { FavButton } from '@/components/bt/fav-button'
import type { Locale } from '@/i18n/config'
import { cardLine } from '@/lib/content/card-line'
import { pick, pickAlt, pickOptional } from '@/lib/content/localize'
import { markdownToPlain } from '@/lib/content/markdown'
import type { ActivitySummary } from '@/lib/content/types'

export type ActivityCardProps = {
  activity: ActivitySummary
  /** Replaces the default "+ Trip" button — normally an add-to-trip control. */
  action?: ReactNode
  /** Set on above-the-fold cards so the image is preloaded. */
  priority?: boolean
}

export function ActivityCard({ activity, action, priority = false }: ActivityCardProps) {
  const t = useTranslations()
  const locale = useLocale() as Locale

  const name = pick(activity.name, locale, activity.slug)
  const area = pickOptional(activity.area, locale)
  const duration = pickOptional(activity.duration, locale)
  // The card shows the short description written for it, else a short line
  // cut from the full description (which may carry markdown).
  const written = pickOptional(activity.shortDescription, locale)
  const fullBlurb = pickOptional(activity.blurb, locale)
  const plain = fullBlurb !== null ? markdownToPlain(fullBlurb) : ''
  const blurb = written ?? (plain !== '' ? cardLine(plain) : null)
  const category = activity.categories[0]
  const badge = category ? pick(category.label, locale, category.key) : null
  const badges =
    badge !== null || activity.mostPopular === true || activity.unavailable === true ? (
      <>
        {activity.mostPopular === true && (
          <Tag variant="sun" icon="star">
            {t('act_badge_popular')}
          </Tag>
        )}
        {badge !== null && <Tag variant="glass">{badge}</Tag>}
        {activity.unavailable === true && <Tag variant="warn">{t('act_unavailable_tag')}</Tag>}
      </>
    ) : null

  const meta: CardMetaItem[] = []
  if (area !== null) meta.push({ icon: 'pin', label: area })
  if (duration !== null) meta.push({ icon: 'clock', label: duration })

  return (
    <Card>
      <CardMedia
        src={activity.hero?.url}
        alt={pickAlt(activity.hero?.alt, locale, name)}
        srcSetAvif={activity.hero?.srcSetAvif}
        srcSetWebp={activity.hero?.srcSetWebp}
        priority={priority}
        badges={badges}
        fav={<FavButton kind="activity" refId={activity.id} />}
      />
      <CardBody>
        <CardMeta
          items={meta}
          end={<Stars value={activity.rating} count={activity.reviewCount} />}
        />
        <CardTitle href={activity.href}>{name}</CardTitle>
        {blurb !== null && <CardText>{blurb}</CardText>}
        <CardFoot>
          <PriceFrom
            label={t('bt_from')}
            amount={formatPrice(activity.priceMinor, activity.currency, locale)}
            minor={activity.priceMinor}
            currency={activity.currency}
            unit={t('bt_per_person')}
          />
          <CardActions>
            {action ?? (
              <LinkButton
                href={`${activity.href}#book`}
                variant="ghost"
                size="sm"
                icon="plus"
                aria-label={t('bt_add_trip')}
              >
                {t('bt_trip_short')}
              </LinkButton>
            )}
            <LinkButton
              href={activity.href}
              variant="secondary"
              size="sm"
              tabIndex={-1}
              aria-hidden="true"
            >
              {t('bt_details')}
            </LinkButton>
          </CardActions>
        </CardFoot>
      </CardBody>
    </Card>
  )
}
