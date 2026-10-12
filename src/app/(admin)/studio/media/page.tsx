import { and, asc, count, desc, eq, ilike, isNotNull, isNull, or, sql, type SQL } from 'drizzle-orm'
import Link from 'next/link'

import { db } from '@/db'
import { media } from '@/db/schema'
import { mediaUrl } from '@/lib/content/queries'
import { isStorageConfigured } from '@/lib/storage'
import { localeConfig, locales } from '@/i18n/config'

import { adminHref } from '../../_lib/admin-path'
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
  const driver = isStorageConfigured() ? 'Spaces' : 'the local public/ directory'
  const returnQuery = buildQuery(params, {}).replace(/^\?/, '')

  return (
    <>
      <PageHead
        title="Media library"
        description="Uploads run the ingest pipeline: size cap, magic-byte sniff, metadata strip, then an AVIF and WebP width ladder. Nothing is hot-linked."
      />
      <Flash searchParams={params} />

      {placeholderCount > 0 ? (
        <div className="a-flash warn" role="status">
          <strong>{placeholderCount}</strong> of the images below are generated placeholders, not
          licensed photography. They exist so the layout could be judged before real imagery was
          licensed — replace them here, and clear the credit when you do.{' '}
          <Link href={`${LIST}${buildQuery(params, { kind: 'placeholder', page: null })}`}>
            Show only placeholders
          </Link>
          .
        </div>
      ) : null}

      {svgCount > 0 ? (
        <div className="a-flash err" role="status">
          <strong>{svgCount}</strong> live rows are <code>image/svg+xml</code>, written directly by{' '}
          <code>scripts/seed-media.mjs</code> rather than through this screen. The ingest pipeline
          <em> refuses</em> SVG on upload, and for a good reason: it is executable XML, and serving
          one from the site&rsquo;s own origin is stored XSS. These particular files are generated
          artwork with no scripting in them, so they are not dangerous — but they are outside the
          policy the rest of the library enforces, and they should be replaced with raster imagery
          before launch.
        </div>
      ) : null}

      {!optimising ? (
        <div className="a-flash err" role="status">
          The <code>sharp</code> encoder is not available in this environment, so uploads are stored
          WITHOUT their AVIF/WebP ladder, under an <code>unoptimised/</code> prefix. The site will
          serve the full-size original. Install the platform binary before uploading production
          imagery.
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
        <h2>Upload</h2>
        <p className="a-hint">
          JPEG, PNG or WebP, identified by their contents rather than their name. Up to{' '}
          {formatBytes(MAX_UPLOAD_BYTES)} and 80 megapixels. EXIF — including the GPS coordinates
          most phones embed — is stripped before anything is stored. Objects go to {driver}.
        </p>

        <div className="a-row">
          <Field label="Image file *" htmlFor="file">
            <input
              className="a-input"
              id="file"
              name="file"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              required
            />
          </Field>
          <Field
            label="Credit"
            htmlFor="credit"
            hint="Photographer and licence. Leave blank only for artwork you own outright."
          >
            <TextInput id="credit" name="credit" placeholder="© Name — licence" />
          </Field>
        </div>

        <fieldset className="a-fieldset">
          <legend>Alt text</legend>
          <span className="a-hint">
            Describes the image for a screen reader and for a failed load. Per-locale, because it is
            content: an English alt on an Arabic page is as useless as none. English is enough to
            start with — the others fall back to it.
          </span>
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
            Upload image
          </button>
        </div>
      </form>

      <form className="a-row a-card" method="get" action={LIST}>
        <div className="a-field">
          <label htmlFor="q">Search</label>
          <input
            className="a-input"
            id="q"
            name="q"
            defaultValue={q ?? ''}
            placeholder="Object key, alt text or credit"
          />
        </div>
        <div className="a-field">
          <label htmlFor="kind">Source</label>
          <select className="a-select" id="kind" name="kind" defaultValue={kind ?? ''}>
            <option value="">Any</option>
            <option value="placeholder">Generated placeholders</option>
            <option value="real">Everything else</option>
          </select>
        </div>
        <div className="a-field">
          <label htmlFor="state">State</label>
          <select className="a-select" id="state" name="state" defaultValue={state ?? ''}>
            <option value="">Live</option>
            <option value="archived">Archived</option>
          </select>
        </div>
        <div className="a-actions">
          <button className="a-btn" type="submit">
            Filter
          </button>
          <Link className="a-btn ghost" href={LIST}>
            Reset
          </Link>
        </div>
      </form>

      {rows.length === 0 ? (
        <Empty>No images match those filters.</Empty>
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
                    <Pill tone="warn">generated placeholder</Pill>
                  ) : (
                    <Pill tone="good">uploaded</Pill>
                  )}
                  {row.deletedAt ? <Pill tone="bad">archived</Pill> : null}
                  {!ingested ? (
                    <Pill tone="bad">never ingested</Pill>
                  ) : isUnoptimised(row.objectKey) ? (
                    <Pill tone="bad">no derivatives</Pill>
                  ) : (
                    <Pill tone="neutral">{derivatives.length} derivatives</Pill>
                  )}
                  {row.mimeType === 'image/svg+xml' ? <Pill tone="bad">SVG</Pill> : null}
                  {used.length > 0 ? (
                    <Pill tone={blocking.length > 0 ? 'info' : 'neutral'}>used {used.length}x</Pill>
                  ) : (
                    <Pill tone="neutral">unused</Pill>
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
                  <dt className="a-muted">Key</dt>
                  <dd className="a-mono" style={{ margin: 0, wordBreak: 'break-all' }}>
                    {row.objectKey}
                  </dd>
                  <dt className="a-muted">Size</dt>
                  <dd style={{ margin: 0 }}>
                    {row.width}×{row.height} · {formatBytes(row.bytes)} · {row.mimeType}
                  </dd>
                  <dt className="a-muted">Added</dt>
                  <dd style={{ margin: 0 }}>
                    <When value={row.createdAt} />
                  </dd>
                  {used.length > 0 ? (
                    <>
                      <dt className="a-muted">Used by</dt>
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
                      Restore
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
                        <legend>Alt text</legend>
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
                        label="Credit"
                        htmlFor={`${row.id}-credit`}
                        hint={
                          isPlaceholder(row.credit)
                            ? 'Replace this once real photography is in place — it is what marks the image as a stand-in.'
                            : undefined
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
                          Save details
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
                          <label htmlFor={`${row.id}-newcredit`}>Real credit</label>
                          <TextInput
                            id={`${row.id}-newcredit`}
                            name="credit"
                            placeholder="© Photographer — licence"
                            required
                          />
                        </div>
                        <div className="a-actions">
                          <button className="a-btn ghost" type="submit">
                            No longer a placeholder
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
                        Archive
                      </button>
                      {blocking.length > 0 ? (
                        <span className="a-hint">
                          Will be refused: {blocking.length} published record
                          {blocking.length === 1 ? '' : 's'} still use
                          {blocking.length === 1 ? 's' : ''} it.
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
