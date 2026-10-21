import { PERIOD_PRESETS } from '@/lib/reports/period'
import { PRODUCT_TYPES, type ReportFilters } from '@/lib/reports/filters'
import { rangeLabel } from '@/lib/reports/builders/helpers'

import type { Translate } from '../../_i18n'

import './reports.css'

/**
 * Period and filters, as a plain GET form: every view is a URL that can be
 * bookmarked, shared or exported, and it works without JavaScript. The
 * custom dates are used when "Custom range" is chosen.
 */
export function FilterBar({
  action,
  filters,
  t,
  intl,
  suppliers,
  currencies,
  staff = [],
  extra,
  showType = true,
  showSupplier = true,
  children,
}: {
  action: string
  filters: ReportFilters
  t: Translate
  intl: string
  suppliers: readonly { id: string; name: string }[]
  currencies: readonly string[]
  /**
   * Phase 6: team members for the "Staff" filter (orders handled by them —
   * see `rp.def_staff_filter`). Every page with this bar passes the same list.
   */
  staff?: readonly { id: string; name: string | null; email: string }[]
  extra?: Record<string, string>
  showType?: boolean
  showSupplier?: boolean
  /** Export buttons and the like, shown at the end of the bar. */
  children?: React.ReactNode
}) {
  const p = filters.period
  return (
    <>
      <form className="rp-filters" method="get" action={action} aria-label={t('rp.filters')}>
        {Object.entries(extra ?? {}).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <div className="a-field">
          <label htmlFor="rp-period">{t('rp.period')}</label>
          <select id="rp-period" name="period" className="a-select" defaultValue={p.preset}>
            {PERIOD_PRESETS.map((preset) => (
              <option key={preset} value={preset}>
                {t(`rp.preset_${preset}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="a-field">
          <span id="rp-dates-label" className="a-hint">
            {t('rp.custom_dates')}
          </span>
          <div className="rp-dates" role="group" aria-labelledby="rp-dates-label">
            <input
              className="a-input"
              type="date"
              name="from"
              aria-label={t('rp.from')}
              defaultValue={p.fromDate}
            />
            <input
              className="a-input"
              type="date"
              name="to"
              aria-label={t('rp.to')}
              defaultValue={p.toDate}
            />
          </div>
        </div>
        {showType ? (
          <div className="a-field">
            <label htmlFor="rp-type">{t('rp.product_type')}</label>
            <select id="rp-type" name="type" className="a-select" defaultValue={filters.type ?? ''}>
              <option value="">{t('rp.all')}</option>
              {PRODUCT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {t(`rp.type_${type}`)}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        {showSupplier && suppliers.length > 0 ? (
          <div className="a-field">
            <label htmlFor="rp-supplier">{t('rp.supplier')}</label>
            <select
              id="rp-supplier"
              name="supplier"
              className="a-select"
              defaultValue={filters.supplierId ?? ''}
            >
              <option value="">{t('rp.all')}</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        {currencies.length > 1 || filters.currency ? (
          <div className="a-field">
            <label htmlFor="rp-currency">{t('common.currency')}</label>
            <select
              id="rp-currency"
              name="currency"
              className="a-select"
              defaultValue={filters.currency ?? ''}
            >
              <option value="">{t('rp.all')}</option>
              {currencies.map((currency) => (
                <option key={currency} value={currency}>
                  {currency}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        {staff.length > 0 || filters.staffId ? (
          <div className="a-field">
            <label htmlFor="rp-staff" title={t('rp.def_staff_filter')}>
              {t('rp.staff')}
            </label>
            <select
              id="rp-staff"
              name="staff"
              className="a-select"
              defaultValue={filters.staffId ?? ''}
              aria-describedby="rp-staff-def"
            >
              <option value="">{t('rp.all')}</option>
              {staff.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name?.trim() || member.email}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <label className="rp-compare">
          {/* Checked sends "1" first; unchecked sends only the hidden "0". */}
          <input type="checkbox" name="compare" value="1" defaultChecked={filters.compare} />
          <input type="hidden" name="compare" value="0" />
          {t('rp.compare')}
        </label>
        <div className="rp-filter-actions">
          <button className="a-btn" type="submit">
            {t('rp.apply')}
          </button>
          {children}
        </div>
      </form>
      <p className="rp-period-line">
        <b>{rangeLabel(p.fromDate, p.toDate, intl)}</b>
        {filters.compare ? (
          <>
            {' · '}
            {t('rp.compared_with')} {rangeLabel(p.prevFromDate, p.prevToDate, intl)}
          </>
        ) : null}
        {' · '}
        {t('rp.bali_time')}
      </p>
      {/* The definition of the staff filter, shown while it is on (and read by screen readers). */}
      <p id="rp-staff-def" className="a-hint rp-staff-def" hidden={!filters.staffId}>
        {t('rp.def_staff_filter')}
      </p>
    </>
  )
}
