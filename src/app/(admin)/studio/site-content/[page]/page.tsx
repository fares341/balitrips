import Link from 'next/link'
import { notFound } from 'next/navigation'

import { HERO_CLIPS } from '@/app/[locale]/_home/hero-media'
import { FAQ_GROUPS } from '@/app/[locale]/faq/groups'
import {
  FOOTER_QUICK_ROUTES,
  HEADER_ROUTES,
  INFO_ROUTES,
  type NavRoute,
} from '@/components/layout/routes'
import { localeConfig, type Locale } from '@/i18n/config'
import { HERO_POSTERS } from '@/lib/content/home-content'
import { BUNDLED_MESSAGES } from '@/lib/content/home-content-bundled'
import {
  DEFAULT_OFFICES,
  faqItemsFromBundled,
  heroVideoSources,
  isSitePageId,
  sitePage,
  SOCIAL_NETWORKS,
  type SiteLink,
} from '@/lib/content/page-content'
import { MAX_VIDEO_BYTES } from '@/lib/media/video'
import type { LocaleText } from '@/lib/content/message-overrides'

import { adminHref } from '../../../_lib/admin-path'
import { getAdminI18n } from '../../../_lib/i18n'
import { readSetting } from '../../../_lib/settings'
import { requireCapability } from '../../../_lib/session'
import { loadSiteTexts } from '../../../_lib/site-texts'
import { FaqRepeater, type FaqRepeaterEntry } from '../../../_ui/faq-repeater'
import { Field, TextArea, TextInput } from '../../../_ui/field'
import { Flash } from '../../../_ui/flash'
import { LinkRepeater, type LinkRow } from '../../../_ui/link-repeater'
import { MediaPicker } from '../../../_ui/media-picker'
import { PageHead } from '../../../_ui/shell'
import { LocalizedRepeater } from '../../../_ui/sortable'
import { Pill } from '../../../_ui/table'
import { resetHeroVideo, saveHeroPosters, saveSitePage, uploadHeroVideo } from '../actions'

export const dynamic = 'force-dynamic'

/** Arabic first: the owner writes Arabic, then English, then Indonesian. */
const ORDER = ['ar', 'en', 'id'] as const

const bundled = (locale: Locale, key: string): string => {
  const value = BUNDLED_MESSAGES[locale]?.[key]
  return typeof value === 'string' ? value : ''
}

/** Long texts get a textarea. */
const isLong = (key: string) =>
  bundled('en', key).length > 80 || /(_b|_d|_lede|_story|_sub|_intro)$/.test(key)

function routeRows(routes: readonly NavRoute[]): LinkRow[] {
  return routes.map((route) => ({
    href: route.href,
    key: route.key,
    label: {
      ar: bundled('ar', route.key),
      en: bundled('en', route.key),
      id: bundled('id', route.key),
    },
  }))
}

function linkRows(links: readonly SiteLink[]): LinkRow[] {
  return links.map((link) => ({
    href: link.href,
    ...(link.key ? { key: link.key } : {}),
    label: Object.fromEntries(
      ORDER.map((l) => [l, link.label[l] || (link.key ? bundled(l, link.key) : '')]),
    ),
  }))
}

/**
 * One «محتوى الموقع» screen: the texts (per language), photos and visible
 * sections of one public page, plus that page's own parts. Every field
 * starts with what the site shows now; leaving it (or clearing it) keeps the
 * built-in text.
 */
