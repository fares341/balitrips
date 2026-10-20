import { secretHints } from '@/lib/analytics/secrets'
import { readMarketingSettings } from '@/lib/analytics/settings'

import { requireCapability } from '../../_lib/session'
import { getAdminI18n } from '../../_lib/i18n'
import { Checkbox, Field } from '../../_ui/field'
import { Flash } from '../../_ui/flash'
import { PageHead } from '../../_ui/shell'
import { saveMarketingSettings } from './actions'
import { CampaignBuilder } from './campaign-builder'

import '../../_ui/reports/reports.css'

export const dynamic = 'force-dynamic'

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://balitrips.example').replace(
  /\/+$/,
  '',
)

/**
 * التسويق والتتبع — Marketing & tracking.
 *
 * Every tool is OFF until switched on here, and even then it only loads for
 * a visitor who accepted the matching cookies in the banner. Server tokens
 * are stored encrypted and never shown again.
 */
export default async function MarketingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireCapability('config.write')
  const query = await searchParams
  const { t } = await getAdminI18n()
  const [settings, hints] = await Promise.all([readMarketingSettings(), secretHints()])

  const tokenField = (name: 'metaCapiToken' | 'tiktokEventsToken', hint: string | undefined) => (
    <div className="a-field">
      <label htmlFor={name}>{t(`mk.${name}`)}</label>
      <input
        id={name}
        name={name}
        className="a-input"
        type="password"
        autoComplete="off"
        dir="ltr"
        placeholder={hint ? t('mk.token_saved', { hint }) : t('mk.token_empty')}
      />
      <span className="a-hint">{t('mk.token_hint')}</span>
      {hint ? (
        <label className="a-check">
          <input type="checkbox" name={`${name}Remove`} />
          {t('mk.token_remove')}
        </label>
      ) : null}
    </div>
  )

  return (
    <>
      <PageHead title={t('mk.title')} description={t('mk.description')} />
      <Flash searchParams={query} />

      <div className="a-card">
        <h2>{t('mk.how_title')}</h2>
        <ul className="a-hint">
          <li>{t('mk.how_1')}</li>
          <li>{t('mk.how_2')}</li>
          <li>{t('mk.how_3')}</li>
          <li>{t('mk.how_4')}</li>
        </ul>
      </div>

      <form className="a-form" action={saveMarketingSettings}>
        <div className="a-card">
          <h2>{t('mk.ga4_title')}</h2>
          <Checkbox
            name="ga4Enabled"
            label={t('mk.enable')}
            defaultChecked={settings.ga4Enabled}
            hint={t('mk.ga4_hint')}
          />
          <Field label={t('mk.field_ga4Id')} htmlFor="ga4Id" hint="G-XXXXXXXXXX">
            <input
              id="ga4Id"
              name="ga4Id"
              className="a-input"
              dir="ltr"
              defaultValue={settings.ga4Id}
            />
          </Field>
        </div>

        <div className="a-card">
          <h2>{t('mk.gtm_title')}</h2>
          <Checkbox
            name="gtmEnabled"
            label={t('mk.enable')}
            defaultChecked={settings.gtmEnabled}
            hint={t('mk.gtm_hint')}
          />
          <Field label={t('mk.field_gtmId')} htmlFor="gtmId" hint="GTM-XXXXXXX">
            <input
              id="gtmId"
              name="gtmId"
              className="a-input"
              dir="ltr"
              defaultValue={settings.gtmId}
            />
          </Field>
        </div>

        <div className="a-card">
          <h2>{t('mk.meta_title')}</h2>
          <Checkbox
            name="metaEnabled"
            label={t('mk.enable')}
            defaultChecked={settings.metaEnabled}
            hint={t('mk.meta_hint')}
          />
          <Field label={t('mk.field_metaPixelId')} htmlFor="metaPixelId">
            <input
              id="metaPixelId"
              name="metaPixelId"
              className="a-input"
              dir="ltr"
              inputMode="numeric"
              defaultValue={settings.metaPixelId}
            />
          </Field>
          <Checkbox
            name="metaCapiEnabled"
            label={t('mk.capi_enable')}
            defaultChecked={settings.metaCapiEnabled}
            hint={t('mk.capi_hint')}
          />
          {tokenField('metaCapiToken', hints.meta_capi_token)}
        </div>

        <div className="a-card">
          <h2>{t('mk.tiktok_title')}</h2>
          <Checkbox
            name="tiktokEnabled"
            label={t('mk.enable')}
            defaultChecked={settings.tiktokEnabled}
            hint={t('mk.tiktok_hint')}
          />
          <Field label={t('mk.field_tiktokPixelId')} htmlFor="tiktokPixelId">
            <input
              id="tiktokPixelId"
              name="tiktokPixelId"
              className="a-input"
              dir="ltr"
              defaultValue={settings.tiktokPixelId}
            />
          </Field>
          <Checkbox
            name="tiktokEventsApiEnabled"
            label={t('mk.events_api_enable')}
            defaultChecked={settings.tiktokEventsApiEnabled}
            hint={t('mk.capi_hint')}
          />
          {tokenField('tiktokEventsToken', hints.tiktok_events_token)}
        </div>

        <div className="a-card">
          <h2>{t('mk.data_title')}</h2>
          <Field label={t('mk.retention')} htmlFor="retentionMonths" hint={t('mk.retention_hint')}>
            <input
              id="retentionMonths"
              name="retentionMonths"
              className="a-input"
              type="number"
              min={1}
              max={60}
              defaultValue={settings.retentionMonths}
            />
          </Field>
        </div>

        <div className="a-card">
          <h2>{t('mk.abandoned_title')}</h2>
          <Checkbox
            name="abandonedEnabled"
            label={t('mk.abandoned_enable')}
            defaultChecked={settings.abandonedEnabled}
            hint={t('mk.abandoned_hint')}
          />
          <Field label={t('mk.abandoned_hours')} htmlFor="abandonedAfterHours">
            <input
              id="abandonedAfterHours"
              name="abandonedAfterHours"
              className="a-input"
              type="number"
              min={1}
              max={168}
              defaultValue={settings.abandonedAfterHours}
            />
          </Field>
        </div>

        <div className="a-actions">
          <button className="a-btn" type="submit">
            {t('mk.save')}
          </button>
        </div>
      </form>

      <section className="a-card" aria-labelledby="mk-links">
        <h2 id="mk-links">{t('mk.links_title')}</h2>
        <p className="a-hint">{t('mk.links_hint')}</p>
        <CampaignBuilder
          siteUrl={SITE_URL}
          labels={{
            page: t('mk.link_page'),
            source: t('mk.link_source'),
            sourceHint: t('mk.link_source_hint'),
            medium: t('mk.link_medium'),
            mediumHint: t('mk.link_medium_hint'),
            campaign: t('mk.link_campaign'),
            campaignHint: t('mk.link_campaign_hint'),
            content: t('mk.link_content'),
            result: t('mk.link_result'),
            copy: t('mk.copy'),
            copied: t('mk.copied'),
            invalid: t('mk.link_invalid'),
          }}
        />
      </section>
    </>
  )
}
