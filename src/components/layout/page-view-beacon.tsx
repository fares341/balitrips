'use client'

/**
 * يسجّل كل صفحة يفتحها مستخدم مسجّل (الوثيقة 15.2: "الصفحات التي زارها").
 * `sendBeacon` لا يؤخر التنقل ولا ينتظر رداً؛ الخادم يتجاهل الزوار المجهولين.
 */

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

export function PageViewBeacon() {
  const pathname = usePathname()

  useEffect(() => {
    if (!pathname) return
    const body = JSON.stringify({ path: pathname })
    try {
      if (typeof navigator !== 'undefined' && 'sendBeacon' in navigator) {
        navigator.sendBeacon('/api/activity/page', new Blob([body], { type: 'application/json' }))
        return
      }
      void fetch('/api/activity/page', {
        method: 'POST',
        body,
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
      })
    } catch {
      // التتبع لا يكسر الصفحة أبداً.
    }
  }, [pathname])

  return null
}
