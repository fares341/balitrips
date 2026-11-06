/**
 * Itineraries phase 1 — editor cards (corrected spec §3.1 / §5):
 * the public-page preview, day teasers, and the versioned PDF uploads.
 * Server components; every form posts to `../phase1-actions`.
 */

import { isLocale, localeConfig, locales } from '@/i18n/config'
import { pick } from '@/lib/content/localize'
import type { PdfStatus } from '@/lib/itineraries/publish-gate'

import type { Translate } from '../../../_i18n'
import { Checkbox, Field, LocalizedField, TextInput } from '../../../_ui/field'
import { FaqRepeater, type FaqRepeaterEntry } from '../../../_ui/faq-repeater'
import { OptionField } from '../../../_ui/select-field'
import { Pill } from '../../../_ui/table'
import { When } from '../../../_ui/table'
import {
  restoreItineraryPdfVersion,
  saveDayTeasers,
  saveItineraryPreview,
  uploadItineraryPdfVersion,
} from '../phase1-actions'
import { PREVIEW_STAT_ICONS, PREVIEW_STAT_ROWS } from '../phase1-shared'
import { removeItineraryPdf } from '../actions'
import { ConfirmSubmit } from '../../../_ui/confirm-submit'

type Localized = Partial<Record<string, string>> | null | undefined
type Option = { value: string; label: string }

export function PdfStatusPill({ status, t }: { status: PdfStatus; t: Translate }) {
  if (status.kind === 'uploaded')
    return <Pill tone="good">{t('ip1.pdf_uploaded_v', { version: status.fileVersion })}</Pill>
  if (status.kind === 'generated')
    return (
      <Pill tone="neutral">
        {status.rendered ? t('ip1.pdf_generated') : t('ip1.pdf_generated_pending')}
      </Pill>
    )
  return <Pill tone="bad">{t('ip1.pdf_none')}</Pill>
}

export function PreviewCard({
  itinerary,
  mediaList,
  t,
}: {
  itinerary: {
    id: string
    previewStats: { icon: string; value: string; label: Localized }[] | null
    galleryImageIds: string[] | null
    galleryCaptions: Record<string, Localized> | null
    teaserDaysVisible: number
    isPopular: boolean
    seoTitle: Localized
    seoDescription: Localized
    faq?: unknown[] | null
    slug: string
  }
  mediaList: Option[]
  t: Translate
}) {
  const stats = itinerary.previewStats ?? []
  const gallery = itinerary.galleryImageIds ?? []
  const mediaLabel = new Map(mediaList.map((m) => [m.value, m.label]))
  return (
    <form className="a-form" action={saveItineraryPreview.bind(null, itinerary.id)}>
      <div className="a-card">
        <h2>{t('ip1.preview_t')}</h2>
        <p className="a-hint">{t('ip1.preview_hint')}</p>
        <div className="a-row">
          <Field
            label={t('ip1.teaser_days_visible')}
            htmlFor="teaserDaysVisible"
            hint={t('ip1.teaser_days_hint')}
          >
            <TextInput
              id="teaserDaysVisible"
              name="teaserDaysVisible"
              inputMode="numeric"
              dir="ltr"
              defaultValue={String(itinerary.teaserDaysVisible)}
            />
          </Field>
          <Checkbox
            name="isPopular"
            label={t('ip1.is_popular')}
            defaultChecked={itinerary.isPopular}
            hint={t('ip1.is_popular_hint')}
          />
        </div>

        <h3>{t('ip1.stats_t')}</h3>
        <p className="a-hint">{t('ip1.stats_hint')}</p>
        {Array.from({ length: PREVIEW_STAT_ROWS }, (_, i) => {
          const row = stats[i]
          return (
            <div className="a-row a-inc-row" key={i}>
              <Field label={t('ip1.stat_value')} htmlFor={`stat${i}Value`}>
                <TextInput
                  id={`stat${i}Value`}
                  name={`stat${i}Value`}
                  defaultValue={row?.value ?? ''}
                  maxLength={24}
                />
              </Field>
              <Field label={t('ip1.stat_icon')} htmlFor={`stat${i}Icon`}>
                <select
                  className="a-select"
                  id={`stat${i}Icon`}
                  name={`stat${i}Icon`}
                  defaultValue={row?.icon ?? 'pin'}
                >
                  {PREVIEW_STAT_ICONS.map((icon) => (
                    <option key={icon} value={icon}>
                      {t(`ip1.icon_${icon}`)}
                    </option>
                  ))}
                </select>
              </Field>
              <LocalizedField
                name={`stat${i}Label`}
                label={t('ip1.stat_label')}
                value={row?.label as never}
              />
            </div>
          )
        })}

        <h3>{t('ip1.gallery_t')}</h3>
        <p className="a-hint">{t('ip1.gallery_hint')}</p>
        {gallery.length === 0 ? (
          <p className="a-hint">{t('ip1.gallery_empty')}</p>
        ) : (
          gallery.map((mediaId, index) => (
            <div className="a-row a-inc-row" key={mediaId}>
              <Field label={t('ip1.gallery_order')} htmlFor={`ord_${mediaId}`}>
                <TextInput
                  id={`ord_${mediaId}`}
                  name={`ord_${mediaId}`}
                  inputMode="numeric"
                  dir="ltr"
                  defaultValue={String(index + 1)}
                  style={{ maxWidth: 80 }}
                />
              </Field>
              <span className="a-muted">{mediaLabel.get(mediaId) ?? mediaId}</span>
              <LocalizedField
                name={`cap_${mediaId}`}
                label={t('ip1.gallery_caption')}
                value={(itinerary.galleryCaptions?.[mediaId] ?? null) as never}
              />
            </div>
          ))
        )}

        <h3>{t('ip1.faq_t')}</h3>
        <p className="a-hint">{t('ip1.faq_hint')}</p>
        <FaqRepeater entries={(itinerary.faq ?? []) as unknown as FaqRepeaterEntry[]} />

        <h3>{t('ip1.seo_t')}</h3>
        <p className="a-hint">{t('ip1.seo_hint', { path: `/itineraries/${itinerary.slug}` })}</p>
        <LocalizedField
          name="seoTitle"
          label={t('ip1.seo_title')}
          value={itinerary.seoTitle as never}
        />
        <LocalizedField
          name="seoDescription"
          label={t('ip1.seo_description')}
          value={itinerary.seoDescription as never}
          rows={3}
        />
        <div className="a-actions" style={{ marginBlockStart: 12 }}>
          <button className="a-btn" type="submit">
            {t('ip1.save_preview')}
          </button>
        </div>
      </div>
    </form>
  )
}

