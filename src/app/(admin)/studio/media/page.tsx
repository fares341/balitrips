import { and, asc, count, desc, eq, ilike, isNotNull, isNull, or, sql, type SQL } from 'drizzle-orm'
import Link from 'next/link'

import { db } from '@/db'
import { media } from '@/db/schema'
import { mediaUrl } from '@/lib/content/queries'
import { isStorageConfigured } from '@/lib/storage'
import { localeConfig, locales } from '@/i18n/config'

import { adminHref } from '../../_lib/admin-path'
import { getAdminI18n } from '../../_lib/i18n'
import { localeFieldName } from '../../_lib/form'
import {
  derivativesFor,
  encoderAvailable,
  formatBytes,
  isUnoptimised,
  MAX_UPLOAD_BYTES,
} from '../../_lib/image/pipeline'
import {
  isPlaceholder,
  PLACEHOLDER_CREDIT,
  publishedReferences,
  referencesFor,
} from '../../_lib/media-refs'
import { buildQuery, pageParam, param } from '../../_lib/result'
import { requireCapability } from '../../_lib/session'
import { Field, TextInput } from '../../_ui/field'
import { Flash } from '../../_ui/flash'
import { MediaThumb } from '../../_ui/media-picker'
import { PageHead } from '../../_ui/shell'
import { Empty, Pager, Pill, When } from '../../_ui/table'
import {
  clearPlaceholderCredit,
  deleteMedia,
  restoreMedia,
  updateMedia,
  uploadMedia,
} from './actions'

export const dynamic = 'force-dynamic'

/**
 * The media library.
 *
 * This screen is the reason `hero_image_id` was null on every row in the
 * database. The handoff sourced imagery from `flickr(query)` — a hot-linked
 * search URL, so every photograph on the site was a third party's bandwidth,
 * uptime and licence — and nothing carried over, which is why a script had to
 * generate 52 placeholders just so the layout could be judged.
 *
 * The upload form runs the EXISTING pipeline in `_lib/image/`: size cap,
 * magic-byte sniff, metadata strip, then an AVIF + WebP width ladder. None of
 * that is reimplemented here.
 *
 * A grid rather than a table, because the thing an operator is identifying is
 * the picture. The one column that is genuinely textual — per-locale alt —
 * lives in an inline form on each card, so fixing an accessibility gap on
 * twelve images does not mean twelve round trips through a detail page.
 */

const PAGE_SIZE = 24
const LIST = adminHref('/media')

