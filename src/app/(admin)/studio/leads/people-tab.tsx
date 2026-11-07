import { and, count, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm'
import Link from 'next/link'

import { db } from '@/db'
import { cartReminders, coupons, LEAD_SOURCES, leadContacts, users } from '@/db/schema'
import { locales } from '@/i18n/config'
import { can, type Role } from '@/lib/auth/roles'
import { leadOrdersSql } from '@/lib/leads/capture'
import { readLeadSettings } from '@/lib/leads/settings'

import type { Translate } from '../../_i18n'
import { adminHref } from '../../_lib/admin-path'
import { buildQuery, pageParam, param } from '../../_lib/result'
import { PdfExportButton } from '../../_ui/pdf-export'
import { Empty, Pager, Pill, Table, When } from '../../_ui/table'
import { saveLeadCaptureSettings } from './capture-actions'

const PAGE_SIZE = 25
const LIST = adminHref('/leads')

export function peopleWhere(
  params: Record<string, string | string[] | undefined>,
): SQL | undefined {
  const filters: SQL[] = []
  const q = param(params, 'q')
  const source = param(params, 'source')
  if (q) {
    const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
    const match = or(
      ilike(leadContacts.name, like),
      ilike(leadContacts.phone, like),
      ilike(leadContacts.email, like),
    )
    if (match) filters.push(match)
  }
  if (source && (LEAD_SOURCES as readonly string[]).includes(source)) {
    filters.push(eq(leadContacts.source, source))
  }
  if (param(params, 'consent') === 'yes') {
    filters.push(sql`(${leadContacts.whatsappConsent} or ${leadContacts.emailConsent})`)
  }
  return filters.length > 0 ? and(...filters) : undefined
}

export async function countPeople(): Promise<number> {
  const [row] = await db.select({ value: count() }).from(leadContacts)
  return row?.value ?? 0
}

export async function PeopleTab({
  params,
  role,
  t,
}: {
  params: Record<string, string | string[] | undefined>
  role: Role
  t: Translate
}) {
  const page = pageParam(params)
  const where = peopleWhere(params)
  const [rows, [total], settings] = await Promise.all([
    db
      .select({
        lead: leadContacts,
        code: coupons.code,
        orders: leadOrdersSql,
        reminded: sql<boolean>`exists (select 1 from ${cartReminders} r where r.lead_id = ${leadContacts.id})`,
        // Replied STOP on WhatsApp (an account with this number or user).
        optedOutAt: sql<Date | null>`(select max(u.whatsapp_opted_out_at) from ${users} u where u.whatsapp_opted_out_at is not null and (u.id = ${leadContacts.userId} or (${leadContacts.phone} is not null and u.phone_normalized = ${leadContacts.phone})))`,
      })
      .from(leadContacts)
      .leftJoin(coupons, eq(coupons.id, leadContacts.couponId))
      .where(where)
      .orderBy(desc(leadContacts.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ value: count() }).from(leadContacts).where(where),
    readLeadSettings(),
  ])
  const q = param(params, 'q')
  const source = param(params, 'source')
  const consent = param(params, 'consent') === 'yes'
  const mayExport = can(role, 'customers.export')

  return (
    <>
      <p className="a-muted">{t('lc.intro')}</p>
      <form className="a-row a-card" method="get" action={LIST}>
        <input type="hidden" name="tab" value="people" />
        <div className="a-field">
          <label htmlFor="lc-q">{t('lc.search')}</label>
          <input className="a-input" id="lc-q" name="q" defaultValue={q ?? ''} />
        </div>
        <div className="a-field">
          <label htmlFor="lc-source">{t('lc.source')}</label>
          <select className="a-select" id="lc-source" name="source" defaultValue={source ?? ''}>
            <option value="">{t('leads.any')}</option>
            {LEAD_SOURCES.map((value) => (
              <option key={value} value={value}>
                {t(`lc.src_${value}`)}
              </option>
            ))}
          </select>
        </div>
        <label className="a-check" style={{ alignSelf: 'end' }}>
          <input type="checkbox" name="consent" value="yes" defaultChecked={consent} />{' '}
          {t('lc.consent_any')}
        </label>
        <div className="a-actions">
          <button className="a-btn" type="submit">
            {t('leads.filter')}
          </button>
          <Link className="a-btn ghost" href={`${LIST}?tab=people`}>
            {t('leads.reset')}
          </Link>
          {mayExport ? (
            <a
              className="a-btn ghost"
              href={`${adminHref('/leads/export')}${buildQuery(params, { tab: 'people', page: null })}`}
            >
              {t('lc.export_csv')}
            </a>
          ) : null}
          <PdfExportButton
            kind="leads"
            role={role}
            searchParams={{ q: q ?? undefined, status: source ?? undefined }}
            back={`${LIST}?tab=people`}
          />
        </div>
      </form>

      {rows.length === 0 ? (
        <Empty>{t('lc.empty')}</Empty>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>{t('lc.col_person')}</th>
              <th>{t('lc.col_source')}</th>
              <th>{t('lc.col_consent')}</th>
              <th className="num">{t('lc.col_orders')}</th>
              <th>{t('lc.col_date')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ lead, code, orders, reminded, optedOutAt }) => (
              <tr key={lead.id}>
                <td>
                  <strong>{lead.name ?? t('leads.unnamed')}</strong>
                  <div className="a-muted a-mono" dir="ltr">
                    {lead.phone ?? '—'}
                  </div>
                  <div className="a-muted" dir="ltr">
                    {lead.email ?? ''}
                  </div>
                  {code ? (
                    <div className="a-muted">
                      {t('lc.coupon')}: <span className="a-mono">{code}</span>
                    </div>
                  ) : null}
                </td>
                <td>
                  <Pill tone="info">{t(`lc.src_${lead.source}`)}</Pill>
                  {reminded ? <div className="a-muted">{t('lc.reminded')}</div> : null}
                </td>
                <td>
                  {optedOutAt ? (
                    <div>
                      <Pill tone="warn">{t('wstop.opted_out')}</Pill>{' '}
                      <span className="a-muted">
                        <When value={new Date(optedOutAt)} />
                      </span>
                    </div>
                  ) : null}
                  {lead.whatsappConsent ? (
                    <div>
                      <Pill tone="good">{t('lc.ch_whatsapp')}</Pill>{' '}
                      <span className="a-muted">
                        <When value={lead.whatsappConsentAt} />
                      </span>
                    </div>
                  ) : null}
                  {lead.emailConsent ? (
                    <div>
                      <Pill tone="good">{t('lc.ch_email')}</Pill>{' '}
                      <span className="a-muted">
                        <When value={lead.emailConsentAt} />
                      </span>
                    </div>
                  ) : null}
                  {!lead.whatsappConsent && !lead.emailConsent ? (
                    <Pill tone="neutral">{t('lc.no_consent')}</Pill>
                  ) : null}
                </td>
                <td className="num">
                  {orders > 0 && lead.email ? (
                    <Link href={`${adminHref('/orders')}?q=${encodeURIComponent(lead.email)}`}>
                      {orders}
                    </Link>
                  ) : (
                    orders
                  )}
                </td>
                <td>
                  <When value={lead.createdAt} />
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <Pager
        basePath={LIST}
        searchParams={params}
        page={page}
        pageSize={PAGE_SIZE}
        total={total?.value ?? 0}
      />

      {can(role, 'config.write') ? (
        <form className="a-card" action={saveLeadCaptureSettings} style={{ marginBlockStart: 24 }}>
          <h2>{t('lc.settings')}</h2>
          <label className="a-check">
            <input type="checkbox" name="popupEnabled" defaultChecked={settings.popupEnabled} />{' '}
            {t('lc.popup_enabled')}
          </label>
          <p className="a-muted">{t('lc.popup_hint')}</p>
          <div className="a-row">
            <div className="a-field">
              <label htmlFor="lc-pct">{t('lc.percent')}</label>
              <input
                className="a-input"
                id="lc-pct"
                name="discountPercent"
                type="number"
                min={1}
                max={50}
                defaultValue={settings.discountPercent}
              />
            </div>
            <div className="a-field">
              <label htmlFor="lc-delay">{t('lc.delay')}</label>
              <input
                className="a-input"
                id="lc-delay"
                name="delaySeconds"
                type="number"
                min={5}
                max={300}
                defaultValue={settings.delaySeconds}
              />
            </div>
            <div className="a-field">
              <label htmlFor="lc-days">{t('lc.valid_days')}</label>
              <input
                className="a-input"
                id="lc-days"
                name="couponValidDays"
                type="number"
                min={1}
                max={365}
                defaultValue={settings.couponValidDays}
              />
            </div>
          </div>
          <div className="a-row">
            {locales.map((l) => (
              <div className="a-field" key={l}>
                <label htmlFor={`lc-h-${l}`}>{t('lc.headline', { locale: l.toUpperCase() })}</label>
                <input
                  className="a-input"
                  id={`lc-h-${l}`}
                  name={`headline_${l}`}
                  maxLength={160}
                  dir={l === 'ar' ? 'rtl' : 'ltr'}
                  defaultValue={settings.headline[l]}
                />
              </div>
            ))}
          </div>
          <label className="a-check">
            <input
              type="checkbox"
              name="abandonedEnabled"
              defaultChecked={settings.abandonedEnabled}
            />{' '}
            {t('lc.abandoned_enabled')}
          </label>
          <p className="a-muted">{t('lc.abandoned_hint')}</p>
          <div className="a-row">
            <div className="a-field">
              <label htmlFor="lc-ad">{t('lc.abandoned_delay')}</label>
              <input
                className="a-input"
                id="lc-ad"
                name="abandonedDelayMinutes"
                type="number"
                min={30}
                max={1440}
                defaultValue={settings.abandonedDelayMinutes}
              />
            </div>
          </div>
          <div className="a-actions">
            <button className="a-btn" type="submit">
              {t('lc.save')}
            </button>
          </div>
        </form>
      ) : null}
    </>
  )
}
