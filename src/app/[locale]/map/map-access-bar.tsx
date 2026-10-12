'use client'

/**
 * شريط الوصول أسفل الخريطة: "مفتوح" لمن يملك الصلاحية، أو عدد الأماكن المقفلة
 * وزر الشراء. مشترك بين الخريطة المسطحة وثلاثية الأبعاد — كانت الثلاثية (ما
 * يراه أغلب الزوار) بلا عرض شراء إطلاقاً.
 */

import type { Ref } from 'react'
import { useFormatter, useTranslations } from 'next-intl'

import { LinkButton } from '@/components/shared'
import { Icon } from '@/components/ui'

const PLANS_HREF = '/plans'

export function MapAccessBar({
  unlocked,
  lockedCount,
  barRef,
}: {
  unlocked: boolean
  lockedCount: number
  barRef?: Ref<HTMLDivElement>
}) {
  const t = useTranslations()
  const format = useFormatter()

  if (unlocked) {
    return (
      <div
        className="bt-mapcount"
        style={{ background: 'var(--palm)', color: 'var(--forest-deep)' }}
      >
        <Icon name="check" size={13} color="var(--forest-deep)" /> {t('mp_unlocked')}
      </div>
    )
  }
  return (
    <div className="bt-paywall" ref={barRef}>
      <span className="bt-paywall-ic">
        <Icon name="lock" size={20} color="#fff" />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 800, fontSize: 15 }}>{t('mp_locked')}</div>
        <div style={{ fontSize: 12.5, opacity: 0.85 }}>
          {format.number(lockedCount)} · {t('mp_locked_b')}
        </div>
      </div>
      <LinkButton href={PLANS_HREF} variant="orange" size="sm">
        {t('mp_unlock')}
      </LinkButton>
    </div>
  )
}
