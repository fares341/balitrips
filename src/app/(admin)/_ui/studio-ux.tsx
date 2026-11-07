'use client'

import { useEffect } from 'react'

import { useAdminT } from './i18n-provider'

/**
 * Studio-wide unsaved-changes guard. Any edit form (POST, not a search form)
 * that the owner typed into warns before the tab closes or a link is
 * followed; submitting it clears the warning. Opt out: `data-no-guard`.
 */
export function UnsavedGuard() {
  const { t } = useAdminT()

  useEffect(() => {
    const dirty = new Set<HTMLFormElement>()
    const tracked = (target: EventTarget | null): HTMLFormElement | null => {
      const el = target as HTMLElement | null
      const form = el?.closest?.('form') ?? null
      if (!form || form.method.toLowerCase() === 'get' || form.hasAttribute('data-no-guard')) {
        return null
      }
      return form
    }
    const onInput = (event: Event) => {
      const form = tracked(event.target)
      if (form) dirty.add(form)
    }
    const onSubmit = (event: Event) => {
      const form = event.target as HTMLFormElement
      dirty.delete(form)
    }
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      for (const form of dirty) if (!form.isConnected) dirty.delete(form)
      if (dirty.size === 0) return
      event.preventDefault()
      event.returnValue = ''
    }
    const onClick = (event: MouseEvent) => {
      for (const form of dirty) if (!form.isConnected) dirty.delete(form)
      if (dirty.size === 0) return
      const link = (event.target as HTMLElement | null)?.closest?.(
        'a[href]',
      ) as HTMLAnchorElement | null
      if (!link || link.target === '_blank' || link.href.startsWith('javascript:')) return
      if (!window.confirm(t('ux.unsaved_confirm'))) {
        event.preventDefault()
        event.stopPropagation()
      } else {
        dirty.clear()
      }
    }
    document.addEventListener('input', onInput, true)
    document.addEventListener('change', onInput, true)
    document.addEventListener('submit', onSubmit, true)
    document.addEventListener('click', onClick, true)
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      document.removeEventListener('input', onInput, true)
      document.removeEventListener('change', onInput, true)
      document.removeEventListener('submit', onSubmit, true)
      document.removeEventListener('click', onClick, true)
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  }, [t])

  return null
}
