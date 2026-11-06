/**
 * Studio → itinerary editor: the «فعاليات جدولي» buyer page (itineraries
 * phase 3) — this itinerary's «احجز كل الفعاليات» percent and a preview link.
 * Staff open the page in preview mode (no booking); customers need a purchase.
 */

import { linkedBookableActivities } from '@/lib/itineraries/bundle-server'

import type { Translate } from '../../../_i18n'
import { Field, TextInput } from '../../../_ui/field'
import { saveBuyerPageSettings } from '../phase1-actions'

export async function BuyerPageCard({
  itinerary,
  globalPct,
  locale,
  t,
}: {
  itinerary: { id: string; slug: string; bundleDiscountPct: number | null }
  globalPct: number
  /** Studio language: the preview opens in it. */
  locale: string
  t: Translate
}) {
  const linked = await linkedBookableActivities(itinerary.id)
  return (
    <form className="a-form" action={saveBuyerPageSettings.bind(null, itinerary.id)}>
      <div className="a-card">
        <h2>{t('ip1.buyer_t')}</h2>
        <p className="a-hint">{t('ip1.buyer_hint')}</p>
        <p className="a-hint">{t('ip1.buyer_n_acts', { n: linked.length })}</p>
        <div className="a-row">
          <Field
            label={t('ip1.buyer_pct')}
            htmlFor="bundleDiscountPct"
            hint={t('ip1.buyer_pct_hint', { pct: globalPct })}
          >
            <TextInput
              id="bundleDiscountPct"
              name="bundleDiscountPct"
              inputMode="numeric"
              dir="ltr"
              placeholder={String(globalPct)}
              defaultValue={
                itinerary.bundleDiscountPct === null ? '' : String(itinerary.bundleDiscountPct)
              }
            />
          </Field>
        </div>
        <div className="a-actions">
          <button className="a-btn" type="submit">
            {t('itineraries.save')}
          </button>
          <a
            className="a-btn ghost"
            href={`/${locale === 'en' ? 'en' : 'ar'}/account/itineraries/${itinerary.slug}/activities`}
            target="_blank"
            rel="noopener"
          >
            {t('ip1.buyer_preview')}
          </a>
        </div>
      </div>
    </form>
  )
}
