import type { SQLWrapper } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Phase 6 "Staff" filter: every query behind a report figure that honours the
 * other filters must also honour the staff filter, and every figure that
 * cannot be narrowed to one staff member must say so (`staffNA`).
 *
 * No database: `@/db` is replaced by a Drizzle instance whose driver records
 * each SQL statement and its parameters and answers with no rows. Every
 * report is then built with a currency and a staff member chosen, and the
 * recorded SQL is checked — so a query added later without the staff
 * condition fails here, wherever it lives.
 */

const state = vi.hoisted(() => ({ queries: [] as { sql: string; params: unknown[] }[] }))

vi.mock('@/db', async () => {
  const { drizzle } = await import('drizzle-orm/pg-proxy')
  const { PgDialect } = await import('drizzle-orm/pg-core')
  const schema = await import('@/db/schema')
  const dialect = new PgDialect()
  const proxied = drizzle(
    async (sql: string, params: unknown[]) => {
      state.queries.push({ sql, params })
      return { rows: [] }
    },
    { schema },
  )
  // `db.execute(sql…)` (raw SQL) answers like postgres-js: an array of rows.
  const db = new Proxy(proxied, {
    get(target, prop, receiver) {
      if (prop === 'execute') {
        return async (query: SQLWrapper) => {
          state.queries.push(dialect.sqlToQuery(query.getSQL()))
          return []
        }
      }
      return Reflect.get(target, prop, receiver)
    },
  })
  return { db, schema }
})

vi.mock('@/lib/integrations/service', () => ({
  integrationErrorCounts: async () => ({ connections: 1, failing: 0, errorsLast24h: 0 }),
}))

const { buildOverview } = await import('./builders/overview')
const { buildMapAnalytics } = await import('./builders/map')
const { buildReport, REPORT_IDS } = await import('./catalog')
const { parseReportFilters, filterParams } = await import('./filters')
const { RECORD_METRICS, recordsTable } = await import('./records')
const { staffOptions } = await import('./data')

const STAFF = '11111111-2222-4333-8444-555555555555'
const SUPPLIER = '66666666-7777-4888-8999-aaaaaaaaaaaa'
const NOW = new Date('2026-10-20T02:30:00Z')
const ctx = { t: (key: string) => key, intl: 'en', finance: true, customers: true, now: NOW }

/** A statement that reads the orders table itself (not only a subquery of the staff rule). */
const READS_ORDERS = /\b(from|join)\s+"?orders"?(\s|$|\))/i
/** The one query that may read orders unfiltered: the currency list for the filter bar. */
const CURRENCY_LIST = /from "orders" group by [^ ]*presentment_currency"? order by 2 desc$/i

async function buildEverything(params: Record<string, string>) {
  state.queries.length = 0
  const filters = parseReportFilters(params, NOW)
  const results = [
    await buildOverview(filters, ctx),
    await buildMapAnalytics(filters, ctx),
    ...(await Promise.all(REPORT_IDS.map((id) => buildReport(id, filters, ctx)))),
  ]
  const tables = await Promise.all(
    RECORD_METRICS.flatMap((metric) =>
      [null, 'bookable', 'itinerary'].map((group) =>
        recordsTable(
          { metric, filters, group, status: metric === 'payments' ? 'failed' : null },
          ctx,
        ),
      ),
    ),
  )
  return { filters, results, tables, queries: [...state.queries] }
}

describe('report filters: staff', () => {
  it('reads and writes the staff parameter like the others', () => {
    const filters = parseReportFilters({ period: '7d', staff: STAFF }, NOW)
    expect(filters.staffId).toBe(STAFF)
    expect(filterParams(filters).staff).toBe(STAFF)
    expect(parseReportFilters({ staff: 'not-a-uuid' }, NOW).staffId).toBeNull()
  })

  it('lists team members for the filter bar', async () => {
    state.queries.length = 0
    await staffOptions()
    expect(state.queries[0]?.sql).toMatch(/from "users"/)
  })
})

