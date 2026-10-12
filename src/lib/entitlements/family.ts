/**
 * الباقة العائلية (الوثيقة 13.1 "باقة عائلية"، 13.3 "أكثر من جهاز أو أكثر من
 * مستخدم"، 14.3).
 *
 * صاحب باقة `max_members > 1` يدعو أفراداً بالبريد. كل فرد يحصل على صف
 * `entitlements` خاص به (نفس النوع والمدة والحد، و`granted_by_order_id` نفسه —
 * فاسترداد طلب الصاحب يسحب صلاحيات الأفراد تلقائياً)، مع `shared_by_user_id`
 * كي لا يُعاد تشاركه. لكل فرد أجهزته وحده بحسب الحد.
 *
 * إثبات ملكية البريد: لا تحقق من البريد عند التسجيل (الوثيقة: "لاحقاً")، فلا
 * يُمنح أحد الصلاحية لمجرد أنه سجّل بالبريد المدعو. الحساب ذو البريد المؤكَّد
 * يُضاف فوراً؛ غير ذلك يصله رابط قبول (رمز لمرة واحدة، يُخزَّن hash فقط) ويقبل
 * وهو مسجّل الدخول بالبريد نفسه.
 */

import { createHash, randomBytes } from 'node:crypto'

import { and, eq, gt, inArray, isNull, lte, ne, or, sql } from 'drizzle-orm'

import { db } from '@/db'
import { entitlements, planMembers, plans, users } from '@/db/schema'
import type { Localized } from '@/db/schema/_shared'
import type { Locale } from '@/i18n/config'
import { renderNotificationEmail, sendEmail, toMailLocale } from '@/lib/email'
import { notifyUser } from '@/lib/notify'

export interface FamilyMemberView {
  id: string
  email: string
  status: 'invited' | 'active'
}

export interface FamilyPlanView {
  entitlementId: string
  planName: Localized
  /** يشمل صاحب الباقة. */
  maxMembers: number
  members: FamilyMemberView[]
}

export type FamilyError =
  | 'not_found'
  | 'full'
  | 'self'
  | 'duplicate'
  | 'invalid_email'
  | 'not_shareable'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/+$/, '')

/** صلاحية سارية الآن: غير مسحوبة، بدأت (لا تجديد مؤجَّل)، ولم تنتهِ. */
function live(now: Date) {
  return and(
    isNull(entitlements.revokedAt),
    lte(entitlements.startsAt, now),
    or(isNull(entitlements.expiresAt), gt(entitlements.expiresAt, now)),
  )
}

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

/** باقات المستخدم العائلية الحيّة التي يملكها (لا المُشاركة معه) وأفرادها. */
export async function listFamilyPlans(ownerUserId: string): Promise<FamilyPlanView[]> {
  const now = new Date()
  const owned = await db
    .select({ id: entitlements.id, name: plans.name, maxMembers: plans.maxMembers })
    .from(entitlements)
    .innerJoin(plans, eq(plans.id, entitlements.planId))
    .where(
      and(
        eq(entitlements.userId, ownerUserId),
        isNull(entitlements.sharedByUserId),
        gt(plans.maxMembers, 1),
        live(now),
      ),
    )
  if (owned.length === 0) return []

  const memberRows = await db
    .select({
      id: planMembers.id,
      owner: planMembers.ownerEntitlementId,
      email: planMembers.inviteEmail,
      status: planMembers.status,
    })
    .from(planMembers)
    .where(
      and(
        inArray(
          planMembers.ownerEntitlementId,
          owned.map((row) => row.id),
        ),
        ne(planMembers.status, 'removed'),
      ),
    )

  return owned.map((row) => ({
    entitlementId: row.id,
    planName: row.name,
    maxMembers: row.maxMembers,
    members: memberRows
      .filter((member) => member.owner === row.id)
      .map((member) => ({
        id: member.id,
        email: member.email,
        status: member.status === 'active' ? ('active' as const) : ('invited' as const),
      })),
  }))
}

