import { redirect } from 'next/navigation'

import { adminHref } from '../../_lib/admin-path'

/** Moved to «السيارات والسائق» (Studio v2). Kept so old links and bookmarks still work. */
export default function MovedPage(): never {
  redirect(`${adminHref('/vehicles')}#fleet`)
}
