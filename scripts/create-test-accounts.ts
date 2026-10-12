/**
 * حسابات اختبار لكل دور — للتجربة على نسخة الإنتاج (staging أو قبل الإطلاق).
 *
 * التشغيل (داخل حاوية الـ worker، أو محلياً مع DATABASE_URL و BETTER_AUTH_SECRET):
 *   pnpm exec tsx scripts/create-test-accounts.ts                 # إنشاء/تحديث
 *   pnpm exec tsx scripts/create-test-accounts.ts --domain qa.example.com
 *   pnpm exec tsx scripts/create-test-accounts.ts --password 'Secret#2026'
 *   pnpm exec tsx scripts/create-test-accounts.ts --remove        # حذف كل حسابات الاختبار
 *
 * ما يُنشأ (كلمة مرور واحدة للجميع، تُطبع في النهاية):
 *   admin@…           مدير — 2FA مفعّل مسبقاً (يُطبع السر ورابط otpauth ورموز الاسترداد)
 *   staff@…           موظف — 2FA مفعّل مسبقاً
 *   customer@…        مستخدم مسجّل بلا باقة
 *   map@…             باقة خريطة 30 يوماً، جهازان
 *   vip@…             باقة VIP 30 يوماً، 3 أجهزة
 *   basic@…           باقة PDF فقط (بلا خريطة)
 *   family@…          صاحب باقة عائلية (3 أفراد) + family-member@… فرد فعّال
 *   +628100000099     حساب بالجوال فقط (بلا بريد) — يدخل برقم الجوال
 *   suspended@…       حساب معلّق لحين المراجعة (لتجربة رسالة التعليق)
 *
 * الباقات تُنشأ كمسودات باسم "TEST · …" (لا تظهر للبيع). كل الحسابات في نطاق
 * واحد (افتراضياً test.balitrips.local) فتُحذف كلها بـ --remove.
 *
 * كلمات المرور تُشفَّر بـ `hashPassword` من Better Auth نفسه — نفس الدالة التي
 * يتحقق بها الدخول، فلا طريقان مختلفان للتشفير.
 */

import { randomBytes } from 'node:crypto'

import { and, eq, inArray, isNull, like } from 'drizzle-orm'

import { db } from '@/db'
import {
  accounts,
  devices,
  entitlements,
  planMembers,
  plans,
  sessions,
  users,
  verifications,
} from '@/db/schema'
import { placeholderEmailFor } from '@/lib/auth/phone'
import {
  generateRecoveryCodes,
  generateSecret,
  hashRecoveryCode,
  otpauthUri,
  sealSecret,
  TWO_FACTOR_PREFIXES,
} from '@/lib/auth/totp'

type Role = 'admin' | 'staff' | 'customer'
type Kind = 'map_access' | 'vip' | 'basic'

interface Spec {
  local: string
  name: string
  role: Role
  phone: string
  plan?: 'map' | 'vip' | 'basic' | 'family'
  phoneOnly?: boolean
  status?: 'active' | 'suspended'
  twoFactor?: boolean
}

const PLAN_SPECS: Record<
  'map' | 'vip' | 'basic' | 'family',
  { slug: string; name: string; kind: Kind; days: number; devices: number; members: number }
> = {
  map: {
    slug: 'test-map',
    name: 'TEST · Map 30 days',
    kind: 'map_access',
    days: 30,
    devices: 2,
    members: 1,
  },
  vip: {
    slug: 'test-vip',
    name: 'TEST · VIP 30 days',
    kind: 'vip',
    days: 30,
    devices: 3,
    members: 1,
  },
  basic: {
    slug: 'test-basic',
    name: 'TEST · PDF only',
    kind: 'basic',
    days: 30,
    devices: 2,
    members: 1,
  },
  family: {
    slug: 'test-family',
    name: 'TEST · Family',
    kind: 'map_access',
    days: 30,
    devices: 2,
    members: 3,
  },
}

