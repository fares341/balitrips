/**
 * Shapes exchanged between the account's Server Actions and the forms that
 * call them.
 *
 * Kept out of `../actions.ts` because a `'use server'` module may only export
 * async functions — declaring the state type there would make the file's
 * exports invalid. Same split the checkout uses for `CheckoutState`.
 *
 * Every message is a KEY into messages/{en,ar,id}.json, never a sentence: the
 * server has no business deciding which language the traveller reads.
 */

export interface ProfileFormState {
  status: 'idle' | 'saved' | 'error'
  /** `{ fieldName: messageKey }`. First issue per field wins. */
  errors: Record<string, string>
  /** Form-level failure key, e.g. when the write itself was rejected. */
  formError: string | null
}

export const IDLE_PROFILE_STATE: ProfileFormState = {
  status: 'idle',
  errors: {},
  formError: null,
}

export interface FavoriteActionState {
  /** `added` = في السلة، `planned` = في "رحلتي" (مكان من الخريطة). */
  status: 'idle' | 'added' | 'planned' | 'removed' | 'error'
  /** Which favorite the outcome belongs to, so one card cannot flash another. */
  refId: string | null
  /** Message key when `status` is `error`. */
  messageKey: string | null
}

export const IDLE_FAVORITE_STATE: FavoriteActionState = {
  status: 'idle',
  refId: null,
  messageKey: null,
}
