/**
 * Persistence for the assistants (drizzle, no raw SQL strings beyond the
 * counter increments). Server only.
 */

import { and, asc, desc, eq, inArray, lt, sql } from 'drizzle-orm'

import { db } from '@/db'
import {
  assistantActions,
  assistantConversations,
  assistantMessages,
  assistantUsage,
} from '@/db/schema'

import type { ChatMessage } from './openrouter'
import { MAX_HISTORY_TURNS, trimHistory, usageDay, type DailyState } from './limits'

export type ConversationKind = 'public' | 'studio'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value)
}

/**
 * The caller's conversation, or a new one. A conversation id from the client
 * is only honoured when the owner hash (from the httpOnly cookie, or the
 * staff user) and the kind match — guessing someone else's id gets you a
 * fresh, empty chat.
 */
export async function openConversation(input: {
  kind: ConversationKind
  conversationId: unknown
  ownerHash: string
  userId: string | null
  ipHash: string | null
  locale: string
}): Promise<{ id: string; created: boolean }> {
  if (isUuid(input.conversationId)) {
    const [row] = await db
      .select({ id: assistantConversations.id, userId: assistantConversations.userId })
      .from(assistantConversations)
      .where(
        and(
          eq(assistantConversations.id, input.conversationId),
          eq(assistantConversations.ownerHash, input.ownerHash),
          eq(assistantConversations.kind, input.kind),
        ),
      )
      .limit(1)
    if (row) {
      // Signed in mid-conversation: attach it to the account from now on.
      if (row.userId === null && input.userId !== null) {
        await db
          .update(assistantConversations)
          .set({ userId: input.userId })
          .where(eq(assistantConversations.id, row.id))
      }
      return { id: row.id, created: false }
    }
  }
  const [created] = await db
    .insert(assistantConversations)
    .values({
      kind: input.kind,
      ownerHash: input.ownerHash,
      userId: input.userId,
      ipHash: input.ipHash,
      locale: input.locale.slice(0, 8),
    })
    .returning({ id: assistantConversations.id })
  if (!created) throw new Error('could not create a conversation')
  return { id: created.id, created: true }
}

/** The visible turns, trimmed to the replay window, as chat messages. */
export async function loadHistory(conversationId: string): Promise<ChatMessage[]> {
  const rows = await db
    .select({ role: assistantMessages.role, content: assistantMessages.content })
    .from(assistantMessages)
    .where(eq(assistantMessages.conversationId, conversationId))
    .orderBy(desc(assistantMessages.createdAt))
    .limit(MAX_HISTORY_TURNS * 2)
  const ordered = rows.reverse().filter((row) => row.role === 'user' || row.role === 'assistant')
  return trimHistory<{ role: string; content: string }>(ordered).map((row) =>
    row.role === 'user'
      ? { role: 'user' as const, content: row.content }
      : { role: 'assistant' as const, content: row.content },
  )
}

export async function saveTurn(input: {
  conversationId: string
  userText: string
  replyText: string
  tools: string[]
  tokensIn: number
  tokensOut: number
  costMicros: number
  model: string | null
}): Promise<void> {
  const now = Date.now()
  await db.insert(assistantMessages).values([
    {
      conversationId: input.conversationId,
      role: 'user',
      content: input.userText,
      createdAt: new Date(now),
    },
    {
      conversationId: input.conversationId,
      role: 'assistant',
      content: input.replyText.slice(0, 12000),
      tools: input.tools.length > 0 ? input.tools : null,
      // One millisecond later, so the pair always sorts user → assistant.
      createdAt: new Date(now + 1),
    },
  ])
  await db
    .update(assistantConversations)
    .set({
      messageCount: sql`${assistantConversations.messageCount} + 2`,
      tokensIn: sql`${assistantConversations.tokensIn} + ${input.tokensIn}`,
      tokensOut: sql`${assistantConversations.tokensOut} + ${input.tokensOut}`,
      costMicros: sql`${assistantConversations.costMicros} + ${input.costMicros}`,
      ...(input.model ? { lastModel: input.model } : {}),
    })
    .where(eq(assistantConversations.id, input.conversationId))
}

/* --------------------------------------------------------------------------
   Daily counters
   -------------------------------------------------------------------------- */

export function ipScope(ipHash: string | null): string {
  return `ip:${ipHash ?? 'unknown'}`
}

export async function dailyState(ipHash: string | null, day = usageDay()): Promise<DailyState> {
  const rows = await db
    .select({
      scope: assistantUsage.scope,
      messages: assistantUsage.messages,
      cost: assistantUsage.costMicros,
    })
    .from(assistantUsage)
    .where(
      and(eq(assistantUsage.day, day), inArray(assistantUsage.scope, ['global', ipScope(ipHash)])),
    )
  let ipMessages = 0
  let globalMessages = 0
  let globalCostMicros = 0
  for (const row of rows) {
    if (row.scope === 'global') {
      globalCostMicros = Number(row.cost)
      globalMessages = row.messages
    } else ipMessages = row.messages
  }
  return { ipMessages, globalMessages, globalCostMicros }
}

/**
 * Add to today's counters for each scope. Called twice per message: with
 * `messages: 1` before the model runs (so a burst of parallel requests
 * cannot all slip under the cap) and with the cost once it is known.
 */