export default async function MediaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireCapability('media.upload')
  const { t } = await getAdminI18n()
  const params = await searchParams

  const q = param(params, 'q')
  const kind = param(params, 'kind')
  const state = param(params, 'state')
  const page = pageParam(params)

  const filters: SQL[] = []

  // Archived rows are hidden by default but reachable, because the whole
  // point of a soft delete is that it can be undone.
  filters.push(state === 'archived' ? isNotNull(media.deletedAt) : isNull(media.deletedAt))

  if (q) {
    const like = `%${q}%`
    const match = or(
      ilike(media.objectKey, like),
      ilike(media.credit, like),
      sql`${media.alt} ->> 'en' ilike ${like}`,
    )
    if (match) filters.push(match)
  }

  if (kind === 'placeholder') filters.push(eq(media.credit, PLACEHOLDER_CREDIT))
  if (kind === 'real') {
    const notPlaceholder = or(isNull(media.credit), sql`${media.credit} <> ${PLACEHOLDER_CREDIT}`)
    if (notPlaceholder) filters.push(notPlaceholder)
  }

  const where = and(...filters)

  const [rows, [totalRow], [placeholderRow], [svgRow]] = await Promise.all([
    db
      .select()
      .from(media)
      .where(where)
      .orderBy(desc(media.createdAt), asc(media.objectKey))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ value: count() }).from(media).where(where),
    db
      .select({ value: count() })
      .from(media)
      .where(and(isNull(media.deletedAt), eq(media.credit, PLACEHOLDER_CREDIT))),
    db
      .select({ value: count() })
      .from(media)
      .where(and(isNull(media.deletedAt), eq(media.mimeType, 'image/svg+xml'))),
  ])

  const references = await referencesFor(rows.map((row) => row.id))

  const total = totalRow?.value ?? 0
  const placeholderCount = placeholderRow?.value ?? 0
  const svgCount = svgRow?.value ?? 0
  const optimising = encoderAvailable()
  const driver = isStorageConfigured() ? 'Spaces' : t('media.driver_local')
  const returnQuery = buildQuery(params, {}).replace(/^\?/, '')

  return (
    <>
      <PageHead title={t('media.title')} description={t('media.description')} />
      <Flash searchParams={params} />

      {placeholderCount > 0 ? (
        <div className="a-flash warn" role="status">
          <strong>{placeholderCount}</strong> {t('media.placeholder_warn')}{' '}
          <Link href={`${LIST}${buildQuery(params, { kind: 'placeholder', page: null })}`}>
            {t('media.show_placeholders')}
          </Link>
          .
        </div>
      ) : null}

      {svgCount > 0 ? (
        <div className="a-flash err" role="status">
          <strong>{svgCount}</strong> {t('media.svg_warn')}
        </div>
      ) : null}

      {!optimising ? (
        <div className="a-flash err" role="status">
          {t('media.no_sharp')}
        </div>
      ) : null}

      {/*
        No `encType` and no `method`: React owns both when the action is a
        function, and setting them alongside one is a warning in development
        and a no-op in production. A Server Action already posts multipart when
        the form carries a file, which is what makes `File` arrive intact in
        `FormData` on the server.
      */}
      <form className="a-card a-form" action={uploadMedia}>
        <h2>{t('media.upload_heading')}</h2>
        <p className="a-hint">
          {t('media.upload_hint', { max: formatBytes(MAX_UPLOAD_BYTES), driver })}
        </p>

        <div className="a-row">
          <Field label={`${t('media.image_file')} *`} htmlFor="file">
            <input
              className="a-input"
              id="file"
              name="file"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              required
            />
          </Field>
          <Field label={t('media.credit')} htmlFor="credit" hint={t('media.credit_hint')}>
            <TextInput id="credit" name="credit" placeholder={t('media.credit_placeholder')} />
          </Field>
        </div>

        <fieldset className="a-fieldset">
          <legend>{t('media.alt_text')}</legend>
          <span className="a-hint">{t('media.alt_hint')}</span>
          <div className="a-l10n">
            {locales.map((locale) => {
              const fieldName = localeFieldName('alt', locale)
              return (
                <div className="a-field" key={locale}>
                  <label htmlFor={`upload-${fieldName}`}>{localeConfig[locale].label}</label>
                  <TextInput
                    id={`upload-${fieldName}`}
                    name={fieldName}
                    lang={locale}
                    dir={localeConfig[locale].dir}
                  />
                </div>
              )
            })}
          </div>
        </fieldset>

        <div className="a-actions">
          <button className="a-btn accent" type="submit">
            {t('media.upload_btn')}
          </button>
        </div>
      </form>

      <form className="a-row a-card" method="get" action={LIST}>
        <div className="a-field">
          <label htmlFor="q">{t('common.search')}</label>
          <input
            className="a-input"
            id="q"
            name="q"
            defaultValue={q ?? ''}
            placeholder={t('media.search_placeholder')}
          />
        </div>
        <div className="a-field">
          <label htmlFor="kind">{t('media.source')}</label>
          <select className="a-select" id="kind" name="kind" defaultValue={kind ?? ''}>
            <option value="">{t('common.all')}</option>
            <option value="placeholder">{t('media.kind_placeholder')}</option>
            <option value="real">{t('media.kind_real')}</option>
          </select>
        </div>
        <div className="a-field">
          <label htmlFor="state">{t('media.state')}</label>
          <select className="a-select" id="state" name="state" defaultValue={state ?? ''}>
            <option value="">{t('media.state_live')}</option>
            <option value="archived">{t('media.state_archived')}</option>
          </select>
        </div>
        <div className="a-actions">
          <button className="a-btn" type="submit">
            {t('common.filter')}
          </button>
          <Link className="a-btn ghost" href={LIST}>
            {t('media.reset')}
          </Link>
        </div>
      </form>

      {rows.length === 0 ? (
        <Empty>{t('media.empty')}</Empty>
      ) : (
        <div className="a-cols">
          {rows.map((row) => {
            const used = references.get(row.id) ?? []
            const blocking = publishedReferences(used)

            /**
             * `derivativesFor()` derives its keys from the object key's second
             * segment, so it only tells the truth for keys the pipeline itself
             * wrote (`media/<id>/…`). The 52 seeded rows were inserted by a
             * script straight into `public/seed-media/`, and asking about them
             * would produce a confident list of `media/<filename>.svg/320.avif`
             * keys that 404. Anything not under `media/` is reported as what it
             * is: never ingested.
             */
            const ingested = row.objectKey.startsWith('media/')
            const derivatives = ingested ? derivativesFor(row.objectKey, row.width) : []

            return (
              <div className="a-card" key={row.id}>
                <a href={mediaUrl(row.objectKey)} target="_blank" rel="noreferrer">
                  <MediaThumb
                    item={{
                      id: row.id,
                      objectKey: row.objectKey,
                      alt: row.alt,
                      credit: row.credit,
                      width: row.width,
                      height: row.height,
                    }}
                    size={180}
                  />
                </a>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBlock: 10 }}>
                  {isPlaceholder(row.credit) ? (
                    <Pill tone="warn">{t('media.pill_placeholder')}</Pill>
                  ) : (
                    <Pill tone="good">{t('media.pill_uploaded')}</Pill>
                  )}
                  {row.deletedAt ? <Pill tone="bad">{t('media.pill_archived')}</Pill> : null}
                  {!ingested ? (
                    <Pill tone="bad">{t('media.pill_not_ingested')}</Pill>
                  ) : isUnoptimised(row.objectKey) ? (
                    <Pill tone="bad">{t('media.pill_no_derivatives')}</Pill>
                  ) : (
                    <Pill tone="neutral">
                      {t('media.pill_derivatives', { count: derivatives.length })}
                    </Pill>
                  )}
                  {row.mimeType === 'image/svg+xml' ? <Pill tone="bad">SVG</Pill> : null}
                  {used.length > 0 ? (
                    <Pill tone={blocking.length > 0 ? 'info' : 'neutral'}>
                      {t('media.pill_used', { count: used.length })}
                    </Pill>
                  ) : (
                    <Pill tone="neutral">{t('media.pill_unused')}</Pill>
                  )}
                </div>

                <dl
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'auto 1fr',
                    gap: '2px 10px',
                    margin: 0,
                    fontSize: 12,
                  }}
                >
                  <dt className="a-muted">{t('media.key')}</dt>
                  <dd className="a-mono" style={{ margin: 0, wordBreak: 'break-all' }}>
                    {row.objectKey}
                  </dd>
                  <dt className="a-muted">{t('media.size')}</dt>
                  <dd style={{ margin: 0 }}>
                    {row.width}×{row.height} · {formatBytes(row.bytes)} · {row.mimeType}
                  </dd>
                  <dt className="a-muted">{t('media.added')}</dt>
                  <dd style={{ margin: 0 }}>
                    <When value={row.createdAt} />
                  </dd>
                  {used.length > 0 ? (
                    <>
                      <dt className="a-muted">{t('media.used_by')}</dt>
                      <dd style={{ margin: 0 }}>
                        {used.map((reference) => (
                          <div key={`${reference.entity}-${reference.id}`}>
                            <Link href={adminHref(`/${reference.section}/${reference.id}`)}>
                              {reference.label}
                            </Link>{' '}
                            <span className="a-muted">
                              ({reference.entity}, {reference.status})
                            </span>
                          </div>
                        ))}
                      </dd>
                    </>
                  ) : null}
                </dl>

                {row.deletedAt ? (
                  <form
                    className="a-inline-form"
                    action={restoreMedia.bind(null, row.id)}
                    style={{ marginBlockStart: 12 }}
                  >
                    <input type="hidden" name="returnQuery" value={returnQuery} />
                    <button className="a-btn" type="submit">
                      {t('media.restore')}
                    </button>
                  </form>
                ) : (
                  <>
                    <form
                      className="a-form"
                      action={updateMedia.bind(null, row.id)}
                      style={{ marginBlockStart: 12, gap: 10 }}
                    >
                      <input type="hidden" name="returnQuery" value={returnQuery} />
                      <fieldset className="a-fieldset">
                        <legend>{t('media.alt_text')}</legend>
                        <div className="a-l10n">
                          {locales.map((locale) => {
                            const fieldName = localeFieldName('alt', locale)
                            const id = `${row.id}-${fieldName}`
                            return (
                              <div className="a-field" key={locale}>
                                <label htmlFor={id}>{localeConfig[locale].short}</label>
                                <TextInput
                                  id={id}
                                  name={fieldName}
                                  defaultValue={row.alt?.[locale] ?? ''}
                                  lang={locale}
                                  dir={localeConfig[locale].dir}
                                />
                              </div>
                            )
                          })}
                        </div>
                      </fieldset>

                      <Field
                        label={t('media.credit')}
                        htmlFor={`${row.id}-credit`}
                        hint={
                          isPlaceholder(row.credit) ? t('media.credit_replace_hint') : undefined
                        }
                      >
                        <TextInput
                          id={`${row.id}-credit`}
                          name="credit"
                          defaultValue={row.credit ?? ''}
                        />
                      </Field>

                      <div className="a-actions">
                        <button className="a-btn" type="submit">
                          {t('media.save_details')}
                        </button>
                      </div>
                    </form>

                    {isPlaceholder(row.credit) ? (
                      <form
                        className="a-row"
                        action={clearPlaceholderCredit.bind(null, row.id)}
                        style={{ marginBlockStart: 10 }}
                      >
                        <input type="hidden" name="returnQuery" value={returnQuery} />
                        <div className="a-field">
                          <label htmlFor={`${row.id}-newcredit`}>{t('media.real_credit')}</label>
                          <TextInput
                            id={`${row.id}-newcredit`}
                            name="credit"
                            placeholder={t('media.real_credit_placeholder')}
                            required
                          />
                        </div>
                        <div className="a-actions">
                          <button className="a-btn ghost" type="submit">
                            {t('media.not_placeholder_btn')}
                          </button>
                        </div>
                      </form>
                    ) : null}

                    <form
                      className="a-inline-form"
                      action={deleteMedia.bind(null, row.id)}
                      style={{ marginBlockStart: 10 }}
                    >
                      <input type="hidden" name="returnQuery" value={returnQuery} />
                      <button className="a-btn danger small" type="submit">
                        {t('media.archive')}
                      </button>
                      {blocking.length > 0 ? (
                        <span className="a-hint">
                          {t('media.archive_blocked', { count: blocking.length })}
                        </span>
                      ) : null}
                    </form>
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}

      <Pager basePath={LIST} searchParams={params} page={page} pageSize={PAGE_SIZE} total={total} />
    </>
  )
}