export function DayTeasersCard({
  itineraryId,
  days,
  teaserDaysVisible,
  mediaList,
  t,
}: {
  itineraryId: string
  days: { id: string; dayNumber: number; teaserImageId: string | null; teaserMood: Localized }[]
  teaserDaysVisible: number
  mediaList: Option[]
  t: Translate
}) {
  return (
    <form className="a-card" action={saveDayTeasers.bind(null, itineraryId)}>
      <h2>{t('ip1.teasers_t')}</h2>
      <p className="a-hint">{t('ip1.teasers_hint', { count: teaserDaysVisible })}</p>
      {days.length === 0 ? <p className="a-hint">{t('ip1.teasers_empty')}</p> : null}
      {days.map((day) => (
        <div className="a-row a-inc-row" key={day.id}>
          <input type="hidden" name="teaserDay" value={day.id} />
          <b>
            {t('ip1.day_n', { n: day.dayNumber })}
            {day.dayNumber <= teaserDaysVisible ? ` · ${t('ip1.visible')}` : ''}
          </b>
          <OptionField
            name={`teaserImage_${day.id}`}
            label={t('ip1.teaser_image')}
            options={mediaList}
            value={day.teaserImageId}
          />
          <LocalizedField
            name={`teaserMood_${day.id}`}
            label={t('ip1.teaser_mood')}
            value={day.teaserMood as never}
            hint={t('ip1.teaser_mood_hint')}
          />
        </div>
      ))}
      {days.length > 0 ? (
        <div className="a-actions">
          <button className="a-btn" type="submit">
            {t('ip1.save_teasers')}
          </button>
        </div>
      ) : null}
    </form>
  )
}

export interface PdfDocRow {
  id: string
  locale: string
  source: string
  fileVersion: number
  version: number
  isCurrent: boolean
  bytes: number | null
  downloadFilename: string | null
  notifyBuyers: boolean
  createdAt: Date
}

