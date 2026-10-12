'use client'

/**
 * جرس الإشعارات في الرأس. لا يظهر إلا عند وجود غير مقروء — زائر أو مستخدم
 * بلا جديد لا يرى شيئاً، فلا قفزة في التخطيط ولا طلب إضافي من قاعدة البيانات
 * للزوار (المسار يجيب 0 فوراً بلا كوكي جلسة).
 */

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'

import { Icon } from '@/components/ui'
import { Link } from '@/i18n/routing'

export function NotificationBell() {
  const t = useTranslations()
  const [unread, setUnread] = useState(0)

  useEffect(() => {
    let alive = true
    const load = () =>
      fetch('/api/notifications/count', { cache: 'no-store' })
        .then((response) => (response.ok ? response.json() : { unread: 0 }))
        .then((body: { unread?: number }) => {
          if (alive) setUnread(body.unread ?? 0)
        })
        .catch(() => undefined)
    void load()
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      alive = false
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  if (unread === 0) return null
  return (
    <Link
      href="/account/notifications"
      className="bt-iconbtn"
      aria-label={`${t('acct_nav_notifs')} (${unread})`}
    >
      <Icon name="mail" size={19} />
      <span className="bt-iconbtn-badge">{unread > 9 ? '9+' : unread}</span>
    </Link>
  )
}
