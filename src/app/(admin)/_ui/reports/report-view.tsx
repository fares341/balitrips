import Link from 'next/link'

import { changeText, kpiChange, kpiText } from '@/lib/reports/format'
import type { BarChartBlock, Kpi, ReportResult, TableBlock } from '@/lib/reports/types'

import type { Role } from '@/lib/auth/roles'

import { adminHref } from '../../_lib/admin-path'
import { canOpen } from '../../_lib/route-access'
import type { Translate } from '../../_i18n'
import { Icon, type IconName } from '../icons'
import { CountUp } from './count-up'
import { LineChart } from './line-chart'

import './reports.css'

/**
 * Renders a built report: numbers (each with its definition and a link to
 * the records behind it), charts, tables, footnotes. Server component; only
 * the line chart's hover layer runs in the browser.
 */

function DefinitionTip({ text, label }: { text: string; label: string }) {
  return (
    <details className="rp-tip">
      <summary aria-label={label} title={label}>
        i
      </summary>
      <p>{text}</p>
    </details>
  )
}

/**
 * Phase 6: a drill-down link is drawn only for a viewer who can open it (a
 * marketing manager reads reports, not orders). Without a role, every link is
 * drawn (callers that already checked).
 */
const mayFollow = (role: Role | undefined, href: string): boolean =>
  href !== '' && (role === undefined || canOpen(role, href))

export function KpiCard({
  kpi,
  t,
  intl,
  role,
  icon,
}: {
  kpi: Kpi
  t: Translate
  intl: string
  role?: Role
  /** A small brand-tinted icon (the Studio home groups). */
  icon?: IconName
}) {
  const change = kpiChange(kpi)
  const values = kpiText(kpi, intl, t('rp.hours_short'))
  const changeLabel = changeText(kpi, change, intl, {
    newLabel: t('rp.change_new'),
    points: t('rp.change_points'),
  })
  const tone = change.good === null ? '' : change.good ? 'good' : 'bad'
  const arrow = change.direction === 'up' ? '▲' : change.direction === 'down' ? '▼' : ''
  return (
    <div
      className={kpi.staffNA ? 'rp-kpi rp-staff-na' : 'rp-kpi'}
      data-kpi={kpi.id}
      data-staff-na={kpi.staffNA ? 'true' : undefined}
    >
      <div className="rp-kpi-head">
        {icon ? (
          <span className="rp-kpi-icon" aria-hidden="true">
            <Icon name={icon} size={18} />
          </span>
        ) : null}
        <span className="rp-kpi-label">{kpi.label}</span>
        <DefinitionTip text={kpi.definition} label={t('rp.what_is_this', { name: kpi.label })} />
      </div>
      {kpi.value.kind === 'unavailable' ? (
        <b className="rp-kpi-value rp-unavailable">{values[0]}</b>
      ) : (
        values.map((text, i) =>
          text === '—' ? (
            <b className="rp-kpi-value rp-unavailable" key={`${text}-${i}`}>
              {t('dashboard.none_yet')}
            </b>
          ) : (
            <CountUp className="rp-kpi-value" key={`${text}-${i}`} text={text} />
          ),
        )
      )}
      <div className="rp-kpi-foot">
        {changeLabel ? (
          <span
            className={`rp-change ${tone}`}
            title={t('rp.vs_previous')}
            aria-label={`${t('rp.vs_previous')}: ${changeLabel}`}
          >
            <span aria-hidden="true">{arrow}</span>
            {changeLabel}
          </span>
        ) : null}
        {kpi.note ? <span>{kpi.note}</span> : null}
        {kpi.staffNA ? <span className="rp-staff-na-note">{t('rp.staff_na')}</span> : null}
        {kpi.href && mayFollow(role, kpi.href) ? (
          <Link className="rp-kpi-link" href={adminHref(kpi.href)}>
            {t('rp.see_records')}
          </Link>
        ) : null}
      </div>
    </div>
  )
}

