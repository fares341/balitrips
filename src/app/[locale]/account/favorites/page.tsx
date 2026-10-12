/**
 * Saved places.
 *
 * The handoff rendered `ACCT_FAVS` — four places hard-coded at the top of
 * account.jsx — for every visitor, and ignored the `favs` store the map's own
 * heart button was writing to. Every card here comes from the `favorites`
 * table, scoped to the signed-in user.
 */

import type { Metadata } from 'next'
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server'

import { Button, LinkButton } from '@/components/shared'
import { Icon, Photo } from '@/components/ui'
import { Link } from '@/i18n/routing'
import { requireActiveUser } from '@/lib/security/require'
import { pick, pickOptional } from '@/lib/content/localize'

import { toLocale } from '../../_seo-hreflang'
import { accountMetadata } from '../_lib/meta'
import { listFavorites } from '../_lib/queries'
import { createTripFromFavoritesAction } from '../actions'
import { FavoriteControls } from './favorite-controls'

const MAP_HREF = '/map'

type PageParams = Promise<{ locale: string }>

export async function generateMetadata({ params }: { params: PageParams }): Promise<Metadata> {
  const { locale: raw } = await params
  return accountMetadata(toLocale(raw), 'acct_nav_fav')
}

export default async function AccountFavoritesPage({ params }: { params: PageParams }) {
  const { locale: raw } = await params
  const locale = toLocale(raw)
  setRequestLocale(locale)

  const t = await getTranslations({ locale })
  const format = await getFormatter({ locale })
  const user = await requireActiveUser('account:favorites')

  const items = await listFavorites(user.id)
  const addable = items.filter((item) => item.available)

  return (
    <section aria-labelledby="bt-acct-fav-h">
      <div className="bt-acct-sechead">
        <h1 id="bt-acct-fav-h">
          {t('acct_fav_t')}{' '}
          {items.length > 0 && (
            <span className="muted" style={{ fontSize: 14, fontWeight: 600 }}>
              · {format.number(items.length)}
            </span>
          )}
        </h1>

        {addable.length > 0 && (
          <form action={createTripFromFavoritesAction}>
            {/* The action redirects to the cart and needs the locale to build
                the `as-needed` path; a Server Component cannot pass it any
                other way without a client boundary. */}
            <input type="hidden" name="locale" value={locale} />
            <Button type="submit" variant="forest" size="sm">
              <Icon name="route" size={16} color="var(--ivory)" />
              {t('acct_fav_create')}
            </Button>
          </form>
        )}
      </div>

      {items.length === 0 ? (
        <div className="bt-acct-empty">
          <Icon name="heart" size={32} color="var(--muted)" />
          <p style={{ margin: 0, maxWidth: '38ch' }}>{t('acct_fav_empty')}</p>
          <LinkButton href={MAP_HREF} variant="orange" size="sm">
            {t('navr_map')}
          </LinkButton>
        </div>
      ) : (
        <div className="bt-acct-cards">
          {items.map((item) => {
            /*
             * A null title means the row is gone, unpublished, or a map place
             * this user is no longer entitled to see. All three render the
             * same honest placeholder and offer Remove only — the alternative
             * is a card the traveller can neither open nor get rid of.
             */
            const title = item.title === null ? t('acct_fav_gone') : pick(item.title, locale)
            const subtitle = item.subtitle === null ? null : pickOptional(item.subtitle, locale)
            const alt = item.imageAlt === null ? '' : pick(item.imageAlt, locale)

            return (
              <article
                key={`${item.kind}:${item.refId}`}
                className="card"
                style={{ overflow: 'hidden' }}
              >
                <div style={{ height: 130, position: 'relative' }}>
                  <Photo src={item.imageUrl} alt={alt} style={{ height: '100%' }} />
                  {item.rating !== null && (
                    <span
                      style={{
                        position: 'absolute',
                        top: 10,
                        insetInlineEnd: 10,
                        background: 'rgba(27,63,34,0.85)',
                        color: '#fff',
                        borderRadius: 999,
                        padding: '4px 9px',
                        fontSize: 12,
                        fontWeight: 700,
                      }}
                    >
                      ★ {format.number(item.rating, { maximumFractionDigits: 1 })}
                    </span>
                  )}
                </div>

                <div style={{ padding: 14 }}>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>
                    {item.href === null ? (
                      title
                    ) : (
                      <Link href={item.href} style={{ color: 'inherit' }}>
                        {title}
                      </Link>
                    )}
                  </div>

                  {subtitle !== null && (
                    <div
                      className="muted"
                      style={{
                        fontSize: 12.5,
                        marginTop: 2,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {subtitle}
                    </div>
                  )}

                  <FavoriteControls
                    kind={item.kind}
                    refId={item.refId}
                    available={item.available}
                  />
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
