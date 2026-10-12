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

  return {
    title: 'Image credits',
    description: 'Photographers, licences and sources for the photography used on this site.',
    alternates: alternatesFor(CREDITS_HREF, locale),
    // Useful to people, not to search engines, and it would compete with real
    // content for crawl budget.
    robots: { index: false, follow: true },
  }
}

/**
 * Split "Photo: Name - LICENCE - via Source - https://url" into its parts.
 *
 * The string is built by scripts/import-photos.ts and by hand in Studio, so
 * this is tolerant: anything it cannot parse is shown verbatim rather than
 * mangled or dropped. Losing a credit to a formatting mismatch would be the
 * one failure mode that actually matters here.
 */
function parseCredit(credit: string): { text: string; url: string | null } {
  const match = /(https?:\/\/\S+)/.exec(credit)
  const url = match ? match[1]! : null
  const text = url === null ? credit : credit.replace(url, '').replace(/[\s—-]+$/u, '')
  return { text: text.trim(), url }
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

  return (
    <main>
      <PageBanner
        tag={t('navr_about')}
        title="Image credits"
        subtitle="Photographers, licences and sources for the photography on this site."
        breadcrumbLabel="Image credits"
      />

      <section className="bt-sec">
        <div className="bt-wrap">
          <p className="muted" style={{ maxWidth: '62ch' }}>
            Photography on this site is used under Creative Commons licences, or is in the public
            domain. Each entry below names the photographer and the licence, and links to the
            original.
          </p>

          {rows.length === 0 ? (
            <p className="muted">No credited images yet.</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: '24px 0 0', display: 'grid', gap: 10 }}>
              {rows.map((row) => {
                const { text, url } = parseCredit(row.credit ?? '')
                return (
                  <li
                    key={row.id}
                    style={{
                      fontSize: 14.5,
                      lineHeight: 1.6,
                      paddingBottom: 10,
                      borderBottom: '1px solid var(--line, rgba(0,0,0,.08))',
                      overflowWrap: 'anywhere',
                    }}
                  >
                    {text}
                    {url !== null && (
                      <>
                        {' — '}
                        <a href={url} rel="noopener noreferrer nofollow" target="_blank">
                          source
                        </a>
                      </>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </section>
    </main>
  )
}
