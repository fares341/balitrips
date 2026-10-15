/**
 * POST /api/studio-assistant/confirm  { actionId, decision: 'confirm' | 'cancel' }
 *
 * Runs a change the Studio assistant proposed, once, as the confirming staff
 * member, through the existing Studio server action — which checks the
 * capability again and writes its own audit row. This route adds one more
 * audit row, `assistant.execute`, so "done via the assistant" is visible in
 * Studio → Audit next to the change itself.
 */

import { NextResponse } from 'next/server'

import { writeAudit } from '@/app/(admin)/_lib/audit'
import { getAdminI18n } from '@/app/(admin)/_lib/i18n'
import { jsonError, NO_STORE, readJson } from '@/lib/assistant/http'
import { checkSameOrigin, keyedHash } from '@/lib/assistant/request'
import { runStaffAction, type StaffOutcome } from '@/lib/assistant/staff-actions'
import { staffDeps } from '@/lib/assistant/staff-deps'
import { staffGate } from '@/lib/assistant/staff-session'
import { ACTION_CAPABILITY, allowed } from '@/lib/assistant/staff-tools'
import { ACTION_TTL_MS, claimAction, finishAction, loadOwnedAction } from '@/lib/assistant/store'

export const dynamic = 'force-dynamic'

export async function POST(request: Request): Promise<NextResponse> {
  if (checkSameOrigin('POST', request.headers) !== 'ok') return jsonError(403, 'forbidden')
  const gate = await staffGate()
  if (!gate.ok) return jsonError(gate.status, gate.code)
  const session = gate.session

  const body = await readJson(request, 2048)
  if (body === null) return jsonError(400, 'bad_request')

  const action = await loadOwnedAction({
    actionId: body.actionId,
    ownerHash: keyedHash('owner', `studio:${session.userId}`),
    kind: 'studio',
  })
  if (action === null) return jsonError(404, 'not_found')
  if (action.status !== 'pending') return jsonError(409, 'already_handled')

  if (body.decision === 'cancel') {
    if (await claimAction(action.id)) {
      await finishAction({
        actionId: action.id,
        status: 'cancelled',
        result: {},
        executedBy: session.userId,
      })
    }
    return NextResponse.json({ ok: true, message: 'cancelled' }, { headers: NO_STORE })
  }
  if (body.decision !== 'confirm') return jsonError(400, 'bad_request')
  if (Date.now() - action.createdAt.getTime() > ACTION_TTL_MS) {
    if (await claimAction(action.id)) {
      await finishAction({
        actionId: action.id,
        status: 'cancelled',
        result: { message: 'expired' },
        executedBy: null,
      })
    }
    return jsonError(410, 'expired')
  }

  // Capability again, at execution time: a role may have changed since the
  // card was shown, and a proposal is not a permission.
  const capability = ACTION_CAPABILITY[action.kind]
  if (capability === undefined || !allowed({ role: session.role }, capability)) {
    return jsonError(403, 'forbidden', { needs: capability ?? null })
  }
  if (!(await claimAction(action.id))) return jsonError(409, 'already_handled')

  const { t } = await getAdminI18n()
  const notes =
    action.kind === 'lead_note' && typeof action.args.requestId === 'string'
      ? ((await staffDeps.leadState('custom', action.args.requestId))?.notes ?? null)
      : null
  let outcome: StaffOutcome
  try {
    outcome = await runStaffAction(action.kind, action.args, t, notes)
  } catch {
    outcome = { ok: false, message: 'error', href: null }
  }

  await finishAction({
    actionId: action.id,
    status: outcome.ok ? 'done' : 'failed',
    result: { ...outcome },
    executedBy: session.userId,
  })
  await writeAudit({
    actor: session,
    action: 'assistant.execute',
    entityType: 'assistant_action',
    entityId: action.id,
    before: null,
    after: {
      kind: action.kind,
      change: action.summary,
      ok: outcome.ok,
      result: outcome.message.slice(0, 300),
    },
  })

  return NextResponse.json(outcome, { status: outcome.ok ? 200 : 422, headers: NO_STORE })
}