export async function recordUsage(
  scopes: readonly string[],
  input: { messages: number; costMicros: number },
  day = usageDay(),
): Promise<void> {
  const { messages, costMicros } = input
  for (const scope of scopes) {
    await db
      .insert(assistantUsage)
      .values({ day, scope, messages, costMicros })
      .onConflictDoUpdate({
        target: [assistantUsage.day, assistantUsage.scope],
        set: {
          messages: sql`${assistantUsage.messages} + ${messages}`,
          costMicros: sql`${assistantUsage.costMicros} + ${costMicros}`,
        },
      })
  }
}

/* --------------------------------------------------------------------------
   Proposed actions
   -------------------------------------------------------------------------- */

export async function createAction(input: {
  conversationId: string
  kind: string
  args: Record<string, unknown>
  summary: Record<string, unknown>
}): Promise<string> {
  const [row] = await db
    .insert(assistantActions)
    .values({
      conversationId: input.conversationId,
      kind: input.kind,
      args: input.args,
      summary: input.summary,
    })
    .returning({ id: assistantActions.id })
  if (!row) throw new Error('could not store the proposed action')
  return row.id
}

export interface StoredAction {
  id: string
  kind: string
  args: Record<string, unknown>
  summary: Record<string, unknown>
  status: string
  createdAt: Date
  conversationId: string
}

/** A pending action that belongs to this owner's conversation of this kind. */
export async function loadOwnedAction(input: {
  actionId: unknown
  ownerHash: string
  kind: ConversationKind
}): Promise<StoredAction | null> {
  if (!isUuid(input.actionId)) return null
  const [row] = await db
    .select({
      id: assistantActions.id,
      kind: assistantActions.kind,
      args: assistantActions.args,
      summary: assistantActions.summary,
      status: assistantActions.status,
      createdAt: assistantActions.createdAt,
      conversationId: assistantActions.conversationId,
    })
    .from(assistantActions)
    .innerJoin(
      assistantConversations,
      eq(assistantConversations.id, assistantActions.conversationId),
    )
    .where(
      and(
        eq(assistantActions.id, input.actionId),
        eq(assistantConversations.ownerHash, input.ownerHash),
        eq(assistantConversations.kind, input.kind),
      ),
    )
    .limit(1)
  return row ?? null
}

/**
 * Move an action out of `pending`, once. Returns false when another click got
 * there first (double-submit), so the change never runs twice.
 */
export async function claimAction(actionId: string): Promise<boolean> {
  const rows = await db
    .update(assistantActions)
    .set({ status: 'running' })
    .where(and(eq(assistantActions.id, actionId), eq(assistantActions.status, 'pending')))
    .returning({ id: assistantActions.id })
  return rows.length === 1
}

export async function finishAction(input: {
  actionId: string
  status: 'done' | 'failed' | 'cancelled'
  result: Record<string, unknown>
  executedBy: string | null
}): Promise<void> {
  await db
    .update(assistantActions)
    .set({
      status: input.status,
      result: input.result,
      executedBy: input.executedBy,
      executedAt: new Date(),
    })
    .where(eq(assistantActions.id, input.actionId))
}

/** Proposals expire: a card left open for a day must not run tomorrow's price. */
export const ACTION_TTL_MS = 30 * 60 * 1000

/* --------------------------------------------------------------------------
   Studio review + retention
   -------------------------------------------------------------------------- */

export async function listConversations(kind: ConversationKind, limit = 50, offset = 0) {
  return db
    .select({
      id: assistantConversations.id,
      userId: assistantConversations.userId,
      locale: assistantConversations.locale,
      messageCount: assistantConversations.messageCount,
      costMicros: assistantConversations.costMicros,
      lastModel: assistantConversations.lastModel,
      createdAt: assistantConversations.createdAt,
      updatedAt: assistantConversations.updatedAt,
    })
    .from(assistantConversations)
    .where(eq(assistantConversations.kind, kind))
    .orderBy(desc(assistantConversations.updatedAt))
    .limit(limit)
    .offset(offset)
}

export async function conversationDetail(id: string) {
  if (!isUuid(id)) return null
  const [conversation] = await db
    .select()
    .from(assistantConversations)
    .where(eq(assistantConversations.id, id))
    .limit(1)
  if (!conversation) return null
  const [messages, actions] = await Promise.all([
    db
      .select()
      .from(assistantMessages)
      .where(eq(assistantMessages.conversationId, id))
      .orderBy(asc(assistantMessages.createdAt)),
    db
      .select()
      .from(assistantActions)
      .where(eq(assistantActions.conversationId, id))
      .orderBy(asc(assistantActions.createdAt)),
  ])
  return { conversation, messages, actions }
}

export async function usageSince(day: string) {
  return db
    .select({
      day: assistantUsage.day,
      messages: assistantUsage.messages,
      costMicros: assistantUsage.costMicros,
    })
    .from(assistantUsage)
    .where(and(eq(assistantUsage.scope, 'global'), sql`${assistantUsage.day} >= ${day}`))
    .orderBy(desc(assistantUsage.day))
}

/** Worker: delete what is older than the retention window. */
export async function pruneAssistant(
  days: number,
): Promise<{ conversations: number; usage: number }> {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const conversations = await db
    .delete(assistantConversations)
    .where(lt(assistantConversations.updatedAt, cutoff))
    .returning({ id: assistantConversations.id })
  const usage = await db
    .delete(assistantUsage)
    .where(lt(assistantUsage.day, cutoff.toISOString().slice(0, 10)))
    .returning({ day: assistantUsage.day })
  return { conversations: conversations.length, usage: usage.length }
}
