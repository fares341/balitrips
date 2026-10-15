/**
 * POST /api/assistant/confirm  { actionId, decision: 'confirm' | 'cancel', locale }
 *
 * Runs (or drops) a change the website assistant proposed. The action must
 * belong to a conversation owned by this browser (httpOnly cookie), still be
 * pending, and be fresh; it runs at most once (claimed atomically), with the
 * arguments stored when the card was shown, through the site's own action.
 */

import { NextResponse } from 'next/server'

import { localeOf } from '@/app/api/places/_viewer'
import { jsonError, NO_STORE, ownerToken, readJson } from '@/lib/assistant/http'
import { PUBLIC_LIMITS } from '@/lib/assistant/limits'
import { runPublicAction, type ActionOutcome } from '@/lib/assistant/public-actions'
import { checkSameOrigin, keyedHash } from '@/lib/assistant/request'
import { ACTION_TTL_MS, claimAction, finishAction, loadOwnedAction } from '@/lib/assistant/store'
import { getUser } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'

export async function POST(request: Request): Promise<NextResponse> {
  if (checkSameOrigin('POST', request.headers) !== 'ok') return jsonError(403, 'forbidden')
  const body = await readJson(request, 2048)
  if (body === null) return jsonError(400, 'bad_request')

  const owner = ownerToken(request)
  if (owner.fresh) return jsonError(404, 'not_found')
  const ownerHash = keyedHash('owner', owner.token)

  const limit = PUBLIC_LIMITS.confirmsPerSession.hit(ownerHash)
  if (!limit.ok) {
    return jsonError(429, 'rate_limited', {
      retryAfterSeconds: Math.max(1, Math.ceil(limit.retryAfterMs / 1000)),
    })
  }

  const action = await loadOwnedAction({ actionId: body.actionId, ownerHash, kind: 'public' })
  if (action === null) return jsonError(404, 'not_found')
  if (action.status !== 'pending') return jsonError(409, 'already_handled')

  const user = await getUser()
  if (body.decision === 'cancel') {
    if (await claimAction(action.id)) {
      await finishAction({
        actionId: action.id,
        status: 'cancelled',
        result: {},
        executedBy: user?.id ?? null,
      })
    }
    return NextResponse.json({ ok: true, code: 'cancelled' }, { headers: NO_STORE })
  }
  if (body.decision !== 'confirm') return jsonError(400, 'bad_request')

  if (Date.now() - action.createdAt.getTime() > ACTION_TTL_MS) {
    if (await claimAction(action.id)) {
      await finishAction({
        actionId: action.id,
        status: 'cancelled',
        result: { code: 'expired' },
        executedBy: null,
      })
    }
    return jsonError(410, 'expired')
  }
  if (!(await claimAction(action.id))) return jsonError(409, 'already_handled')

  const locale = localeOf(typeof body.locale === 'string' ? body.locale : null)
  let outcome: ActionOutcome
  try {
    outcome = await runPublicAction(action.kind, action.args, locale)
  } catch (error) {
    console.error(
      '[assistant] action failed',
      action.kind,
      error instanceof Error ? error.message.slice(0, 200) : 'unknown',
    )
    outcome = { ok: false, code: 'error' }
  }
  await finishAction({
    actionId: action.id,
    status: outcome.ok ? 'done' : 'failed',
    result: { ...outcome },
    executedBy: user?.id ?? null,
  })
  return NextResponse.json(outcome, { status: outcome.ok ? 200 : 422, headers: NO_STORE })
}