export default async function SitePageScreen({
  params,
  searchParams,
}: {
  params: Promise<{ page: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireCapability('config.write')
  const { page } = await params
  if (!isSitePageId(page)) notFound()
  const { t } = await getAdminI18n()
  const query = await searchParams
  const def = sitePage(page)

  const [content, homeContent, contact] = await Promise.all([
    readSetting('pageContent'),
    readSetting('homeContent'),
    readSetting('contact'),
  ])
  const overrides = await loadSiteTexts(def.sections.flatMap((section) => section.texts))
  const own = content.pages[page] ?? {}
  const current = (key: string, locale: Locale) => overrides[key]?.[locale] ?? bundled(locale, key)
  const preview = def.path ?? '/'

  const back = (
    <>
      <Link className="a-btn ghost" href={adminHref('/site-content')}>
        {t('sc.back')}
      </Link>
      <a className="a-btn ghost" href={preview} target="_blank" rel="noreferrer">
        {t('sc.preview')}
      </a>
    </>
  )

  if (page === 'videos') {
    return (
      <>
        <PageHead title={t('sc.page_videos')} description={t('sc.videos_desc')} actions={back} />
        <Flash searchParams={query} />
        <div className="sc-videos">
          {HERO_CLIPS.map((clip) => {
            const uploaded = content.heroVideos[clip.id]
            const sources = heroVideoSources(clip, uploaded)
            return (
              <div className="a-card" key={clip.id}>
                <h2>
                  {bundled('ar', clip.short)}{' '}
                  {uploaded ? (
                    <Pill tone="info">{t('sc.video_custom')}</Pill>
                  ) : (
                    <Pill tone="neutral">{t('sc.video_builtin')}</Pill>
                  )}
                </h2>
                <video
                  className="sc-video"
                  muted
                  loop
                  playsInline
                  controls
                  preload="metadata"
                  poster={HERO_POSTERS[clip.id]}
                >
                  {sources.webm ? <source src={sources.webm} type="video/webm" /> : null}
                  {sources.mp4 ? <source src={sources.mp4} type="video/mp4" /> : null}
                </video>
                <form
                  className="a-form"
                  action={uploadHeroVideo.bind(null, clip.id)}
                  encType="multipart/form-data"
                >
                  <Field
                    label={t('sc.video_file')}
                    hint={t('sc.video_hint', { max: Math.round(MAX_VIDEO_BYTES / 1048576) })}
                    htmlFor={`v-${clip.id}`}
                  >
                    <input
                      id={`v-${clip.id}`}
                      className="a-input"
                      type="file"
                      name="file"
                      accept="video/mp4,video/webm"
                      required
                    />
                  </Field>
                  <button className="a-btn primary small" type="submit">
                    {t('sc.video_upload')}
                  </button>
                </form>
                {uploaded ? (
                  <form action={resetHeroVideo.bind(null, clip.id)}>
                    <button className="a-btn ghost small" type="submit">
                      {t('sc.video_reset')}
                    </button>
                  </form>
                ) : null}
              </div>
            )
          })}
        </div>
        <form className="a-card a-form" action={saveHeroPosters}>
          <h2>{t('sc.posters')}</h2>
          <p className="a-hint">{t('sc.posters_hint')}</p>
          <div className="hc-images">
            {HERO_CLIPS.map((clip) => (
              <MediaPicker
                key={clip.id}
                name={`img__hero_poster_${clip.id}`}
                label={bundled('ar', clip.short)}
                hint={t('hc.slot_hint')}
                value={homeContent.images[`hero_poster_${clip.id}`] || null}
              />
            ))}
          </div>
          <div className="a-actions">
            <button className="a-btn primary" type="submit">
              {t('sc.save')}
            </button>
          </div>
        </form>
      </>
    )
  }

  const faqEntries: FaqRepeaterEntry[] = (content.faq ?? faqItemsFromBundled(FAQ_GROUPS)).map(
    (item) => ({
      q: Object.fromEntries(
        ORDER.map((l) => [l, item.q[l] || (item.qKey ? bundled(l, item.qKey) : '')]),
      ),
      a: Object.fromEntries(
        ORDER.map((l) => [l, item.a[l] || (item.aKey ? bundled(l, item.aKey) : '')]),
      ),
      hidden: item.hidden === true,
      pkg: item.group,
    }),
  )

  return (
    <>
      <PageHead
        title={t(`sc.page_${page}`)}
        description={t(`sc.page_${page}_hint`)}
        actions={back}
      />
      <Flash searchParams={query} />

      <form className="a-form" action={saveSitePage.bind(null, page)}>
        {page === 'contact' ? (
          <div className="a-card">
            <h2>{t('sc.contact_details')}</h2>
            <p className="a-hint">{t('sc.contact_hint')}</p>
            <div className="a-row">
              <Field label={t('sc.wa_number')} hint={t('sc.wa_number_hint')} htmlFor="wa-n">
                <TextInput
                  id="wa-n"
                  name="whatsappNumber"
                  dir="ltr"
                  inputMode="numeric"
                  defaultValue={contact.whatsappNumber}
                  required
                />
              </Field>
              <Field label={t('sc.wa_display')} htmlFor="wa-d">
                <TextInput
                  id="wa-d"
                  name="whatsappDisplay"
                  dir="ltr"
                  defaultValue={contact.whatsappDisplay}
                  required
                />
              </Field>
              <Field label={t('sc.email')} htmlFor="em">
                <TextInput
                  id="em"
                  name="supportEmail"
                  type="email"
                  dir="ltr"
                  defaultValue={contact.supportEmail}
                  required
                />
              </Field>
            </div>
            <LocalizedRepeater
              name="offices"
              label={t('sc.offices')}
              hint={t('sc.offices_hint')}
              values={(content.offices ?? DEFAULT_OFFICES.map((en): LocaleText => ({ en }))).map(
                (row) => ({
                  ar: row.ar ?? '',
                  en: row.en ?? '',
                  id: row.id ?? '',
                }),
              )}
            />
          </div>
        ) : null}

        {page === 'faq' ? (
          <div className="a-card">
            <h2>{t('sc.faq_list')}</h2>
            <FaqRepeater
              name="faq"
              entries={faqEntries}
              scopes={FAQ_GROUPS.map((group) => ({
                value: group.title,
                label: bundled('ar', group.title) || group.title,
              }))}
              scopeLabel={t('sc.faq_group')}
              scopeAllLabel={t('sc.faq_group_auto')}
            />
            {content.faq ? (
              <label className="a-check">
                <input type="checkbox" name="faq_reset" /> {t('sc.faq_reset')}
              </label>
            ) : null}
          </div>
        ) : null}

        {page === 'header' ? (
          <div className="a-card">
            <h2>{t('sc.header_links')}</h2>
            <LinkRepeater
              name="links"
              legend={t('sc.header_links')}
              hint={t('sc.links_hint')}
              links={content.headerLinks ? linkRows(content.headerLinks) : routeRows(HEADER_ROUTES)}
              custom={content.headerLinks !== null}
            />
            {content.headerLinks ? (
              <label className="a-check">
                <input type="checkbox" name="links_reset" /> {t('sc.links_reset')}
              </label>
            ) : null}
            <Field label={t('sc.cta_href')} hint={t('sc.cta_href_hint')} htmlFor="cta">
              <TextInput
                id="cta"
                name="ctaHref"
                dir="ltr"
                defaultValue={content.ctaHref}
                placeholder="/services"
              />
            </Field>
          </div>
        ) : null}

        {page === 'footer' ? (
          <div className="a-card">
            <h2>{t('sc.footer_links')}</h2>
            <LinkRepeater
              name="quick"
              legend={t('sc.footer_quick')}
              hint={t('sc.links_hint')}
              links={
                content.footerQuick ? linkRows(content.footerQuick) : routeRows(FOOTER_QUICK_ROUTES)
              }
              custom={content.footerQuick !== null}
            />
            {content.footerQuick ? (
              <label className="a-check">
                <input type="checkbox" name="quick_reset" /> {t('sc.links_reset')}
              </label>
            ) : null}
            <LinkRepeater
              name="info"
              legend={t('sc.footer_info')}
              links={content.footerInfo ? linkRows(content.footerInfo) : routeRows(INFO_ROUTES)}
              custom={content.footerInfo !== null}
            />
            {content.footerInfo ? (
              <label className="a-check">
                <input type="checkbox" name="info_reset" /> {t('sc.links_reset')}
              </label>
            ) : null}
            <h3>{t('sc.social')}</h3>
            <p className="a-hint">{t('sc.social_hint')}</p>
            <div className="a-row">
              {SOCIAL_NETWORKS.map((network) => (
                <Field key={network} label={t(`sc.social_${network}`)} htmlFor={`s-${network}`}>
                  <TextInput
                    id={`s-${network}`}
                    name={`social__${network}`}
                    dir="ltr"
                    type="url"
                    placeholder="https://"
                    defaultValue={content.social[network] ?? ''}
                  />
                </Field>
              ))}
            </div>
          </div>
        ) : null}

        {def.sections.map((section, index) => {
          const changed = section.texts.filter((key) => overrides[key]).length
          const hiddenNow = (own.hidden ?? []).includes(section.id)
          return (
            <details className="a-card hc-sec" key={section.id} open={index === 0}>
              <summary>
                <b>{t(`sc.sec_${section.id}`)}</b>
                {hiddenNow ? <span className="a-pill warn">{t('hc.hidden_pill')}</span> : null}
                {changed > 0 ? (
                  <span className="a-pill info">{t('hc.changed_pill', { n: changed })}</span>
                ) : null}
              </summary>
              {section.hideable ? (
                <label className="a-check">
                  <input type="checkbox" name={`show__${section.id}`} defaultChecked={!hiddenNow} />
                  {t('hc.show_section')}
                </label>
              ) : null}

              {section.texts.map((key) => (
                <fieldset className="a-fieldset" key={key}>
                  <legend>
                    {bundled('ar', key).slice(0, 70) || key}
                    <span className="a-hint" dir="ltr" style={{ marginInlineStart: 8 }}>
                      {key}
                    </span>
                  </legend>
                  <div className="a-l10n">
                    {ORDER.map((locale) => {
                      const id = `t__${key}__${locale}`
                      const props = {
                        id,
                        name: id,
                        lang: locale,
                        dir: localeConfig[locale].dir,
                        defaultValue: current(key, locale),
                        maxLength: 4000,
                      }
                      return (
                        <Field key={locale} label={localeConfig[locale].label} htmlFor={id}>
                          {isLong(key) ? (
                            <TextArea rows={3} {...props} />
                          ) : (
                            <TextInput {...props} />
                          )}
                        </Field>
                      )
                    })}
                  </div>
                </fieldset>
              ))}

              {(section.images ?? []).length > 0 ? (
                <div className="hc-images">
                  {(section.images ?? []).map((slot) => (
                    <div key={slot.id} className="hc-slot">
                      <MediaPicker
                        name={`img__${slot.id}`}
                        label={t('sc.slot', { name: slot.id })}
                        hint={t('hc.slot_hint')}
                        value={own.images?.[slot.id] || null}
                      />
                      {!own.images?.[slot.id] ? (
                        <div className="hc-fallback">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={slot.fallback} alt="" loading="lazy" />
                          <span className="a-hint">{t('hc.builtin_photo')}</span>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </details>
          )
        })}

        <div className="a-actions hc-save">
          <button className="a-btn primary" type="submit">
            {t('sc.save')}
          </button>
          <a className="a-btn ghost" href={preview} target="_blank" rel="noreferrer">
            {t('sc.preview')}
          </a>
        </div>
      </form>
    </>
  )
}
