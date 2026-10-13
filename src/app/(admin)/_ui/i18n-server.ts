import { cache } from 'react'

import { getAdminI18n } from '../_lib/i18n'

/**
 * `getAdminI18n()` memoised per request, for the shared server components in
 * `_ui/`. A list page renders `<When>` and pills once per row; this keeps
 * that to one cookie read and one translator per request.
 */
export const uiI18n = cache(getAdminI18n)