describe('staff filter reaches every query that honours the other filters', () => {
  beforeEach(() => {
    state.queries.length = 0
  })

  const variants: { label: string; params: Record<string, string> }[] = [
    { label: 'currency only', params: { period: '30d', currency: 'XTS', staff: STAFF } },
    {
      label: 'currency, type and supplier',
      params: {
        period: '30d',
        currency: 'XTS',
        staff: STAFF,
        type: 'activity',
        supplier: SUPPLIER,
      },
    },
  ]
  for (const variant of variants) {
    it(`every currency-filtered statement also filters by staff (${variant.label})`, async () => {
      const { queries } = await buildEverything(variant.params)
      expect(queries.length).toBeGreaterThan(40)
      const currencyFiltered = queries.filter((q) => q.params.includes('XTS'))
      expect(currencyFiltered.length).toBeGreaterThan(20)
      const missing = currencyFiltered.filter((q) => !q.params.includes(STAFF))
      expect(missing.map((q) => q.sql)).toEqual([])
    })

    it(`every statement over orders filters by staff (${variant.label})`, async () => {
      const { queries } = await buildEverything(variant.params)
      const overOrders = queries.filter(
        (q) => READS_ORDERS.test(q.sql) && !CURRENCY_LIST.test(q.sql),
      )
      expect(overOrders.length).toBeGreaterThan(20)
      const missing = overOrders.filter((q) => !q.params.includes(STAFF))
      expect(missing.map((q) => q.sql)).toEqual([])
    })
  }

  it('adds nothing when no staff member is chosen', async () => {
    const { queries, results, tables } = await buildEverything({ period: '30d', currency: 'XTS' })
    expect(queries.some((q) => q.sql.includes('assigned_to_user_id'))).toBe(false)
    for (const result of results) {
      expect(result.kpis.filter((kpi) => kpi.staffNA)).toEqual([])
      expect(result.blocks.filter((block) => block.staffNA)).toEqual([])
      expect(result.notes.at(-1)).toBe('rp.def_staff_filter')
    }
    expect(tables.filter((table) => table.staffNA)).toEqual([])
  })
})

describe('figures the staff filter cannot narrow are marked, the others are not', () => {
  it('marks only figures that are not about orders, and explains the filter', async () => {
    const { results, tables } = await buildEverything({ period: '30d', staff: STAFF })
    const byId = new Map(results.map((result) => [result.id, result]))
    const marked = (id: string) =>
      (byId.get(id)?.kpis ?? []).filter((kpi) => kpi.staffNA).map((kpi) => kpi.id)

    expect(marked('overview').sort()).toEqual(
      [
        'low_availability',
        'open_requests',
        'open_tickets',
        'supplier_sync_errors',
        'view_to_booking',
      ].sort(),
    )
    expect(marked('financial')).toEqual([])
    expect(marked('bookings')).toEqual([])
    expect(marked('activities')).toEqual([])
    expect(marked('customers')).toEqual([])
    expect(marked('suppliers')).toEqual([])
    expect(marked('itineraries').sort()).toEqual(
      ['itinerary_conversion', 'itinerary_downloads', 'itinerary_views'].sort(),
    )
    expect(marked('vip')).not.toContain('vip_sales')
    expect(marked('vip')).toContain('vip_active')
    expect(marked('marketing')).toContain('visitors')
    expect(marked('operations').sort()).toEqual(['denied_downloads', 'map_errors'].sort())
    expect(marked('map')).not.toContain('vip_sales')
    expect(marked('map')).toContain('map_visitors')

    for (const result of results) expect(result.notes[0]).toBe('rp.def_staff_filter')
    // Live availability is the one drill-down list that is not orders.
    expect(tables.filter((table) => table.staffNA).map((table) => table.id)).toEqual(
      Array(3).fill('records_low_availability'),
    )
  })
})
