'use client'

/**
 * إدارة أفراد الباقة العائلية (الوثيقة 13.3/14.3): دعوة بالبريد، إزالة.
 * الخادم يقرر كل شيء (الحد، الملكية، التكرار) — هنا العرض والرسائل فقط.
 */

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/shared'

import { inviteFamilyMemberAction, removeFamilyMemberAction } from './actions'
import { IDLE_FAMILY_STATE } from './family-contract'

export interface FamilyPanelProps {
  entitlementId: string
  planName: string
  maxMembers: number
  members: { id: string; email: string; status: 'invited' | 'active' }[]
}

export function FamilyPanel({ entitlementId, planName, maxMembers, members }: FamilyPanelProps) {
  const t = useTranslations()
  const [state, action, pending] = useActionState(inviteFamilyMemberAction, IDLE_FAMILY_STATE)
  const seatsLeft = Math.max(0, maxMembers - 1 - members.length)

  return (
    <div className="card" style={{ padding: 18, marginBlockStart: 16 }}>
      <h2 style={{ fontSize: 17, margin: 0 }}>
        {t('fam_title')} · <bdi>{planName}</bdi>
      </h2>
      <p className="muted" style={{ fontSize: 13.5, margin: '4px 0 12px' }}>
        {t('fam_sub', { max: maxMembers, left: seatsLeft })}
      </p>

      {members.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 12px', display: 'grid', gap: 8 }}>
          {members.map((member) => (
            <li key={member.id} className="row" style={{ gap: 10, alignItems: 'center' }}>
              <bdi style={{ flex: 1 }}>{member.email}</bdi>
              <span className="muted" style={{ fontSize: 12.5 }}>
                {t(member.status === 'active' ? 'fam_active' : 'fam_invited')}
              </span>
              <form action={removeFamilyMemberAction}>
                <input type="hidden" name="memberId" value={member.id} />
                <Button type="submit" variant="ghost" size="sm">
                  {t('fam_remove')}
                </Button>
              </form>
            </li>
          ))}
        </ul>
      )}

      {seatsLeft > 0 && (
        <form action={action} className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <input type="hidden" name="entitlementId" value={entitlementId} />
          <input
            className="input"
            type="email"
            name="email"
            required
            placeholder="name@email.com"
            aria-label={t('fam_email')}
            style={{ flex: 1, minWidth: 200 }}
          />
          <Button type="submit" variant="orange" size="sm" disabled={pending}>
            {pending ? t('auth_working') : t('fam_add')}
          </Button>
        </form>
      )}

      {state.status !== 'idle' && (
        <p role="status" className="muted" style={{ fontSize: 13, marginTop: 8 }}>
          {state.status === 'added'
            ? t('fam_added')
            : state.status === 'invited'
              ? t('fam_invited_note')
              : t(state.messageKey ?? 'c_error')}
        </p>
      )}
    </div>
  )
}
