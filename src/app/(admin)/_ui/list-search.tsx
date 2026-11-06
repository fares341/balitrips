import Link from 'next/link'

import { uiI18n } from './i18n-server'

/**
 * The search box of a Studio list (`?q=`). A new search starts at page 1;
 * the list's other filters are carried along as hidden fields.
 */
export async function ListSearch({
  basePath,
  searchParams,
  placeholder,
}: {
  basePath: string
  searchParams: Record<string, string | string[] | undefined>
  placeholder?: string
}) {
  const { t } = await uiI18n()
  const q = typeof searchParams.q === 'string' ? searchParams.q : ''
  const keep = Object.entries(searchParams).filter(
    ([key, value]) =>
      key !== 'q' &&
      key !== 'page' &&
      key !== 'ok' &&
      key !== 'err' &&
      typeof value === 'string' &&
      value !== '',
  ) as [string, string][]
  return (
    <form className="a-card a-osearch a-listsearch" method="get" action={basePath} role="search">
      {keep.map(([key, value]) => (
        <input key={key} type="hidden" name={key} value={value} />
      ))}
      <label className="a-visually-hidden" htmlFor="list-q">
        {t('list.search')}
      </label>
      <input
        className="a-input"
        id="list-q"
        name="q"
        type="search"
        defaultValue={q}
        placeholder={placeholder ?? t('list.search_placeholder')}
      />
      <button className="a-btn" type="submit">
        {t('list.search')}
      </button>
      {q ? (
        <Link className="a-btn ghost" href={basePath}>
          {t('list.clear')}
        </Link>
      ) : null}
    </form>
  )
}
