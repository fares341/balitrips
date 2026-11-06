import { FormError } from './form'

/**
 * Typed confirmations for the Studio's riskiest buttons.
 *
 * The dialog in `<ConfirmSubmit>` is a convenience; these checks are the
 * real gate. A crafted POST (or a page without JS) that skips the dialog
 * still has to carry the typed value, and it is compared here, on the server.
 */

/** Field the typed confirmation is posted in. */
export const CONFIRM_FIELD = 'confirm'

/**
 * Words an operator types to confirm a ban or a revoke. Every Studio
 * language's word is accepted whatever language the form was rendered in, so
 * switching language between loading and submitting never locks anyone out.
 */
export const CONFIRM_WORDS = {
  ban: { en: 'BAN', ar: 'حظر', id: 'BLOKIR' },
  revoke: { en: 'REVOKE', ar: 'إلغاء', id: 'CABUT' },
} as const

export type ConfirmWordKind = keyof typeof CONFIRM_WORDS

/** Trim, fold case, unify Unicode forms and strip bidi marks a paste can carry. */
export function normalizeTyped(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[‎‏‪-‮⁦-⁩​﻿]/g, '')
    .trim()
    .toLowerCase()
}

function typedValue(form: FormData): string {
  const value = form.get(CONFIRM_FIELD)
  return typeof value === 'string' ? value : ''
}

/** True when the typed value matches `expected` (case- and whitespace-insensitive). */
export function matchesTyped(typed: string, expected: string): boolean {
  const want = normalizeTyped(expected)
  return want !== '' && normalizeTyped(typed) === want
}

/**
 * Throws unless the form's `confirm` field equals `expected`. `message` is
 * the already translated error shown in the banner.
 */
export function assertTypedValue(form: FormData, expected: string, message: string): void {
  if (!matchesTyped(typedValue(form), expected)) {
    throw new FormError(message)
  }
}

/** Throws unless the form's `confirm` field is the ban/revoke word in any Studio language. */
export function assertTypedWord(form: FormData, kind: ConfirmWordKind, message: string): void {
  const typed = typedValue(form)
  const ok = Object.values(CONFIRM_WORDS[kind]).some((word) => matchesTyped(typed, word))
  if (!ok) throw new FormError(message)
}
