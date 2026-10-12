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

/**
 * من يشغل مقاعد فترة الصاحب `termId`: أفرادها (فعّال أو مدعو)، ودعوات معلّقة
 * أُرسلت من فترة سابقة لنفس الباقة (تُقبل على الفترة الحيّة). كان العدّ على
 * الفترة وحدها، فتختفي الدعوات القديمة بعد التجديد ويُدعى غيرها مكانها، ثم
 * تُقبل القديمة فوق العدد.
 */
async function seatRows(
  runner: Tx | typeof db,
  ownerUserId: string,
  termId: string,
  planId: string | null,
) {
  return runner
    .select({
      id: planMembers.id,
      email: planMembers.inviteEmail,
      status: planMembers.status,
    })
    .from(planMembers)
    .innerJoin(entitlements, eq(entitlements.id, planMembers.ownerEntitlementId))
    .where(
      and(
        eq(planMembers.ownerUserId, ownerUserId),
        ne(planMembers.status, 'removed'),
        planId === null
          ? eq(planMembers.ownerEntitlementId, termId)
          : or(
              eq(planMembers.ownerEntitlementId, termId),
              and(
                eq(planMembers.status, 'invited'),
                eq(entitlements.planId, planId),
                isNull(entitlements.revokedAt),
              ),
            ),
      ),
    )
}

/** باقات المستخدم العائلية الحيّة التي يملكها (لا المُشاركة معه) وأفرادها. */
export async function listFamilyPlans(ownerUserId: string): Promise<FamilyPlanView[]> {
  const now = new Date()
  const owned = await db
    .select({
      id: entitlements.id,
      planId: entitlements.planId,
      name: plans.name,
      maxMembers: plans.maxMembers,
    })
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

  return Promise.all(
    owned.map(async (row) => ({
      entitlementId: row.id,
      planName: row.name,
      maxMembers: row.maxMembers,
      members: (await seatRows(db, ownerUserId, row.id, row.planId)).map((member) => ({
        id: member.id,
        email: member.email,
        status: member.status === 'active' ? ('active' as const) : ('invited' as const),
      })),
    })),
  )
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

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]
type Entitlement = typeof entitlements.$inferSelect

/**
 * فترات الصاحب على نفس الباقة: الحالية (إن وُجدت) ثم التجديدات المؤجَّلة.
 * الفرد يُضاف لكلها، فلا يخرج عند بدء التجديد ولا يدخل التجديد خلسةً بعد إزالته.
 */
async function ownerTerms(tx: Tx, ownerUserId: string, planId: string, now: Date) {
  return tx
    .select()
    .from(entitlements)
    .where(
      and(
        eq(entitlements.userId, ownerUserId),
        eq(entitlements.planId, planId),
        isNull(entitlements.sharedByUserId),
        isNull(entitlements.revokedAt),
        or(isNull(entitlements.expiresAt), gt(entitlements.expiresAt, now)),
      ),
    )
    .orderBy(entitlements.startsAt)
}