export function BarChart({ block, t, role }: { block: BarChartBlock; t: Translate; role?: Role }) {
  const max = Math.max(1, ...block.rows.map((row) => row.value))
  if (block.rows.length === 0) return <p className="a-muted">{t('rp.empty')}</p>
  return (
    <ul className="rp-bars" aria-label={block.title}>
      {block.rows.map((row, i) => {
        const inner = (
          <>
            <span className="rp-bar-label" title={row.label}>
              {row.label}
            </span>
            <span className="rp-bar-track" aria-hidden="true">
              <span
                className={`rp-bar-fill ${row.tone ?? ''}`}
                style={{
                  inlineSize: row.value > 0 ? `max(3px, ${(row.value / max) * 100}%)` : '0',
                }}
              />
            </span>
            <span className="rp-bar-value">{row.display}</span>
          </>
        )
        return (
          <li key={`${row.label}-${i}`}>
            {row.href && mayFollow(role, row.href) ? (
              <Link className="rp-bar" href={adminHref(row.href)}>
                {inner}
              </Link>
            ) : (
              <div className="rp-bar">{inner}</div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

export function DataTable({
  block,
  role,
  staffNALabel,
}: {
  block: TableBlock
  role?: Role
  /** Shown on columns the staff filter does not narrow. */
  staffNALabel?: string
}) {
  if (block.rows.length === 0) return <p className="a-muted">{block.empty}</p>
  return (
    <div className="a-table-wrap">
      <table className="a-table">
        <thead>
          <tr>
            {block.columns.map((column) => (
              <th
                key={column.key}
                className={
                  [column.num ? 'num' : '', column.staffNA ? 'rp-staff-na' : ''].join(' ').trim() ||
                  undefined
                }
                scope="col"
                title={column.staffNA ? staffNALabel : undefined}
              >
                {column.label}
                {column.staffNA ? <span className="rp-staff-na-mark"> *</span> : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row, i) => (
            <tr key={i}>
              {block.columns.map((column) => {
                const cell = row[column.key]
                const text = cell?.text ?? ''
                return (
                  <td
                    key={column.key}
                    className={
                      [column.num ? 'num' : '', column.staffNA ? 'rp-staff-na' : '']
                        .join(' ')
                        .trim() || undefined
                    }
                  >
                    {cell?.href && mayFollow(role, cell.href) ? (
                      <Link href={adminHref(cell.href)}>{text}</Link>
                    ) : (
                      text
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function ReportBody({
  result,
  t,
  intl,
  rtl,
  wideFirstChart = true,
  role,
  groups,
}: {
  result: ReportResult
  t: Translate
  intl: string
  rtl: boolean
  wideFirstChart?: boolean
  /** The viewer: drill-down links to pages they cannot open are left out. */
  role?: Role
  /**
   * Optional KPI groups (the Studio home): each a small titled grid. KPIs not
   * named in any group are shown in a last, untitled grid.
   */
  groups?: readonly KpiGroup[]
}) {
  const grouped = new Set(groups?.flatMap((group) => group.ids) ?? [])
  const rest = result.kpis.filter((kpi) => !grouped.has(kpi.id))
  return (
    <>
      {groups
        ? groups.map((group) => {
            const kpis = group.ids
              .map((id) => result.kpis.find((kpi) => kpi.id === id))
              .filter((kpi): kpi is Kpi => kpi !== undefined)
            if (kpis.length === 0) return null
            return (
              <section
                key={group.title}
                className="rp-kpi-group"
                data-tone={group.tone}
                aria-label={group.title}
              >
                <h3 className="rp-kpi-group-title">{group.title}</h3>
                <div className="rp-kpis">
                  {kpis.map((kpi) => (
                    <KpiCard
                      key={kpi.id}
                      kpi={kpi}
                      t={t}
                      intl={intl}
                      role={role}
                      icon={group.icons?.[kpi.id] ?? group.icon}
                    />
                  ))}
                </div>
              </section>
            )
          })
        : null}
      {rest.length > 0 ? (
        <section className="rp-kpis" aria-label={t('rp.numbers')}>
          {rest.map((kpi) => (
            <KpiCard key={kpi.id} kpi={kpi} t={t} intl={intl} role={role} />
          ))}
        </section>
      ) : null}

      <div className="rp-charts">
        {result.blocks.map((block, index) => {
          const wide =
            block.kind === 'table' || (wideFirstChart && index === 0 && block.kind === 'line')
          return (
            <section
              key={block.id}
              className={`a-card rp-chart${wide ? ' rp-chart-wide' : ''}${block.staffNA ? ' rp-staff-na' : ''}`}
              aria-labelledby={`rp-${block.id}`}
              data-staff-na={block.staffNA ? 'true' : undefined}
            >
              <div className="rp-chart-head">
                <h2 id={`rp-${block.id}`}>{block.title}</h2>
                {block.definition ? (
                  <DefinitionTip
                    text={block.definition}
                    label={t('rp.what_is_this', { name: block.title })}
                  />
                ) : null}
              </div>
              {block.staffNA ? <p className="rp-staff-na-note">{t('rp.staff_na')}</p> : null}
              {block.kind === 'line' &&
              block.current.every((v) => v === 0) &&
              (block.previous ?? []).every((v) => v === 0) ? (
                <p className="a-muted">{t('rp.empty_chart')}</p>
              ) : block.kind === 'line' ? (
                <LineChart
                  width={wide ? 1000 : 720}
                  block={block}
                  intl={intl}
                  rtl={rtl}
                  labels={{
                    showTable: t('rp.show_table'),
                    period: t('rp.col_period'),
                    summary: t('rp.chart_keys_hint'),
                  }}
                />
              ) : block.kind === 'bar' ? (
                <BarChart block={block} t={t} role={role} />
              ) : (
                <DataTable block={block} role={role} staffNALabel={t('rp.staff_na')} />
              )}
              {block.definition && block.kind !== 'table' ? (
                <p className="rp-def">{block.definition}</p>
              ) : null}
            </section>
          )
        })}
      </div>

      <details className="a-card rp-definitions">
        <summary>
          <span id="rp-defs">{t('rp.definitions_title')}</span>
        </summary>
        <dl aria-labelledby="rp-defs">
          {result.kpis.map((kpi) => (
            <div key={kpi.id} style={{ display: 'contents' }}>
              <dt>{kpi.label}</dt>
              <dd>{kpi.definition}</dd>
            </div>
          ))}
        </dl>
        {result.notes.length > 0 ? (
          <ul className="rp-notes">
            {result.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        ) : null}
      </details>
    </>
  )
}

export interface KpiGroup {
  title: string
  ids: readonly string[]
  /** Icon for every card of the group, unless `icons` names one for a KPI. */
  icon?: IconName
  icons?: Readonly<Record<string, IconName>>
  /** Brand tint of the group's icons. */
  tone?: 'forest' | 'orange'
}
