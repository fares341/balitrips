/** نتيجة إجراءات تحقق الجوال — خارج ملف `'use server'` عمداً. */
export interface PhoneActionState {
  status: 'idle' | 'sent' | 'verified' | 'error'
  messageKey: string | null
}

export const IDLE_PHONE_STATE: PhoneActionState = { status: 'idle', messageKey: null }
