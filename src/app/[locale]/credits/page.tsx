/**
 * Image credits.
 *
 * Attribution for every photograph on the site, in one place.
 *
 * This page is a licence obligation, not a nicety. Most of the photography is
 * Creative Commons: CC BY requires the author be credited, and CC BY-SA
 * requires that plus a statement of the licence. Only the CC0 and public
 * domain images carry no condition at all.
 *
 * It exists as a page rather than an overlay on each photo because the credits
 * are long — photographer, licence and a full source URL — and burning them
 * into the artwork stacked three lines of text across the call-to-action
 * buttons on a phone. A linked credits page is the normal way this is
 * satisfied, and it has the side benefit of being one place to check rather
 * than dozens.
 *
 * Read straight from `media.credit`, so it can never fall out of step with
 * what is actually being served. An image replaced through Studio - Media
 * updates here on the next request, with no second list to remember.
 */

import type { Metadata } from 'next'
import { isNotNull, ne, and, asc } from 'drizzle-orm'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { db } from '@/db'
import { media } from '@/db/schema'
import { locales } from '@/i18n/config'

import { alternatesFor, toLocale } from '../_seo-hreflang'
import { PageBanner } from '../_ui/page-banner'

const CREDITS_HREF = '/credits'

type PageParams = Promise<{ locale: string }>

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }))
}

export async function generateMetadata({ params }: { params: PageParams }): Promise<Metadata> {
  const { locale: raw } = await params
  const locale = toLocale(raw)
  const t = await getTranslations({ locale })

  return {
    title: t('cr_title'),
    description: t('cr_sub'),
    alternates: alternatesFor(CREDITS_HREF, locale),
    // Useful to people, not to search engines, and it would compete with real
    // content for crawl budget.
    robots: { index: false, follow: true },
  }
}

type Credit = {
  photographer: string | null
  licence: string | null
  source: string | null
  url: string | null
  raw: string
}

const LICENCE =
  /\b(CC[ -]?(BY|0)[^-–—]*|CC0|Public domain|PD[ -]\w+|Unsplash Licen[cs]e|Pexels Licen[cs]e|GFDL)\b/i
const UNKNOWN = /^(unknown( photographer)?|n\/?a|-|—)$/i

/**
 * Split "Photo: Name - LICENCE - via Source - https://url" into its parts
 * (the form scripts/import-photos.ts writes). Tolerant: a part it cannot
 * place stays null, and the row is then flagged rather than dropped — losing
 * a credit to a formatting mismatch would be the one failure that matters.
 */
function parseCredit(credit: string): Credit {
  const match = /(https?:\/\/\S+)/.exec(credit)
  const url = match ? match[1]! : null
  const text = (url === null ? credit : credit.replace(url, ''))
    .replace(/^\s*(photo|image|credit)\s*:\s*/i, '')
    .trim()
  const parts = text
    .split(/\s+[-–—]\s+/u)
    .map((part) => part.trim().replace(/[\s,;—–-]+$/u, ''))
    .filter((part) => part !== '')

  let licence: string | null = null
  let source: string | null = null
  const rest: string[] = []
  for (const part of parts) {
    if (licence === null && LICENCE.test(part)) licence = part
    else if (source === null && /^via\s+/i.test(part)) source = part.replace(/^via\s+/i, '')
    else rest.push(part)
  }
  const who = rest[0] ?? null
  return {
    photographer: who === null || UNKNOWN.test(who) ? null : who,
    licence,
    source,
    url,
    raw: credit,
  }
}

export default async function CreditsPage({ params }: { params: PageParams }) {
  const { locale: raw } = await params
  setRequestLocale(raw)

  const locale = toLocale(raw)
  const t = await getTranslations({ locale })

  const rows = await db
    .select({ id: media.id, credit: media.credit, objectKey: media.objectKey })
    .from(media)
    .where(and(isNotNull(media.credit), ne(media.credit, '')))
    .orderBy(asc(media.credit))

  const credits = rows.map((row) => ({ id: row.id, ...parseCredit(row.credit ?? '') }))
  const incomplete = credits.filter((c) => c.photographer === null || c.licence === null).length

  return (
    <main>
      <PageBanner
        tag={t('navr_about')}
        title={t('cr_title')}
        subtitle={t('cr_sub')}
        breadcrumbLabel={t('cr_title')}
      />

      <section className="bt-sec">
        <div className="bt-wrap">
          <p className="muted" style={{ maxWidth: '62ch' }}>
            {t('cr_intro')}
          </p>

          {credits.length === 0 ? (
            <p className="muted">{t('cr_empty')}</p>
          ) : (
            <>
              {incomplete > 0 && (
                <p className="muted" style={{ fontSize: 14 }}>
                  {t('cr_incomplete_n', { n: incomplete })}
                </p>
              )}
              <div style={{ overflowX: 'auto', marginTop: 16 }}>
                <table className="cmp" style={{ width: '100%', fontSize: 14, lineHeight: 1.5 }}>
                  <thead>
                    <tr>
                      <th scope="col">{t('cr_col_photographer')}</th>
                      <th scope="col">{t('cr_col_licence')}</th>
                      <th scope="col">{t('cr_col_source')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {credits.map((c) => (
                      <tr
                        key={c.id}
                        data-incomplete={c.photographer === null || c.licence === null || undefined}
                      >
                        <td dir="auto" style={{ overflowWrap: 'anywhere' }}>
                          {c.photographer ?? <Missing label={t('cr_missing')} />}
                        </td>
                        <td dir="ltr">{c.licence ?? <Missing label={t('cr_missing')} />}</td>
                        <td style={{ overflowWrap: 'anywhere' }}>
                          {c.url !== null ? (
                            <a
                              href={c.url}
                              rel="noopener noreferrer nofollow"
                              target="_blank"
                              dir="ltr"
                            >
                              {c.source ?? t('cr_source_link')}
                            </a>
                          ) : (
                            <span dir="ltr">{c.source ?? '—'}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </section>
    </main>
  )
}

/** A required field the credit line does not carry (H15): shown, not hidden. */
function Missing({ label }: { label: string }) {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '1px 8px',
        borderRadius: 999,
        background: 'var(--orange-soft, #fde7cf)',
        color: 'var(--orange-ink, #8a4b00)',
        fontSize: 12.5,
        fontWeight: 700,
      }}
    >
      {label}
    </span>
  )
}
