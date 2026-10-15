/**
 * PackageCard — v3 `packageCard` (bt.js).
 *
 * Image 16:11 with the heart (and the first region as a glass chip); title;
 * meta row (days, guests, driver); blurb; then "From $X" and "Details →".
 * `action` adds a control before "Details".
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
} from '@/components/bt/card'
import { Tag } from '@/components/bt/chip'
import { FavButton } from '@/components/bt/fav-button'
import type { Locale } from '@/i18n/config'
import { pick, pickOptional } from '@/lib/content/localize'
import type { PackageSummary } from '@/lib/content/types'
import { FEATURES } from '@/lib/features'

export type PackageCardProps = {
  pkg: PackageSummary
  /** Optional extra control before "Details" — e.g. add to trip. */
  action?: ReactNode
  priority?: boolean
}

export function PackageCard({ pkg, action, priority = false }: PackageCardProps) {
  const t = useTranslations()
  const locale = useLocale() as Locale

  const name = pick(pkg.name, locale, pkg.slug)
  const blurb = pickOptional(pkg.blurb, locale)
  const region = pkg.regions[0]

  return (
    <Card>
      <CardMedia
        src={pkg.hero?.url}
        alt={pick(pkg.hero?.alt, locale)}
        srcSetAvif={pkg.hero?.srcSetAvif}
        srcSetWebp={pkg.hero?.srcSetWebp}
        ratio="16/11"
        priority={priority}
        badges={
          region !== undefined ? (
            <Tag variant="glass">{pick(region.label, locale, region.key)}</Tag>
          ) : null
        }
        fav={<FavButton kind="package" refId={pkg.id} />}
      />
      <CardBody>
        <CardTitle href={pkg.href}>{name}</CardTitle>
        <CardMeta
          items={[
            { icon: 'cal', label: t('c_days_n', { n: pkg.days }) },
            { icon: 'users', label: t('bt_up_to_people', { n: pkg.maxGuests }) },
            ...(FEATURES.driver
              ? [
                  {
                    icon: 'car' as const,
                    label: t(pkg.driverIncluded ? 'bt_driver_included' : 'bt_no_driver'),
                  },
                ]
              : []),
          ]}
        />
        {blurb !== null && <CardText>{blurb}</CardText>}
        <CardFoot>
          <PriceFrom
            label={t('bt_from')}
            amount={formatPrice(pkg.priceMinor, pkg.currency, locale)}
          />
          <CardActions>
            {action}
            <LinkButton
              href={pkg.href}
              variant="secondary"
              size="sm"
              iconEnd="arrow"
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
