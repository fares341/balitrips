import Link from 'next/link'

import { formatMoneyInput } from '@/lib/money-input'

import { adminHref } from '../../../_lib/admin-path'
import { getAdminI18n } from '../../../_lib/i18n'
import type { Option } from '../../../_lib/lookups'
import { Checkbox, Field, Select, TextInput } from '../../../_ui/field'
import { OptionChecklist } from '../../../_ui/select-field'
import { Pill } from '../../../_ui/table'
import { linkLibraryAddon, saveLibraryLink, unlinkLibraryAddon } from '../actions'

export interface LibraryItem {
  id: string
  name: string
  /** Library price, formatted. */
  price: string
  currency: string
  available: boolean
}

export interface LibraryLink {
  addonId: string
  priceMinor: number | null
  onlyPackages: string[]
  required: boolean
  sortOrder: number
}

/**
 * Extras from the shared library offered with this activity: each link has
 * an optional price for this activity, a "required" switch, a package
 * restriction and an order. Adding one picks from the library.
 */
export async function LibraryLinks({
  activityId,
  library,
  links,
  packages,
}: {
  activityId: string
  library: readonly LibraryItem[]
  links: readonly LibraryLink[]
  packages: readonly Option[]
}) {
  const { t } = await getAdminI18n()
  const byId = new Map(library.map((item) => [item.id, item]))
  const linked = new Set(links.map((link) => link.addonId))
  const free = library.filter((item) => !linked.has(item.id))

  const fields = (prefix: string, item: LibraryItem, link: LibraryLink | null) => (
    <>
      <div className="a-row">
        <Field
          label={t('ae.lib_price_override')}
          htmlFor={`${prefix}_price`}
          hint={t('ae.lib_price_override_hint', { price: item.price })}
        >
          <TextInput
            id={`${prefix}_price`}
            name="priceMinor"
            inputMode="decimal"
            dir="ltr"
            defaultValue={
              link?.priceMinor === null || link?.priceMinor === undefined
                ? ''
                : formatMoneyInput(link.priceMinor, item.currency)
            }
          />
        </Field>
        <Field label={t('ae.lib_order')} htmlFor={`${prefix}_order`}>
          <TextInput
            id={`${prefix}_order`}
            name="sortOrder"
            inputMode="numeric"
            dir="ltr"
            defaultValue={String(link?.sortOrder ?? 0)}
          />
        </Field>
      </div>
      <Checkbox
        name="required"
        label={t('ae.lib_required')}
        defaultChecked={link?.required ?? false}
      />
      {packages.length > 0 ? (
        <OptionChecklist
          name="onlyPackages"
          label={t('ae.lib_only_packages')}
          options={packages}
          values={link?.onlyPackages ?? []}
          hint={t('ae.lib_only_packages_hint')}
        />
      ) : null}
    </>
  )

  return (
    <div className="a-card">
      <div className="a-card-head">
        <h2>{t('ae.lib_title')}</h2>
        <Link className="a-btn ghost small" href={adminHref('/addons')}>
          {t('ae.lib_manage')}
        </Link>
      </div>
      <p className="a-hint">{t('ae.lib_hint')}</p>

      <div className="a-stack">
        {links.map((link) => {
          const item = byId.get(link.addonId)
          if (!item) return null
          return (
            <form
              key={link.addonId}
              className="a-day"
              action={saveLibraryLink.bind(null, activityId, link.addonId)}
            >
              <div className="a-day-head">
                <div className="a-day-no">
                  {item.name}{' '}
                  <span className="a-muted" dir="ltr">
                    {item.price}
                  </span>{' '}
                  {item.available ? null : <Pill tone="bad">{t('addons.off_pill')}</Pill>}
                </div>
                <div className="a-actions">
                  <button className="a-btn ghost small" type="submit">
                    {t('ae.lib_save')}
                  </button>
                  <button
                    className="a-btn danger small"
                    type="submit"
                    formAction={unlinkLibraryAddon.bind(null, activityId, link.addonId)}
                  >
                    {t('ae.lib_unlink')}
                  </button>
                </div>
              </div>
              {fields(`link_${link.addonId}`, item, link)}
            </form>
          )
        })}

        {library.length === 0 ? (
          <p className="a-hint">{t('ae.lib_none')}</p>
        ) : free.length === 0 ? (
          <p className="a-hint">{t('ae.lib_all_linked')}</p>
        ) : (
          <form className="a-day" action={linkLibraryAddon.bind(null, activityId)}>
            <div className="a-day-head">
              <div className="a-day-no">{t('ae.lib_link')}</div>
              <div className="a-actions">
                <button className="a-btn small" type="submit">
                  {t('ae.lib_link')}
                </button>
              </div>
            </div>
            <Field label={t('ae.lib_choose')} htmlFor="lib_new_addon">
              <Select id="lib_new_addon" name="addonId" defaultValue="" required>
                <option value="" disabled>
                  {t('ae.lib_choose')}
                </option>
                {free.map((item) => (
                  <option key={item.id} value={item.id}>
                    {`${item.name} — ${item.price}`}
                  </option>
                ))}
              </Select>
            </Field>
            {free[0] ? fields('lib_new', free[0], null) : null}
          </form>
        )}
      </div>
    </div>
  )
}