/** يضيف الفرد لتجديدات الصاحب المؤجَّلة (بعد `current`). */
async function grantLaterTerms(
  tx: Tx,
  current: Entitlement,
  memberUserId: string,
  email: string,
  now: Date,
): Promise<void> {
  if (current.planId === null) return
  const terms = await ownerTerms(tx, current.userId, current.planId, now)
  for (const term of terms) {
    if (term.id === current.id || term.startsAt <= now) continue
    const memberEntitlementId = await grantMember(tx, term, memberUserId)
    await tx.insert(planMembers).values({
      ownerEntitlementId: term.id,
      ownerUserId: current.userId,
      inviteEmail: email,
      memberUserId,
      memberEntitlementId,
      status: 'active',
    })
  }
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

    const existing = await seatRows(tx, ownerUserId, ownerEntitlementId, owner.entitlement.planId)
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
      await grantLaterTerms(tx, owner.entitlement, member.id, email, now)
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
  | { ok: false; error: 'invalid' | 'wrong_account' | 'expired' | 'full'; email?: string }

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
    if (row.owner.userId === userId) return { ok: false as const, error: 'invalid' as const }

    // الدعوة مرتبطة بفترة الصاحب التي كانت حيّة عند الإرسال. إن جُدّدت الباقة
    // منذ ذلك، تُقبل على الفترة الحيّة الآن لنفس الباقة.
    let current: Entitlement | undefined =
      row.owner.revokedAt === null &&
      row.owner.startsAt <= now &&
      (row.owner.expiresAt === null || row.owner.expiresAt > now)
        ? row.owner
        : undefined
    if (current === undefined && row.owner.planId !== null && row.owner.revokedAt === null) {
      const terms = await ownerTerms(tx, row.owner.userId, row.owner.planId, now)
      current = terms.find((term) => term.startsAt <= now)
    }
    if (current === undefined) return { ok: false as const, error: 'expired' as const }

    const [plan] =
      current.planId === null
        ? []
        : await tx
            .select({ maxMembers: plans.maxMembers })
            .from(plans)
            .where(eq(plans.id, current.planId))
            .limit(1)
    const others = (await seatRows(tx, current.userId, current.id, current.planId)).filter(
      (seat) => seat.id !== row.invite.id,
    )
    if (others.length >= (plan?.maxMembers ?? 1) - 1) {
      return { ok: false as const, error: 'full' as const }
    }

    const memberEntitlementId = await grantMember(tx, current, userId)
    await tx
      .update(planMembers)
      .set({
        status: 'active',
        ownerEntitlementId: current.id,
        memberUserId: userId,
        memberEntitlementId,
        tokenHash: null,
      })
      .where(eq(planMembers.id, row.invite.id))
    await grantLaterTerms(tx, current, userId, row.invite.inviteEmail, now)
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
    const [target] = await tx
      .select({ email: planMembers.inviteEmail, planId: entitlements.planId })
      .from(planMembers)
      .innerJoin(entitlements, eq(entitlements.id, planMembers.ownerEntitlementId))
      .where(
        and(
          eq(planMembers.id, memberRowId),
          eq(planMembers.ownerUserId, ownerUserId),
          ne(planMembers.status, 'removed'),
        ),
      )
      .limit(1)
    if (!target) return false

    // الإزالة تشمل نسخه على تجديدات الصاحب المؤجَّلة لنفس الباقة — وإلا بقي
    // يدخل بنسخة التجديد ويُضاف غيره مكانه (أكثر من عدد المقاعد).
    const termIds =
      target.planId === null
        ? []
        : (
            await tx
              .select({ id: entitlements.id })
              .from(entitlements)
              .where(
                and(
                  eq(entitlements.userId, ownerUserId),
                  eq(entitlements.planId, target.planId),
                  isNull(entitlements.sharedByUserId),
                ),
              )
          ).map((row) => row.id)

    const rows = await tx
      .update(planMembers)
      .set({ status: 'removed', tokenHash: null })
      .where(
        and(
          eq(planMembers.ownerUserId, ownerUserId),
          eq(planMembers.inviteEmail, target.email),
          ne(planMembers.status, 'removed'),
          termIds.length > 0
            ? or(eq(planMembers.id, memberRowId), inArray(planMembers.ownerEntitlementId, termIds))
            : eq(planMembers.id, memberRowId),
        ),
      )
      .returning({ memberEntitlementId: planMembers.memberEntitlementId })
    const ids = rows.flatMap((row) => (row.memberEntitlementId ? [row.memberEntitlementId] : []))
    if (ids.length > 0) {
      await tx
        .update(entitlements)
        .set({ revokedAt: new Date(), revokedReason: 'removed from family plan by owner' })
        .where(and(inArray(entitlements.id, ids), isNull(entitlements.revokedAt)))
    }
    return true
  })
}

/**
 * تجديد باقة عائلية: صلاحية الصاحب الجديدة صف جديد، فينقل إليه أفراده (الوثيقة
 * 13.3). الأعضاء الفعّالون يحصلون على نسخة بمدة التجديد نفسها. يحترم حد
 * الأفراد الحالي للباقة. داخل معاملة الدفع نفسها — لا لحظة يكون فيها الصاحب مجدِّداً والأفراد خارجها.
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
    .where(and(eq(planMembers.ownerEntitlementId, previous.id), eq(planMembers.status, 'active')))
    .orderBy(planMembers.createdAt)

  let moved = 0
  for (const member of members.slice(0, plan.maxMembers - 1)) {
    // الدعوات المعلّقة تبقى على فترتها: القبول يجد الفترة الحيّة لنفس الباقة،
    // ويضيف الفرد للتجديدات المؤجَّلة أيضاً (`grantLaterTerms`).
    if (member.status === 'active' && member.memberUserId !== null) {
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
