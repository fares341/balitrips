/** شكل نتيجة إجراءات الباقة العائلية — خارج ملف `'use server'` عمداً. */
export interface FamilyActionState {
  status: 'idle' | 'added' | 'invited' | 'removed' | 'error'
  messageKey: string | null
}

export const IDLE_FAMILY_STATE: FamilyActionState = { status: 'idle', messageKey: null }