/** يمنح فرداً صلاحية منسوخة من صلاحية الصاحب. داخل معاملة. */
async function grantMember(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  owner: typeof entitlements.$inferSelect,
  memberUserId: string,
): Promise<string> {
  const [row] = await tx
    .insert(entitlements)
    .values({
      userId: memberUserId,
      kind: owner.kind,
      grantedByOrderId: owner.grantedByOrderId,
      planId: owner.planId,
      // تجديد مؤجَّل للصاحب يبدأ في المستقبل: الفرد يبدأ معه، لا قبله.
      startsAt: owner.startsAt > new Date() ? owner.startsAt : new Date(),
      expiresAt: owner.expiresAt,
      deviceLimit: owner.deviceLimit,
      sharedByUserId: owner.userId,
    })
    .returning({ id: entitlements.id })
  if (!row) throw new Error('member entitlement insert returned nothing')
  return row.id
}

export async function inviteFamilyMember(
  ownerUserId: string,
  ownerEntitlementId: string,
  rawEmail: string,
  locale: Locale,
): Promise<{ ok: true; status: 'active' | 'invited' } | { ok: false; error: FamilyError }> {
  const email = rawEmail.trim().toLowerCase()
  if (!EMAIL.test(email) || email.length > 256) return { ok: false, error: 'invalid_email' }

  const result = await db.transaction(async (tx) => {
    const now = new Date()
    const [owner] = await tx
      .select({
        entitlement: entitlements,
        maxMembers: plans.maxMembers,
        ownerEmail: users.email,
        ownerName: users.name,
      })
      .from(entitlements)
      .innerJoin(plans, eq(plans.id, entitlements.planId))
      .innerJoin(users, eq(users.id, entitlements.userId))
      .where(
        and(
          eq(entitlements.id, ownerEntitlementId),
          eq(entitlements.userId, ownerUserId),
          isNull(entitlements.sharedByUserId),
          live(now),
        ),
      )
      .for('update', { of: entitlements })
      .limit(1)
    if (!owner) return { ok: false as const, error: 'not_found' as const }
    if (owner.maxMembers <= 1) return { ok: false as const, error: 'not_shareable' as const }
    if (owner.ownerEmail.toLowerCase() === email) {
      return { ok: false as const, error: 'self' as const }
    }

    const existing = await tx
      .select({ email: planMembers.inviteEmail })
      .from(planMembers)
      .where(
        and(
          eq(planMembers.ownerEntitlementId, ownerEntitlementId),
          ne(planMembers.status, 'removed'),
        ),
      )
    if (existing.some((row) => row.email === email)) {
      return { ok: false as const, error: 'duplicate' as const }
    }
    // الحد يشمل الصاحب نفسه.
    if (existing.length >= owner.maxMembers - 1) {
      return { ok: false as const, error: 'full' as const }
    }

    const [member] = await tx
      .select({ id: users.id, verifiedAt: users.emailVerifiedAt, locale: users.locale })
      .from(users)
      .where(and(sql`lower(${users.email}) = ${email}`, isNull(users.deletedAt)))
      .limit(1)
    const ownerLabel = owner.ownerName?.trim() || owner.ownerEmail

    if (member && member.verifiedAt !== null) {
      const memberEntitlementId = await grantMember(tx, owner.entitlement, member.id)
      await tx.insert(planMembers).values({
        ownerEntitlementId,
        ownerUserId,
        inviteEmail: email,
        memberUserId: member.id,
        memberEntitlementId,
        status: 'active',
      })
      return {
        ok: true as const,
        status: 'active' as const,
        notify: { userId: member.id, owner: ownerLabel },
        mail: null,
      }
    }

    const token = randomBytes(32).toString('base64url')
    await tx.insert(planMembers).values({
      ownerEntitlementId,
      ownerUserId,
      inviteEmail: email,
      tokenHash: hashToken(token),
    })
    const mailLocale = member ? toMailLocale(member.locale) : locale
    return {
      ok: true as const,
      status: 'invited' as const,
      notify: null,
      mail: { token, owner: ownerLabel, locale: mailLocale },
    }
  })

  if (!result.ok) return result
  // بعد التزام المعاملة: لا إشعار عن منح تراجع.
  if (result.notify !== null) {
    await notifyUser(result.notify.userId, 'family_added', { owner: result.notify.owner }, '/map')
  }
  if (result.mail !== null) {
    // يُرسل مباشرة لا عبر الطابور: الرمز لا يُكتب في pgboss.job.data (كرابط إعادة كلمة المرور).
    const { token, owner, locale: mailLocale } = result.mail
    const rendered = renderNotificationEmail({
      locale: mailLocale,
      name: null,
      type: 'family_invite',
      params: { owner },
      url: `${SITE_URL}/${mailLocale}/account/subscriptions/accept?token=${token}`,
    })
    const sent = await sendEmail({ to: email, ...rendered })
    if (!sent.delivered) console.error('[family] invite email not delivered', { email })
  }
  return { ok: true, status: result.status }
}

