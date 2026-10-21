import { pick } from '@/lib/content/localize'

import { eventCounts, eventsByItem, salesByGroup } from '../data'
import type { ReportFilters } from '../filters'
import { rate } from '../metrics'
import type { Kpi, ReportResult } from '../types'
import {
  blocksNotByStaff,
  both,
  countKpi,
  currentRange,
  moneyKpi,
  notByStaff,
  numberText,
  recordsHref,
  type BuildContext,
  withStaffNote,
} from './helpers'
import { groupMoney } from './overview'
import {
  bookingsFromMap,
  devicesFor,
  eventsByProp,
  freeToVip,
  itineraryNames,
  mapErrors,
  mapVisitors,
  placeViews,
  vipFacts,
} from './queries'

/**
 * Studio → Map analytics: who uses the map (Free / VIP), what they open and
 * filter, what it leads to (activity clicks, bookings), VIP sales and where
 * they come from, expiries, devices and load errors.
 *
 * From first-party events (visitors who allowed statistics) and the access
 * records themselves. No location of any visitor is ever stored, so none is
 * shown.
 */
export async function buildMapAnalytics(
  filters: ReportFilters,
  ctx: BuildContext,
): Promise<ReportResult> {
  const { t, intl } = ctx
  const range = currentRange(filters)
  const [
    [visitors, visitorsPrev],
    [facts, factsPrev],
    [groups, groupsPrev],
    [upgrade, upgradePrev],
    [events, eventsPrev],
    [fromMap, fromMapPrev],
    places,
    filtersUsed,
    routes,
    devices,
    errors,
    names,
  ] = await Promise.all([
    both(filters, (r) => mapVisitors(r)),
    both(filters, (r) => vipFacts(r, ctx.now)),
    both(filters, (r) => salesByGroup(r, filters)),
    both(filters, (r) => freeToVip(r)),
    both(filters, (r) =>
      eventCounts(r, [
        'map_place_view',
        'map_place_click',
        'map_to_activity_click',
        'vip_upgrade_click',
      ]),
    ),
    both(filters, (r) => bookingsFromMap(r)),
    placeViews(range, 20),
    eventsByProp(range, 'select_item', 'filter'),
    eventsByItem(range, 'itinerary_day_view', 'itinerary'),
    devicesFor(range, ['view_map']),
    mapErrors(range),
    itineraryNames(),
  ])
  const count = (rows: typeof visitors | null, name: string) =>
    rows?.find((row) => row.name === name)?.visitors ?? 0
  const locale = intl.startsWith('ar') ? 'ar' : 'en'
  const vip = groupMoney(groups, ['vip'])
  const vipPrev = groupsPrev ? groupMoney(groupsPrev, ['vip']) : null
  const errorsTotal = errors.reduce((sum, row) => sum + row.n, 0)
  const itineraryName = new Map(names.map((row) => [row.id, pick(row.name, locale, row.slug)]))

  const kpis: Kpi[] = [
    countKpi(
      'map_visitors',
      t('rp.kpi_map_visitors'),
      t('rp.def_map_visitors'),
      count(visitors, 'view_map'),
      visitorsPrev ? count(visitorsPrev, 'view_map') : null,
    ),
    countKpi(
      'map_free',
      t('rp.kpi_map_free'),
      t('rp.def_map_free'),
      count(visitors, 'view_free_map'),
      visitorsPrev ? count(visitorsPrev, 'view_free_map') : null,
    ),
    countKpi(
      'map_vip',
      t('rp.kpi_map_vip'),
      t('rp.def_map_vip'),
      count(visitors, 'view_vip_map'),
      visitorsPrev ? count(visitorsPrev, 'view_vip_map') : null,
    ),
    countKpi(
      'vip_active',
      t('rp.kpi_vip_active'),
      t('rp.def_vip_active'),
      facts.activeUsers,
      null,
      '/entitlements',
      { note: t('rp.note_now') },
    ),
    {
      ...moneyKpi(
        'vip_sales',
        t('rp.kpi_vip_sales'),
        t('rp.def_vip_sales'),
        vip.money,
        vipPrev?.money ?? null,
        recordsHref('lines', filters, { group: 'vip' }),
      ),
      note: t('rp.note_sold', { n: vip.count }),
    },
    countKpi(
      'free_to_vip',
      t('rp.kpi_free_to_vip'),
      t('rp.def_free_to_vip'),
      rate(upgrade.upgraded, upgrade.freeUsers),
      upgradePrev ? rate(upgradePrev.upgraded, upgradePrev.freeUsers) : null,
      undefined,
      {
        kind: 'percent',
        note: t('rp.note_conversion', { buyers: upgrade.upgraded, viewers: upgrade.freeUsers }),
      },
    ),
    countKpi(
      'vip_upgrade_clicks',
      t('rp.kpi_vip_upgrade_clicks'),
      t('rp.def_vip_upgrade_clicks'),
      events.get('vip_upgrade_click') ?? 0,
      eventsPrev?.get('vip_upgrade_click') ?? null,
    ),
    countKpi(
      'map_activity_clicks',
      t('rp.kpi_map_activity_clicks'),
      t('rp.def_map_activity_clicks'),
      events.get('map_to_activity_click') ?? 0,
      eventsPrev?.get('map_to_activity_click') ?? null,
    ),
    countKpi(
      'bookings_from_map',
      t('rp.kpi_bookings_from_map'),
      t('rp.def_bookings_from_map'),
      fromMap,
      fromMapPrev,
    ),
    countKpi(
      'vip_expired',
      t('rp.kpi_vip_expired'),
      t('rp.def_vip_expired'),
      facts.ended,
      factsPrev?.ended ?? null,
      '/entitlements',
      { lowerIsBetter: true },
    ),
    countKpi(
      'vip_renewed',
      t('rp.kpi_vip_renewed'),
      t('rp.def_vip_renewed'),
      facts.renewed,
      factsPrev?.renewed ?? null,
      '/entitlements',
    ),
    countKpi(
      'map_errors',
      t('rp.kpi_map_errors'),
      t('rp.def_map_errors'),
      errorsTotal,
      null,
      undefined,
      { lowerIsBetter: true },
    ),
  ]

  const SOURCES = ['standalone', 'itinerary', 'package', 'staff', 'family'] as const
  const deviceTotal = devices.reduce((sum, row) => sum + row.visitors, 0)

  return withStaffNote(
    {
      id: 'map',
      title: t('rp.map_title'),
      description: t('rp.map_description'),
      // Phase 6: map use is site events and access rows, not orders — only VIP
      // sales follow the staff filter.
      kpis: kpis.map((kpi) => (kpi.id === 'vip_sales' ? kpi : notByStaff(filters, kpi))),
      blocks: blocksNotByStaff(filters, [
        {
          kind: 'bar',
          id: 'vip_sources',
          title: t('rp.chart_vip_sources'),
          definition: t('rp.def_chart_vip_sources'),
          rows: SOURCES.map((key) => ({
            label: t(`rp.vip_source_${key}`),
            value: facts.granted.get(key) ?? 0,
            display: numberText(facts.granted.get(key) ?? 0, intl),
          })),
        },
        {
          kind: 'table',
          id: 'places',
          title: t('rp.table_top_places'),
          definition: t('rp.def_place_views'),
          columns: [
            { key: 'name', label: t('rp.col_place') },
            { key: 'region', label: t('rp.col_region') },
            { key: 'access', label: t('rp.col_access') },
            { key: 'views', label: t('rp.col_views'), num: true },
          ],
          rows: places.map((row) => ({
            name: {
              text: pick(row.name, locale, row.slug),
              raw: row.slug,
              href: `/places/${row.placeId}`,
            },
            region: { text: row.region ? pick(row.region, locale) : '—' },
            access: { text: row.vip ? 'VIP' : t('rp.access_free'), raw: row.vip ? 'vip' : 'free' },
            views: { text: numberText(row.views, intl), raw: row.views },
          })),
          empty: t('rp.empty_events'),
        },
        {
          kind: 'bar',
          id: 'filters',
          title: t('rp.chart_filters'),
          definition: t('rp.def_chart_filters'),
          rows: filtersUsed.map((row) => ({
            label: row.value === '' ? '—' : t(`rp.filter_${row.value}`),
            value: row.n,
            display: numberText(row.n, intl),
          })),
        },
        {
          kind: 'bar',
          id: 'routes',
          title: t('rp.chart_routes'),
          definition: t('rp.def_chart_routes'),
          rows: routes.slice(0, 10).map((row) => ({
            label: (row.itemId ? itineraryName.get(row.itemId) : null) ?? row.itemRef ?? '—',
            value: row.n,
            display: numberText(row.n, intl),
          })),
        },
        {
          kind: 'bar',
          id: 'devices',
          title: t('rp.chart_devices'),
          definition: t('rp.def_chart_devices'),
          rows: devices
            .sort((a, b) => b.visitors - a.visitors)
            .map((row) => ({
              label: t(`rp.device_${row.device ?? 'unknown'}`),
              value: row.visitors,
              display: `${numberText(row.visitors, intl)} · ${numberText(rate(row.visitors, deviceTotal), intl, 1)}%`,
            })),
        },
        {
          kind: 'bar',
          id: 'errors',
          title: t('rp.kpi_map_errors'),
          definition: t('rp.def_map_errors'),
          rows: errors.map((row) => ({
            label: row.code,
            value: row.n,
            display: numberText(row.n, intl),
          })),
        },
      ]),
      notes: [t('rp.note_consent'), t('rp.note_no_location'), t('rp.note_map_sources')],
    },
    filters,
    t,
  )
}