function arg(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`)
  return index === -1 ? null : (process.argv[index + 1] ?? null)
}

const DOMAIN = (
  arg('domain') ??
  process.env.TEST_ACCOUNT_DOMAIN ??
  'test.balitrips.local'
).toLowerCase()
const REMOVE = process.argv.includes('--remove')
const PASSWORD =
  arg('password') ??
  process.env.TEST_ACCOUNT_PASSWORD ??
  `Bali-${randomBytes(6).toString('base64url')}-26`

const SPECS: Spec[] = [
  { local: 'admin', name: 'Test Admin', role: 'admin', phone: '+628100000001', twoFactor: true },
  { local: 'staff', name: 'Test Staff', role: 'staff', phone: '+628100000002', twoFactor: true },
  { local: 'customer', name: 'Test Customer', role: 'customer', phone: '+628100000003' },
  { local: 'map', name: 'Test Map Holder', role: 'customer', phone: '+628100000004', plan: 'map' },
  { local: 'vip', name: 'Test VIP', role: 'customer', phone: '+628100000005', plan: 'vip' },
  {
    local: 'basic',
    name: 'Test PDF Only',
    role: 'customer',
    phone: '+628100000006',
    plan: 'basic',
  },
  {
    local: 'family',
    name: 'Test Family Owner',
    role: 'customer',
    phone: '+628100000007',
    plan: 'family',
  },
  { local: 'family-member', name: 'Test Family Member', role: 'customer', phone: '+628100000008' },
  {
    local: 'phone-only',
    name: 'Test Phone Only',
    role: 'customer',
    phone: '+628100000099',
    phoneOnly: true,
  },
  {
    local: 'suspended',
    name: 'Test Suspended',
    role: 'customer',
    phone: '+628100000010',
    status: 'suspended',
  },
]

const emailOf = (spec: Spec) =>
  spec.phoneOnly ? placeholderEmailFor(spec.phone) : `${spec.local}@${DOMAIN}`

async function loadHashPassword(): Promise<(password: string) => Promise<string>> {
  try {
    const mod = (await import('better-auth/crypto')) as {
      hashPassword?: (password: string) => Promise<string>
    }
    if (typeof mod.hashPassword === 'function') return mod.hashPassword
  } catch {
    // handled below
  }
  throw new Error(
    'better-auth/crypto hashPassword is not available. Run inside the worker image (pnpm install done).',
  )
}

/**
 * Removes the test accounts in ONE transaction (all or nothing).
 *
 * Sign-in material, devices and access grants are deleted outright. The user
 * row itself is deleted only if nothing else points at it; an account that
 * placed orders, wrote reviews or appears in the audit log keeps its row
 * (financial and audit history are never rewritten) but is pseudonymised and
 * closed — the same treatment as Studio → Customers → Delete. TEST plans that
 * an order still references stay as drafts (never on sale).
 */
async function removeAll(): Promise<void> {
  const emails = SPECS.map(emailOf)
  const summary = await db.transaction(async (tx) => {
    const rows = await tx
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(inArray(users.email, emails))
    const ids = rows.map((row) => row.id)
    let deleted = 0
    let closed = 0
    if (ids.length > 0) {
      await tx.delete(planMembers).where(inArray(planMembers.ownerUserId, ids))
      await tx.delete(planMembers).where(inArray(planMembers.memberUserId, ids))
      await tx.delete(sessions).where(inArray(sessions.userId, ids))
      await tx.delete(accounts).where(inArray(accounts.userId, ids))
      for (const id of ids) {
        await tx.delete(verifications).where(like(verifications.identifier, `%${id}%`))
      }
      for (const id of ids) {
        // Savepoint per account: a foreign-key refusal rolls back only this try.
        const gone = await tx
          .transaction(async (sp) => {
            await sp.delete(entitlements).where(eq(entitlements.userId, id))
            await sp.delete(devices).where(eq(devices.userId, id))
            await sp.delete(users).where(eq(users.id, id))
            return true
          })
          .catch(() => false)
        if (gone) {
          deleted += 1
          continue
        }
        await tx
          .update(entitlements)
          .set({ revokedAt: new Date(), revokedReason: 'test account removed' })
          .where(and(eq(entitlements.userId, id), isNull(entitlements.revokedAt)))
        await tx.update(devices).set({ status: 'revoked' }).where(eq(devices.userId, id))
        await tx
          .update(users)
          .set({
            email: `deleted+${id}@invalid.local`,
            name: 'Removed test account',
            phone: null,
            phoneNormalized: null,
            phoneVerifiedAt: null,
            status: 'inactive',
            twoFactorEnabled: false,
            twoFactorSecret: null,
            deletedAt: new Date(),
          })
          .where(eq(users.id, id))
        closed += 1
      }
    }
    let plansKept = 0
    for (const spec of Object.values(PLAN_SPECS)) {
      const gone = await tx
        .transaction(async (sp) => {
          await sp.delete(plans).where(eq(plans.slug, spec.slug))
          return true
        })
        .catch(() => false)
      if (!gone) plansKept += 1
    }
    return { deleted, closed, plansKept }
  })
  console.log(
    `Removed ${summary.deleted} test account(s); closed and pseudonymised ${summary.closed} that have orders or history; ` +
      `TEST plans removed${summary.plansKept > 0 ? ` (${summary.plansKept} kept as draft — referenced by orders)` : ''}.`,
  )
}

async function ensurePlan(key: keyof typeof PLAN_SPECS) {
  const spec = PLAN_SPECS[key]
  const [existing] = await db.select().from(plans).where(eq(plans.slug, spec.slug)).limit(1)
  if (existing) return existing
  const [row] = await db
    .insert(plans)
    .values({
      slug: spec.slug,
      name: { en: spec.name, ar: spec.name, id: spec.name },
      priceMinor: 0,
      currency: 'USD',
      entitlementKind: spec.kind,
      durationDays: spec.days,
      deviceLimit: spec.devices,
      maxMembers: spec.members,
      canUseTrip: true,
      canSaveFavorites: true,
      canDownloadPdf: true,
      status: 'draft',
    })
    .returning()
  if (!row) throw new Error(`could not create plan ${spec.slug}`)
  return row
}

async function upsertUser(spec: Spec, passwordHash: string): Promise<string> {
  const email = emailOf(spec)
  const now = new Date()
  const values = {
    email,
    name: spec.name,
    phone: spec.phone,
    phoneNormalized: spec.phone,
    phoneVerifiedAt: now,
    emailVerifiedAt: spec.phoneOnly ? null : now,
    country: 'ID',
    locale: 'ar',
    role: spec.role,
    status: spec.status ?? 'active',
    banReason: spec.status === 'suspended' ? 'TEST: suspended pending review' : null,
    deletedAt: null,
  }
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1)
  // رقم الجوال فريد: حرّره إن كان عند حساب آخر غير اختباري.
  const [phoneOwner] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.phoneNormalized, spec.phone))
    .limit(1)
  if (phoneOwner && phoneOwner.email !== email) {
    throw new Error(`The number ${spec.phone} already belongs to ${phoneOwner.email}. Edit SPECS.`)
  }

  let userId: string
  if (existing) {
    await db.update(users).set(values).where(eq(users.id, existing.id))
    userId = existing.id
  } else {
    const [row] = await db.insert(users).values(values).returning({ id: users.id })
    if (!row) throw new Error(`insert failed for ${email}`)
    userId = row.id
  }

  const [credential] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.providerId, 'credential')))
    .limit(1)
  if (credential) {
    await db.update(accounts).set({ passwordHash }).where(eq(accounts.id, credential.id))
  } else {
    await db
      .insert(accounts)
      .values({ userId, providerId: 'credential', accountId: userId, passwordHash })
  }
  return userId
}

async function enrolTwoFactor(userId: string, email: string) {
  const secret = generateSecret()
  const codes = generateRecoveryCodes()
  await db
    .update(users)
    .set({ twoFactorSecret: sealSecret(secret), twoFactorEnabled: true })
    .where(eq(users.id, userId))
  const identifier = `${TWO_FACTOR_PREFIXES.recovery}${userId}`
  await db.delete(verifications).where(eq(verifications.identifier, identifier))
  await db.insert(verifications).values({
    identifier,
    value: JSON.stringify(codes.map(hashRecoveryCode)),
    expiresAt: new Date('2100-01-01T00:00:00Z'),
  })
  return { secret, codes, uri: otpauthUri({ secret, account: email, issuer: 'Bali Trips' }) }
}

async function grantPlan(userId: string, key: keyof typeof PLAN_SPECS) {
  const plan = await ensurePlan(key)
  await db
    .delete(entitlements)
    .where(and(eq(entitlements.userId, userId), eq(entitlements.planId, plan.id)))
  const startsAt = new Date()
  const [row] = await db
    .insert(entitlements)
    .values({
      userId,
      kind: plan.entitlementKind,
      planId: plan.id,
      startsAt,
      expiresAt: new Date(startsAt.getTime() + PLAN_SPECS[key].days * 86_400_000),
      deviceLimit: plan.deviceLimit,
    })
    .returning()
  if (!row) throw new Error('entitlement insert failed')
  return row
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set')
  if (REMOVE) {
    await removeAll()
    return
  }
  if (!process.env.BETTER_AUTH_SECRET) {
    throw new Error('BETTER_AUTH_SECRET is not set (needed to seal the admin 2FA secrets)')
  }

  const hashPassword = await loadHashPassword()
  const passwordHash = await hashPassword(PASSWORD)
  const ids = new Map<string, string>()
  const twoFactor: { email: string; secret: string; uri: string; codes: string[] }[] = []

  for (const spec of SPECS) {
    const userId = await upsertUser(spec, passwordHash)
    ids.set(spec.local, userId)
    if (spec.twoFactor)
      twoFactor.push({ email: emailOf(spec), ...(await enrolTwoFactor(userId, emailOf(spec))) })
    if (spec.plan) await grantPlan(userId, spec.plan)
  }

  // الباقة العائلية: الفرد يحصل على نسخة من صلاحية الصاحب (كما يفعل القبول الحقيقي).
  const ownerId = ids.get('family')
  const memberId = ids.get('family-member')
  if (ownerId && memberId) {
    const plan = await ensurePlan('family')
    const [owner] = await db
      .select()
      .from(entitlements)
      .where(and(eq(entitlements.userId, ownerId), eq(entitlements.planId, plan.id)))
      .limit(1)
    if (owner) {
      await db.delete(planMembers).where(eq(planMembers.ownerUserId, ownerId))
      await db
        .delete(entitlements)
        .where(and(eq(entitlements.userId, memberId), eq(entitlements.planId, plan.id)))
      const [memberEntitlement] = await db
        .insert(entitlements)
        .values({
          userId: memberId,
          kind: owner.kind,
          planId: owner.planId,
          startsAt: owner.startsAt,
          expiresAt: owner.expiresAt,
          deviceLimit: owner.deviceLimit,
          sharedByUserId: ownerId,
        })
        .returning({ id: entitlements.id })
      await db.insert(planMembers).values({
        ownerEntitlementId: owner.id,
        ownerUserId: ownerId,
        inviteEmail: `family-member@${DOMAIN}`,
        memberUserId: memberId,
        memberEntitlementId: memberEntitlement?.id ?? null,
        status: 'active',
      })
    }
  }

  const line = '─'.repeat(78)
  console.log(`\n${line}\nBALI TRIPS — TEST ACCOUNTS (production)\n${line}`)
  console.log(`Password for every account: ${PASSWORD}\n`)
  const rows: [string, string, string][] = [
    ['Admin (2FA)', `admin@${DOMAIN}`, 'Studio: /<ADMIN_BASE_PATH> — full access'],
    ['Staff (2FA)', `staff@${DOMAIN}`, 'Studio without refunds, plans, roles, bans, exports'],
    ['Customer', `customer@${DOMAIN}`, 'Registered, no plan'],
    ['Map plan', `map@${DOMAIN}`, 'Paid map 30 days · 2 devices'],
    ['VIP plan', `vip@${DOMAIN}`, 'VIP + Hidden Gems 30 days · 3 devices'],
    ['PDF only', `basic@${DOMAIN}`, 'Plan without map (PDF / My Trip / favorites)'],
    ['Family owner', `family@${DOMAIN}`, 'Family plan (3 people), 1 member already added'],
    ['Family member', `family-member@${DOMAIN}`, "Map via the owner's family plan"],
    ['Phone only', '+628100000099', 'Sign in with the mobile number (no email)'],
    ['Suspended', `suspended@${DOMAIN}`, 'Shows "suspended pending review"'],
  ]
  for (const [role, login, note] of rows) {
    console.log(`  ${role.padEnd(15)} ${login.padEnd(38)} ${note}`)
  }
  console.log(`\nTwo-factor for admin / staff — add to Google Authenticator / 1Password:`)
  for (const entry of twoFactor) {
    console.log(`\n  ${entry.email}`)
    console.log(`    secret:   ${entry.secret}`)
    console.log(`    otpauth:  ${entry.uri}`)
    console.log(`    recovery: ${entry.codes.join('  ')}`)
  }
  console.log(
    `\nRemove them all later:  ./deploy/start-production.sh --remove-test-accounts` +
      `   (Windows: deploy\\start-production.cmd remove-test-accounts)\n${line}\n`,
  )
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(
      '\n  create-test-accounts failed:',
      error instanceof Error ? error.message : error,
    )
    process.exit(1)
  })
