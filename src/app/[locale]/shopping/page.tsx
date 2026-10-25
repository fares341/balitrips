/**
 * Shopping in Bali — a LIST of the malls and markets first (owner, Oct 2026).
 *
 * The home card used to open the map straight away. A list is what most
 * visitors want here (name, photo, area, rating → the place's own page), so it
 * is the default; the "Map" switch opens the same places on the map
 * (`/map?cat=`). Only free map places in these two categories are listed, run
 * through the same redaction as the map, so nothing gated reaches the page.
 */

import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { PlaceCard } from '@/components/cards'
import { Icon } from '@/components/ui'
import { Link } from '@/i18n/routing'
import { pick } from '@/lib/content/localize'
import { listMapPlaces, listMapTaxonomy } from '@/lib/content/queries'
import { buildMapPayload, loadEntitlements } from '@/lib/entitlements'
import type { MapPlaceForClient } from '@/lib/entitlements/redaction'
import { getUser } from '@/lib/auth/session'

import { alternatesFor, toLocale } from '../_seo-hreflang'
import { PageBanner } from '../_ui/page-banner'

import '@/styles/bt-activity.css'

const SHOP_PATH = '/shopping'
const SHOP_KEYS = ['malls', 'markets'] as const
type ShopKey = (typeof SHOP_KEYS)[number]

/** The visitor's plan decides what is open, so the page is never cached. */
export const dynamic = 'force-dynamic'

type PageProps = {
  params: Promise<{ locale: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

type OpenPlace = Extract<MapPlaceForClient, { locked: false }>

// Malls and popular markets are separate lists: a place's main category wins.
const inShop = (place: OpenPlace, key: ShopKey) =>
  place.categoryKey === key ||
  (!(SHOP_KEYS as readonly string[]).includes(place.categoryKey ?? '') &&
    place.subCategoryKeys.includes(key))

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale: raw } = await params
  const locale = toLocale(raw)
  const t = await getTranslations({ locale })
  return {
    title: t('hv4_svc_shop_t'),
    description: t('shop_sub'),
    alternates: alternatesFor(SHOP_PATH, locale),
  }
}

export default async function ShoppingPage({ params, searchParams }: PageProps) {
  const { locale: raw } = await params
  setRequestLocale(raw)
  const locale = toLocale(raw)
  const t = await getTranslations({ locale })
  const query = await searchParams
  const catRaw = Array.isArray(query.cat) ? query.cat[0] : query.cat
  const cat: ShopKey | 'all' = SHOP_KEYS.includes(catRaw as ShopKey) ? (catRaw as ShopKey) : 'all'

  const user = await getUser().catch(() => null)
  const [places, held, taxonomy] = await Promise.all([
    listMapPlaces(),
    loadEntitlements(user?.id ?? null),
    listMapTaxonomy(),
  ])
  const open = buildMapPayload(places, held).places.filter(
    (place): place is OpenPlace => !place.locked,
  )
  const shops = open.filter((place) => SHOP_KEYS.some((key) => inShop(place, key)))
  const shown = cat === 'all' ? shops : shops.filter((place) => inShop(place, cat))
  // Malls first, then markets; best rated first inside each.
  shown.sort(
    (a, b) =>
      Number(inShop(b, 'malls')) - Number(inShop(a, 'malls')) || (b.rating ?? 0) - (a.rating ?? 0),
  )

  const label = (key: ShopKey) => {
    const entry = taxonomy.categories.find((one) => one.key === key)
    return entry
      ? pick(entry.label, locale, key)
      : t(key === 'malls' ? 'shop_malls' : 'shop_markets')
  }
  const tabs: { key: ShopKey | 'all'; label: string; count: number }[] = [
    { key: 'all', label: t('shop_all'), count: shops.length },
    ...SHOP_KEYS.map((key) => ({
      key,
      label: label(key),
      count: shops.filter((p) => inShop(p, key)).length,
    })),
  ]
  const mapHref = { pathname: '/map', query: { cat: cat === 'all' ? 'malls' : cat } }

  return (
    <main>
      <PageBanner
        imageSrc="/brand/flatlay-wide.webp"
        title={t('hv4_svc_shop_t')}
        subtitle={t('shop_sub')}
        breadcrumbLabel={t('c_breadcrumb')}
        trail={[{ label: t('c_home'), href: '/' }, { label: t('hv4_svc_shop_t') }]}
      />

      <section className="sec-tight">
        <div className="wrap stack" style={{ gap: 18 }}>
          <div className="row between" style={{ gap: 12, flexWrap: 'wrap' }}>
            <nav className="row" style={{ gap: 8, flexWrap: 'wrap' }} aria-label={t('shop_filter')}>
              {tabs.map((tab) => (
                <Link
                  key={tab.key}
                  href={
                    tab.key === 'all' ? SHOP_PATH : { pathname: SHOP_PATH, query: { cat: tab.key } }
                  }
                  className={cat === tab.key ? 'chip active' : 'chip'}
                  aria-current={cat === tab.key ? 'page' : undefined}
                  scroll={false}
                >
                  {tab.label} <span dir="ltr">({tab.count})</span>
                </Link>
              ))}
            </nav>
            {/* List is the default; the map is one tap away. */}
            <div className="row" role="group" aria-label={t('mp5_view')} style={{ gap: 6 }}>
              <span className="btn btn-sm btn-forest" aria-current="page">
                <Icon name="list" size={16} /> {t('mp5_list')}
              </span>
              <Link href={mapHref} className="btn btn-sm btn-ghost">
                <Icon name="map" size={16} /> {t('mp5_map')}
              </Link>
            </div>
          </div>

          {shown.length === 0 ? (
            <div className="empty">
              <span className="ill">
                <Icon name="bag" size={34} />
              </span>
              <b>{t('shop_empty')}</b>
            </div>
          ) : (
            <div className="grid g3">
              {shown.map((place, index) => (
                <PlaceCard key={place.id} place={place} showFree={false} priority={index < 3} />
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  )
}
