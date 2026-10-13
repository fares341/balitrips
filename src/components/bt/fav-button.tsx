'use client'

/**
 * FavButton — the round heart on a card image (`.fav-btn`).
 *
 * Pressed state comes from the shared favorites store; a click toggles the
 * favorite on the server (`toggleFavorite`) and answers with a toast that
 * links to the saved list. Signed-out visitors get a toast that sends them
 * to sign in instead — nothing is stored in the browser.
 *
 * Sits above the card's stretched link (`.card .tr` has z-index 2), so it
 * never navigates.
 */

import { useTransition } from 'react'
import { useTranslations } from 'next-intl'

import { toggleFavorite, type FavoriteKind } from '@/app/[locale]/_actions/favorites'
import { useToast } from '@/components/shared/toast'
import { Icon } from '@/components/ui/icon'

import { favoriteKey, setFavorite, useFavorites } from './favorites-store'

const ACCOUNT_HREF = '/account'
const FAVORITES_HREF = '/account/favorites'

export type FavButtonProps = {
  kind: FavoriteKind
  refId: string
  className?: string
}

export function FavButton({ kind, refId, className }: FavButtonProps) {
  const t = useTranslations()
  const { toast } = useToast()
  const favorites = useFavorites()
  const [pending, startTransition] = useTransition()
  const key = favoriteKey(kind, refId)
  const pressed = favorites.keys.has(key)

  const onClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    if (favorites.loaded && !favorites.signedIn) {
      toast(t('bt_fav_signin'), { link: { href: ACCOUNT_HREF, label: t('bt_login') } })
      return
    }
    startTransition(async () => {
      const result = await toggleFavorite(kind, refId)
      if (result.ok) {
        setFavorite(key, result.saved)
        toast(
          t(result.saved ? 'bt_fav_added' : 'bt_fav_removed'),
          result.saved ? { link: { href: FAVORITES_HREF, label: t('bt_view') } } : {},
        )
      } else if (result.reason === 'signed_out') {
        toast(t('bt_fav_signin'), { link: { href: ACCOUNT_HREF, label: t('bt_login') } })
      } else if (result.reason === 'upgrade') {
        toast(t('bt_fav_upgrade'), { error: true, link: { href: '/plans', label: t('bt_view') } })
      } else {
        toast(t('c_error'), { error: true })
      }
    })
  }

  return (
    <button
      type="button"
      className={['fav-btn', className].filter(Boolean).join(' ')}
      aria-pressed={pressed}
      aria-label={t(pressed ? 'bt_fav_remove' : 'bt_fav_save')}
      aria-busy={pending || undefined}
      onClick={onClick}
    >
      <Icon name="heart" size={19} stroke={2} />
    </button>
  )
}
