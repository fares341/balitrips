import { HIDEABLE_SECTIONS, HOME_SECTIONS } from '@/lib/content/home-content'
import { BUNDLED_MESSAGES } from '@/lib/content/home-content-bundled'
import { localeConfig } from '@/i18n/config'

import { adminHref } from '../../_lib/admin-path'
import { getAdminI18n } from '../../_lib/i18n'
import { readSetting } from '../../_lib/settings'
import { requireCapability } from '../../_lib/session'
import { loadSiteTexts } from '../../_lib/site-texts'
import { Field, TextArea, TextInput } from '../../_ui/field'
import { Flash } from '../../_ui/flash'
import { MediaPicker } from '../../_ui/media-picker'
import { PageHead } from '../../_ui/shell'
import { saveHomeContent } from '../config/actions'

export const dynamic = 'force-dynamic'

/** Arabic first: the owner writes Arabic, then English, then Indonesian. */
const ORDER = ['ar', 'en', 'id'] as const

/** Keys whose text is long enough for a textarea. */
function isLong(key: string): boolean {
  return /(_lede|_body|_d|hero_lede)$/.test(key)
}

/**
 * «الصفحة الرئيسية» — every text and photo on the public home page, per
 * section, plus show/hide. Fields start with the text the site shows today;
 * leaving one as it is (or clearing it) keeps the built-in text.
 */
export default async function HomeContentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireCapability('config.write')
  const { t } = await getAdminI18n()
  const params = await searchParams
  const content = await readSetting('homeContent')
  const overrides = await loadSiteTexts(HOME_SECTIONS.flatMap((section) => section.texts))
  const edited = (key: string) => Boolean(overrides[key] ?? content.texts[key])

  const current = (key: string, locale: (typeof ORDER)[number]): string =>
    overrides[key]?.[locale] ??
    content.texts[key]?.[locale] ??
    String(BUNDLED_MESSAGES[locale][key] ?? '')

  return (
    <>
      <PageHead
        title={t('hc.title')}
        description={t('hc.description')}
        actions={
          <a className="a-btn ghost" href="/" target="_blank" rel="noreferrer">
            {t('hc.view_site')}
          </a>
        }
      />
      <Flash searchParams={params} />

      <form className="a-form" action={saveHomeContent}>
        {HOME_SECTIONS.map((section, index) => {
          const hideable = HIDEABLE_SECTIONS.includes(section.id)
          const changed = section.texts.filter(edited).length
          return (
            <details className="a-card hc-sec" key={section.id} open={index === 0}>
              <summary>
                <b>{t(`hc.sec_${section.id}`)}</b>
                {content.hidden.includes(section.id) ? (
                  <span className="a-pill warn">{t('hc.hidden_pill')}</span>
                ) : null}
                {changed > 0 ? (
                  <span className="a-pill info">{t('hc.changed_pill', { n: changed })}</span>
                ) : null}
              </summary>
              <p className="a-hint">{t(`hc.sec_${section.id}_hint`)}</p>

              {hideable ? (
                <label className="a-check">
                  <input
                    type="checkbox"
                    name={`show__${section.id}`}
                    defaultChecked={!content.hidden.includes(section.id)}
                  />
                  {t('hc.show_section')}
                </label>
              ) : null}

              {section.texts.map((key) => (
                <fieldset className="a-fieldset" key={key}>
                  <legend>
                    {String(BUNDLED_MESSAGES.ar[key] ?? key).slice(0, 70)}
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
                        maxLength: 2000,
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

              {section.images.length > 0 ? (
                <div className="hc-images">
                  {section.images.map((slot) => (
                    <div key={slot.id} className="hc-slot">
                      <MediaPicker
                        name={`img__${slot.id}`}
                        label={
                          slot.labelKey === 'hc.slot_about'
                            ? t('hc.slot_about', { name: slot.id.replace('about_', '') })
                            : t(slot.labelKey)
                        }
                        hint={t('hc.slot_hint')}
                        value={content.images[slot.id] || null}
                      />
                      {!content.images[slot.id] ? (
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
            {t('hc.save')}
          </button>
          <a className="a-btn ghost" href={adminHref('/media')}>
            {t('nav.media')}
          </a>
        </div>
      </form>
    </>
  )
}
