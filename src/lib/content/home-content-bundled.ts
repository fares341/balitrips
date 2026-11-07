import ar from '../../../messages/ar.json'
import en from '../../../messages/en.json'
import id from '../../../messages/id.json'

/** The shipped message bundles (server only: Studio compares edits against them). */
export const BUNDLED_MESSAGES: Record<'en' | 'ar' | 'id', Record<string, unknown>> = {
  en: en as Record<string, unknown>,
  ar: ar as Record<string, unknown>,
  id: id as Record<string, unknown>,
}
