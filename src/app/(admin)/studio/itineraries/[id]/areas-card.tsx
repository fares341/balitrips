/**
 * «المناطق التي يغطيها الجدول» (owner, Nov 2026): an ordered list of region
 * keys with nights, shown on the public page as «سمينياك · أوبود · أولواتو».
 * Nights appear only when «إظهار عدد الليالي» is ticked (off by default).
 * Plain form rows (no client JS): row order = display order.
 */

import { asc } from 'drizzle-orm'

import { db } from '@/db'
import { regions } from '@/db/schema'
import { pick } from '@/lib/content/localize'
import { MAX_AREAS, type ItineraryAreas } from '@/lib/itineraries/areas'
import { AREA_LABELS } from '@/lib/map/area-labels'

import type { Translate } from '../../../_i18n'
import { getAdminLocale } from '../../../_lib/i18n'
import { Checkbox, Field, Select, TextInput } from '../../../_ui/field'

export interface AreaChoice {
  key: string
  label: string
}

/** Region keys from the taxonomy, plus the map's area labels not in it. */
export async function areaChoices(): Promise<AreaChoice[]> {
  const locale = await getAdminLocale()
  const rows = await db
    .select({ key: regions.key, label: regions.label })
    .from(regions)
    .orderBy(asc(regions.sortOrder), asc(regions.key))
  const out: AreaChoice[] = rows.map((row) => ({
    key: row.key,
    label: `${pick(row.label, locale, row.key)} (${row.key})`,
  }))
  for (const area of AREA_LABELS) {
    if (!out.some((one) => one.key === area.key))
      out.push({
        key: area.key,
        label: `${area.name[locale === 'ar' ? 'ar' : 'en']} (${area.key})`,
      })
  }
  return out
}

export function AreasCard({
  action,
  areas,
  choices,
  t,
}: {
  action: (form: FormData) => Promise<void>
  areas: ItineraryAreas
  choices: readonly AreaChoice[]
  t: Translate
}) {
  const known = new Set(choices.map((one) => one.key))
  const options = [
    ...choices,
    // A stored key that is no longer in the taxonomy stays selectable.
    ...areas.items
      .filter((item) => !known.has(item.key))
      .map((item) => ({ key: item.key, label: item.key })),
  ]
  return (
    <form className="a-form" action={action}>
      <div className="a-card">
        <h2>{t('ie.areas_t')}</h2>
        <p className="a-hint">{t('ie.areas_hint')}</p>
        {Array.from({ length: MAX_AREAS }, (_, i) => {
          const row = areas.items[i]
          return (
            <div className="a-row" key={i}>
              <Field label={t('ie.area_n', { n: i + 1 })} htmlFor={`area${i}Key`}>
                <Select id={`area${i}Key`} name={`area${i}Key`} defaultValue={row?.key ?? ''}>
                  <option value="">—</option>
                  {options.map((one) => (
                    <option key={one.key} value={one.key}>
                      {one.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t('ie.area_nights')} htmlFor={`area${i}Nights`}>
                <TextInput
                  id={`area${i}Nights`}
                  name={`area${i}Nights`}
                  inputMode="numeric"
                  dir="ltr"
                  defaultValue={row?.nights != null ? String(row.nights) : ''}
                />
              </Field>
            </div>
          )
        })}
        <Checkbox
          name="areasShowNights"
          label={t('ie.areas_show_nights')}
          defaultChecked={areas.showNights}
        />
      </div>
      <div className="a-actions ie-save">
        <button className="a-btn" type="submit">
          {t('ie.save')}
        </button>
      </div>
    </form>
  )
}
