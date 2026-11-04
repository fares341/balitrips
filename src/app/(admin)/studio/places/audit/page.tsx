import Link from 'next/link'

import { adminHref } from '../../../_lib/admin-path'
import { getAdminI18n } from '../../../_lib/i18n'
import { canOpenHref } from '../../../_lib/route-access'
import { requireCapability } from '../../../_lib/session'
import { PageHead } from '../../../_ui/shell'
import { Pill, Table } from '../../../_ui/table'
import { loadPlacesAudit } from './data'
import { AUDIT_LANGS, auditLang, auditT, issueLabel } from './labels'

export const dynamic = 'force-dynamic'

/** Rows shown per issue before «and N more» (the CSV has them all). */
const SHOW = 60

/**
 * «تدقيق الأماكن» (owner, Nov 2026) — read-only: duplicate photos, duplicate
 * places and data gaps across every map place. No action on this page
 * writes anything; each row links to the place editor.
 */
export default async function PlacesAuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requireCapability('content.read')
  const { locale } = await getAdminI18n()
  const params = await searchParams
  const lang = auditLang(params.lang, locale)
  const withHashes = params.hash === '1'
  const t = auditT(lang)
  const data = await loadPlacesAudit(lang, withHashes)

  const query = (extra: Record<string, string>) => {
    const q = new URLSearchParams({
      ...(lang !== locale ? { lang } : {}),
      ...(withHashes ? { hash: '1' } : {}),
      ...extra,
    })
    const s = q.toString()
    return s ? `?${s}` : ''
  }
  const editor = (id: string) => {
    const href = adminHref(`/places/${id}`)
    return canOpenHref(session.role, href) ? href : null
  }

  return (
    <div dir={lang === 'ar' ? 'rtl' : 'ltr'} lang={lang}>
      <PageHead
        title={t('title')}
        description={t('desc')}
        actions={
          <>
            {!withHashes ? (
              <Link
                className="a-btn a-btn-ghost"
                href={`${adminHref('/places/audit')}${query({ hash: '1' })}`}
              >
                {t('hash_run')}
              </Link>
            ) : null}
            <a className="a-btn" href={`${adminHref('/places/audit/export')}${query({ lang })}`}>
              {t('export')}
            </a>
          </>
        }
      />

      <section className="a-card" aria-labelledby="pa-sum">
        <div className="a-card-head">
          <h2 id="pa-sum">{t('summary')}</h2>
          <nav aria-label={t('lang')} style={{ display: 'flex', gap: 8 }}>
            {AUDIT_LANGS.map((l) => (
              <Link
                key={l}
                href={`${adminHref('/places/audit')}?${new URLSearchParams({ lang: l, ...(withHashes ? { hash: '1' } : {}) })}`}
                aria-current={l === lang ? 'true' : undefined}
                className={l === lang ? 'a-btn a-btn-sm' : 'a-btn a-btn-sm a-btn-ghost'}
              >
                {l.toUpperCase()}
              </Link>
            ))}
          </nav>
        </div>
        <p className="a-hint">{t('scanned', { n: data.scanned })}</p>
        <p className="a-hint">
          {data.hashed
            ? t('hash_on', { n: data.hashed.files, failed: data.hashed.failed })
            : t('hash_off')}
        </p>
        <ul className="a-ready-list">
          {data.byIssue.map(({ issue, rows }) => (
            <li key={issue} className={rows.length === 0 ? 'ok' : 'todo'}>
              <Pill tone={rows.length === 0 ? 'good' : 'warn'}>{rows.length}</Pill>
              <span>{issueLabel(lang, issue)}</span>
              {rows.length > 0 ? (
                <a className="a-ready-go" href={`#${issue}`}>
                  ↓
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      {data.byIssue
        .filter(({ rows }) => rows.length > 0)
        .map(({ issue, rows }) => (
          <section key={issue} className="a-card" id={issue} aria-labelledby={`h-${issue}`}>
            <h2 id={`h-${issue}`}>
              {issueLabel(lang, issue)} <span className="a-count-badge">{rows.length}</span>
            </h2>
            <Table>
              <thead>
                <tr>
                  <th>{t('group')}</th>
                  <th>{t('place')}</th>
                  <th>{t('category')}</th>
                  <th>{t('status')}</th>
                  <th>{t('detail')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, SHOW).map((row, i) => {
                  const href = editor(row.placeId)
                  return (
                    <tr key={`${row.placeId}-${i}`}>
                      <td>{row.group ?? '—'}</td>
                      <td>
                        {href ? <Link href={href}>{row.name}</Link> : row.name}
                        <div className="a-muted" dir="ltr">
                          {row.slug}
                        </div>
                      </td>
                      <td>{row.category || '—'}</td>
                      <td>
                        <Pill tone={row.status === 'published' && !row.hidden ? 'good' : 'neutral'}>
                          {row.hidden ? `${row.status} · hidden` : row.status}
                        </Pill>
                      </td>
                      <td dir="ltr" style={{ wordBreak: 'break-all' }}>
                        {row.detail}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </Table>
            {rows.length > SHOW ? (
              <p className="a-hint">{t('more', { n: rows.length - SHOW })}</p>
            ) : null}
          </section>
        ))}
    </div>
  )
}