export function PdfCard({
  itinerary,
  docs,
  statusByLocale,
  maxUploadMb,
  t,
  uiLocale,
}: {
  itinerary: { id: string; slug: string; name: Localized; uploadedPdfKeys: Localized }
  docs: PdfDocRow[]
  statusByLocale: Record<string, PdfStatus>
  maxUploadMb: number
  t: Translate
  uiLocale: string
}) {
  const uploads = docs.filter((d) => d.source === 'uploaded')
  return (
    <div className="a-card">
      <h2>{t('itineraries.section_pdf')}</h2>
      <p className="a-hint">{t('ip1.pdf_hint')}</p>
      <ul>
        {locales.map((locale) => {
          const status = statusByLocale[locale] ?? { kind: 'none' as const }
          return (
            <li key={locale}>
              {localeConfig[locale].label}: <PdfStatusPill status={status} t={t} />
              {locale === 'ar' ? (
                <span className="a-muted"> · {t('ip1.pdf_required_ar')}</span>
              ) : null}
              {itinerary.uploadedPdfKeys?.[locale] ? (
                <form
                  className="a-inline-form"
                  action={removeItineraryPdf.bind(null, itinerary.id)}
                >
                  <input type="hidden" name="locale" value={locale} />{' '}
                  <ConfirmSubmit
                    className="a-btn ghost small"
                    label={t('ip1.pdf_back_to_generated')}
                    title={t('confirm.remove_title')}
                  />
                </form>
              ) : null}
            </li>
          )
        })}
      </ul>

      <form
        className="a-row"
        action={uploadItineraryPdfVersion.bind(null, itinerary.id)}
        style={{ marginBlockStart: 12 }}
      >
        <Field label={t('itineraries.pdf_language')} htmlFor="pdf-locale">
          <select className="a-select" id="pdf-locale" name="locale" defaultValue="ar">
            {locales.map((locale) => (
              <option key={locale} value={locale}>
                {localeConfig[locale].label}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label={t('itineraries.pdf_file')}
          htmlFor="pdf-file"
          hint={t('ip1.pdf_limit', { mb: maxUploadMb })}
        >
          <input
            className="a-input"
            id="pdf-file"
            name="file"
            type="file"
            accept="application/pdf"
            required
          />
        </Field>
        <Field
          label={t('ip1.download_filename')}
          htmlFor="pdf-name"
          hint={t('ip1.download_filename_hint')}
        >
          <TextInput
            id="pdf-name"
            name="downloadFilename"
            maxLength={150}
            placeholder={`${pick(itinerary.name as never, isLocale(uiLocale) ? uiLocale : 'ar', itinerary.slug)}.pdf`}
          />
        </Field>
        <Checkbox
          name="notifyBuyers"
          label={t('ip1.notify_buyers')}
          hint={t('ip1.notify_buyers_hint')}
        />
        <div className="a-actions">
          <button className="a-btn accent" type="submit">
            {t('itineraries.pdf_upload')}
          </button>
        </div>
      </form>

      <h3>{t('ip1.history_t')}</h3>
      {uploads.length === 0 ? (
        <p className="a-hint">{t('ip1.history_empty')}</p>
      ) : (
        <div className="a-table-wrap">
          <table className="a-table">
            <thead>
              <tr>
                <th>{t('itineraries.pdf_language')}</th>
                <th>{t('ip1.col_version')}</th>
                <th>{t('ip1.download_filename')}</th>
                <th className="num">{t('ip1.col_size')}</th>
                <th>{t('ip1.col_uploaded')}</th>
                <th>{t('common.status')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {uploads.map((doc) => (
                <tr key={doc.id}>
                  <td>
                    {localeConfig[doc.locale as keyof typeof localeConfig]?.label ?? doc.locale}
                  </td>
                  <td>v{doc.fileVersion}</td>
                  <td dir="auto">{doc.downloadFilename ?? '—'}</td>
                  <td className="num">
                    {doc.bytes ? `${(doc.bytes / 1024 / 1024).toFixed(1)} MB` : '—'}
                  </td>
                  <td>
                    <When value={doc.createdAt} />
                  </td>
                  <td>
                    {doc.isCurrent ? (
                      <Pill tone="good">{t('ip1.current')}</Pill>
                    ) : (
                      <Pill tone="neutral">{t('ip1.archived')}</Pill>
                    )}
                  </td>
                  <td>
                    {doc.isCurrent ? null : (
                      <form
                        className="a-inline-form"
                        action={restoreItineraryPdfVersion.bind(null, itinerary.id)}
                      >
                        <input type="hidden" name="docId" value={doc.id} />
                        <button className="a-btn ghost small" type="submit">
                          {t('ip1.restore')}
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
