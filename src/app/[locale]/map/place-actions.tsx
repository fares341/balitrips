'use client'

/**
 * "احفظ" و"أضف إلى رحلتي" داخل لوحة المكان.
 *
 * الخادم هو من يقرر (`../_actions/places.ts`): الزر لا يعرف إن كانت الباقة
 * تسمح، ويعرض ما يعيده الخادم — بما في ذلك "سجّل الدخول" أو "رقِّ باقتك".
 */

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'

import { Button, LinkButton } from '@/components/shared'
import { Icon } from '@/components/ui'

import { addPlaceToTrip, toggleFavoritePlace, type PlaceActionResult } from '../_actions/places'

const MESSAGE: Record<string, string> = {
  saved: 'map_saved',
  removed: 'map_unsaved',
  added: 'map_trip_added',
  already: 'map_trip_already',
  signed_out: 'map_need_signin',
  upgrade: 'map_need_plan',
  not_allowed: 'map_not_allowed',
  not_found: 'map_not_allowed',
}

export function PlaceActions({
  placeId,
  canFavorite,
  canAddToTrip,
}: {
  placeId: string
  canFavorite: boolean
  canAddToTrip: boolean
}) {
  const t = useTranslations()
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<PlaceActionResult | null>(null)

  if (!canFavorite && !canAddToTrip) return null

  const run = (action: (id: string) => Promise<PlaceActionResult>) =>
    startTransition(async () => setResult(await action(placeId)))

  const key = result === null ? null : MESSAGE[result.ok ? result.state : result.reason]

  return (
    <div style={{ marginTop: 14 }}>
      <div className="row" style={{ gap: 8 }}>
        {canFavorite && (
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => run(toggleFavoritePlace)}
          >
            <Icon name="heart" size={15} /> {t('map_save')}
          </Button>
        )}
        {canAddToTrip && (
          <Button variant="forest" size="sm" disabled={pending} onClick={() => run(addPlaceToTrip)}>
            <Icon name="route" size={15} color="#fff" /> {t('map_add_trip')}
          </Button>
        )}
      </div>
      {key !== null && key !== undefined && (
        <p role="status" className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>
          {t(key)}{' '}
          {result?.ok === false && result.reason === 'signed_out' && (
            <LinkButton href="/account" variant="ghost" size="sm">
              {t('map_signin')}
            </LinkButton>
          )}
          {result?.ok === false && result.reason === 'upgrade' && (
            <LinkButton href="/plans" variant="ghost" size="sm">
              {t('mp_unlock')}
            </LinkButton>
          )}
          {result?.ok === true && (result.state === 'added' || result.state === 'already') && (
            <LinkButton href="/account/trip" variant="ghost" size="sm">
              {t('acct_nav_trip')}
            </LinkButton>
          )}
        </p>
      )}
    </div>
  )
}