export type AcceptResult =
  | { ok: true }
  | { ok: false; error: 'invalid' | 'wrong_account' | 'expired'; email?: string }

/**
 * قبول دعوة من رابط البريد. يجب أن يكون المستخدم مسجّلاً بالبريد المدعو نفسه:
 * الرابط يثبت ملكية البريد، والجلسة تثبت أي حساب يحصل على الصلاحية.
 */
export async function acceptFamilyInvite(
  userId: string,
  userEmail: string,
  token: string,
): Promise<AcceptResult> {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return { ok: false, error: 'invalid' }
  const result = await db.transaction(async (tx) => {
    const now = new Date()
    const [row] = await tx
      .select({ invite: planMembers, owner: entitlements, ownerEmail: users.email })
      .from(planMembers)
      .innerJoin(entitlements, eq(entitlements.id, planMembers.ownerEntitlementId))
      .innerJoin(users, eq(users.id, planMembers.ownerUserId))
      .where(and(eq(planMembers.tokenHash, hashToken(token)), eq(planMembers.status, 'invited')))
      .for('update', { of: planMembers })
      .limit(1)
    if (!row) return { ok: false as const, error: 'invalid' as const }
    if (row.invite.inviteEmail !== userEmail.trim().toLowerCase()) {
      return { ok: false as const, error: 'wrong_account' as const, email: row.invite.inviteEmail }
    }
    const ownerLive =
      row.owner.revokedAt === null &&
      row.owner.startsAt <= now &&
      (row.owner.expiresAt === null || row.owner.expiresAt > now)
    if (!ownerLive) return { ok: false as const, error: 'expired' as const }
    if (row.owner.userId === userId) return { ok: false as const, error: 'invalid' as const }

    const memberEntitlementId = await grantMember(tx, row.owner, userId)
    await tx
      .update(planMembers)
      .set({ status: 'active', memberUserId: userId, memberEntitlementId, tokenHash: null })
      .where(eq(planMembers.id, row.invite.id))
    return { ok: true as const, owner: row.ownerEmail }
  })
  if (!result.ok) return result
  await notifyUser(userId, 'family_added', { owner: result.owner }, '/map')
  return { ok: true }
}

/**
 * يسحب صلاحيات الأفراد المنسوخة من صلاحية صاحب (عند سحبها من الإدارة).
 * الاسترداد يغطيه `granted_by_order_id` المشترك؛ هذا للسحب اليدوي.
 */
