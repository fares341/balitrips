'use server'

import { redirect } from 'next/navigation'

import { adminHref } from '../../_lib/admin-path'
import { getAdminI18n } from '../../_lib/i18n'
import { errorMessage, isRedirectError, withOutcome } from '../../_lib/result'
import { requireCapability } from '../../_lib/session'
import {
  resetSiteText,
  revalidateSiteTexts,
  textsFromForm,
  writeSiteTexts,
} from '../../_lib/site-texts'

const LIST = adminHref('/translations')

type Outcome = { ok: string } | { err: string }

/** Back to the same filtered page (only Studio's own list URL is accepted). */
function backTo(form: FormData): string {
  const back = form.get('back')
  return typeof back === 'string' && back.startsWith(LIST) ? back : LIST
}

/**
 * Save one message key in ar / en / id. Languages equal to the bundled text
 * (or blank) are not stored, so they keep following the shipped copy.
 */
export async function saveSiteText(key: string, form: FormData): Promise<void> {
  const session = await requireCapability('translations.write')
  const { t } = await getAdminI18n()
  let outcome: Outcome
  try {
    const changed = await writeSiteTexts(textsFromForm(form, [key]), session, t)
    outcome = { ok: changed > 0 ? t('tr2.ok_saved', { key }) : t('tr2.ok_nothing') }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  revalidateSiteTexts()
  redirect(withOutcome(backTo(form), outcome))
}

/** Reset one key to the bundled text in every language. */
export async function resetSiteTextAction(key: string, form: FormData): Promise<void> {
  const session = await requireCapability('translations.write')
  const { t } = await getAdminI18n()
  let outcome: Outcome
  try {
    outcome = (await resetSiteText(key, session))
      ? { ok: t('tr2.ok_reset', { key }) }
      : { ok: t('tr2.ok_nothing') }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  revalidateSiteTexts()
  redirect(withOutcome(backTo(form), outcome))
}
