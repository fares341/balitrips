'use client'

import { createContext, useContext, useMemo } from 'react'

import type { Translate } from '../_i18n'
import { format, intlLocale, type AdminLocale, type Messages } from '../_i18n/types'

interface AdminI18nValue {
  locale: AdminLocale
  dir: 'rtl' | 'ltr'
  intl: string
  t: Translate
}

const Context = createContext<AdminI18nValue | null>(null)

/** Mounted once in the admin root layout with the active language's strings. */
export function AdminI18nProvider({
  locale,
  messages,
  children,
}: {
  locale: AdminLocale
  messages: Messages
  children: React.ReactNode
}) {
  const value = useMemo<AdminI18nValue>(
    () => ({
      locale,
      dir: locale === 'ar' ? 'rtl' : 'ltr',
      intl: intlLocale(locale),
      t: (key, vars) => format(messages[key] ?? key, vars),
    }),
    [locale, messages],
  )
  return <Context.Provider value={value}>{children}</Context.Provider>
}

/** Client components: `const { t } = useAdminT()`. */
export function useAdminT(): AdminI18nValue {
  const value = useContext(Context)
  if (value === null) throw new Error('useAdminT outside AdminI18nProvider')
  return value
}