export async function revokeFamilyMembersOf(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  ownerEntitlementId: string,
  reason: string,
): Promise<number> {
  const rows = await tx
    .update(planMembers)
    .set({ status: 'removed', tokenHash: null })
    .where(
      and(
        eq(planMembers.ownerEntitlementId, ownerEntitlementId),
        ne(planMembers.status, 'removed'),
      ),
    )
    .returning({ memberEntitlementId: planMembers.memberEntitlementId })
  const ids = rows.flatMap((row) => (row.memberEntitlementId ? [row.memberEntitlementId] : []))
  if (ids.length > 0) {
    await tx
      .update(entitlements)
      .set({ revokedAt: new Date(), revokedReason: reason.slice(0, 200) })
      .where(and(inArray(entitlements.id, ids), isNull(entitlements.revokedAt)))
  }
  return ids.length
}

export async function removeFamilyMember(
  ownerUserId: string,
  memberRowId: string,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(planMembers)
      .set({ status: 'removed', tokenHash: null })
      .where(
        and(
          eq(planMembers.id, memberRowId),
          eq(planMembers.ownerUserId, ownerUserId),
          ne(planMembers.status, 'removed'),
        ),
      )
      .returning({ memberEntitlementId: planMembers.memberEntitlementId })
    if (!row) return false
    if (row.memberEntitlementId) {
      await tx
        .update(entitlements)
        .set({ revokedAt: new Date(), revokedReason: 'removed from family plan by owner' })
        .where(and(eq(entitlements.id, row.memberEntitlementId), isNull(entitlements.revokedAt)))
    }
    return true
  })
}

/**
 * تجديد باقة عائلية: صلاحية الصاحب الجديدة صف جديد، فينقل إليه أفراده (الوثيقة
 * 13.3). الأعضاء الفعّالون يحصلون على نسخة بمدة التجديد نفسها، والدعوات
 * المعلّقة تُنقل للصف الجديد (فيبقى رابطها صالحاً). يحترم حد الأفراد الحالي
 * للباقة. داخل معاملة الدفع نفسها — لا لحظة يكون فيها الصاحب مجدِّداً والأفراد خارجها.
 */
export async function carryOverFamily(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  renewal: typeof entitlements.$inferSelect,
): Promise<number> {
  if (renewal.planId === null || renewal.sharedByUserId !== null) return 0
  const [plan] = await tx
    .select({ maxMembers: plans.maxMembers })
    .from(plans)
    .where(eq(plans.id, renewal.planId))
    .limit(1)
  if (!plan || plan.maxMembers <= 1) return 0

  // آخر صلاحية سابقة للصاحب على نفس الباقة (غير مسحوبة).
  const [previous] = await tx
    .select({ id: entitlements.id })
    .from(entitlements)
    .where(
      and(
        eq(entitlements.userId, renewal.userId),
        eq(entitlements.planId, renewal.planId),
        isNull(entitlements.sharedByUserId),
        isNull(entitlements.revokedAt),
        ne(entitlements.id, renewal.id),
      ),
    )
    .orderBy(sql`${entitlements.expiresAt} desc nulls first`)
    .limit(1)
  if (!previous) return 0

  const members = await tx
    .select()
    .from(planMembers)
    .where(and(eq(planMembers.ownerEntitlementId, previous.id), ne(planMembers.status, 'removed')))
    .orderBy(sql`${planMembers.status} = 'active' desc`, planMembers.createdAt)

  let moved = 0
  for (const member of members.slice(0, plan.maxMembers - 1)) {
    if (member.status === 'invited') {
      await tx
        .update(planMembers)
        .set({ ownerEntitlementId: renewal.id })
        .where(eq(planMembers.id, member.id))
    } else if (member.memberUserId !== null) {
      const memberEntitlementId = await grantMember(tx, renewal, member.memberUserId)
      await tx.insert(planMembers).values({
        ownerEntitlementId: renewal.id,
        ownerUserId: renewal.userId,
        inviteEmail: member.inviteEmail,
        memberUserId: member.memberUserId,
        memberEntitlementId,
        status: 'active',
      })
    } else {
      continue
    }
    moved += 1
  }
  return moved
}
