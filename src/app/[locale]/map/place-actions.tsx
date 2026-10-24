'use client'

/**
 * "احفظ" و"أضف إلى رحلتي" — في بطاقة المكان على الخريطة وفي صفحة المكان.
 *
 * الخادم هو من يقرر (`../_actions/places.ts`): الزر لا يعرف إن كانت الباقة
 * تسمح، ويعرض ما يعيده الخادم — بما في ذلك "سجّل الدخول" أو "رقِّ باقتك".
 */

import { useEffect, useState, useTransition, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'

import { Button, LinkButton } from '@/components/bt'
import { Icon } from '@/components/ui'
import { useRouter } from '@/i18n/routing'

import {
  addPlaceToTrip,
  placeUserState,
  toggleFavoritePlace,
  type PlaceActionResult,
} from '../_actions/places'

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
  layout = 'grid',
  children,
}: {
  placeId: string
  canFavorite: boolean
  canAddToTrip: boolean
  /**
   * `grid`: two columns (map side card). `stack`: full-width column (place
   * page). `row`: one row of equal, thumb-sized buttons (phone place card).
   */
  layout?: 'grid' | 'stack' | 'row'
  /** Extra buttons placed in the same group (Details, Directions…). */
  children?: ReactNode
}) {
  const t = useTranslations()
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<PlaceActionResult | null>(null)
  const [saved, setSaved] = useState(false)
  const [inTrip, setInTrip] = useState(false)

  // الحالة الحقيقية من الخادم: الزر يعرض "محفوظ" لمكان محفوظ، فلا يحذفه أحد بالخطأ.
  // المكوّن يُعاد تركيبه لكل مكان (`key={place.id}`)، فلا حالة قديمة تُصفَّر هنا.
  useEffect(() => {
    let live = true
    void placeUserState(placeId).then((state) => {
      if (!live || state === null) return
      setSaved(state.saved)
      setInTrip(state.inTrip)
    })
    return () => {
      live = false
    }
  }, [placeId])

  const run = (action: (id: string) => Promise<PlaceActionResult>) =>
    startTransition(async () => {
      const next = await action(placeId)
      setResult(next)
      if (next.ok && next.state === 'saved') setSaved(true)
      if (next.ok && next.state === 'removed') setSaved(false)
      if (next.ok && (next.state === 'added' || next.state === 'already')) setInTrip(true)
    })

  const key = result === null ? null : MESSAGE[result.ok ? result.state : result.reason]

  return (
    <div className="mp-actions-wrap">
      <div className={layout === 'grid' ? 'mp-actions' : `mp-actions is-${layout}`}>
        {children}
        {canAddToTrip && (
          <Button
            variant="primary"
            size="sm"
            icon={inTrip ? 'check' : 'plus'}
            disabled={pending || inTrip}
            onClick={() => run(addPlaceToTrip)}
          >
            {inTrip ? t('map_trip_already') : t('bt_add_trip')}
          </Button>
        )}
        {canFavorite && (
          <Button
            variant="ghost"
            size="sm"
            icon="heart"
            disabled={pending}
            aria-pressed={saved}
            onClick={() => run(toggleFavoritePlace)}
          >
            {saved ? t('mp_faved') : t('map_save')}
          </Button>
        )}
      </div>
      {key !== null && key !== undefined && (
        <p role="status" className="muted mp-action-note">
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

/**
 * The heart on a phone carousel card. It asks the server for the saved state
 * only while its card is the active one, so a row of 30 cards is not 30 calls.
 */
export function FavoriteHeart({ placeId, active }: { placeId: string; active: boolean }) {
  const t = useTranslations()
  const [pending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)
  const router = useRouter()

  useEffect(() => {
    if (!active) return
    let live = true
    void placeUserState(placeId).then((state) => {
      if (live && state !== null) setSaved(state.saved)
    })
    return () => {
      live = false
    }
  }, [placeId, active])

  return (
    <button
      type="button"
      className="mp-heart"
      aria-pressed={saved}
      aria-label={saved ? t('mp_faved') : t('map_save')}
      disabled={pending}
      onClick={(event) => {
        event.stopPropagation()
        startTransition(async () => {
          const next = await toggleFavoritePlace(placeId)
          if (next.ok && next.state === 'saved') setSaved(true)
          if (next.ok && next.state === 'removed') setSaved(false)
          if (!next.ok && next.reason === 'signed_out') router.push('/account')
          if (!next.ok && next.reason === 'upgrade') router.push('/plans')
        })
      }}
    >
      <Icon name="heart" size={20} />
    </button>
  )
}
