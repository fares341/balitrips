import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto'

/**
 * TOTP (RFC 6238) and recovery codes.
 *
 * `roles.ts` states that two-factor is mandatory for any elevated role, and
 * `auth/server.ts` records why it was not enforced: Better Auth's two-factor
 * plugin wants a `twoFactor` table this schema does not have. So the flag sat
 * there, `requiresTwoFactor()` was never called, and an admin account was one
 * reused password away from full compromise.
 *
 * This closes it without a migration. The schema already has everything the
 * standard needs:
 *
 *  - `users.two_factor_secret` — the shared secret, ENCRYPTED at rest (see
 *    below), never stored raw.
 *  - `users.two_factor_enabled` — false until a code has been verified, so a
 *    half-finished enrolment cannot lock anyone out.
 *  - `verifications` — Better Auth's generic identifier/value/expiry store,
 *    used here under three reserved prefixes for the per-session "this
 *    session has passed the challenge" marker, the hashed recovery codes,
 *    and the replay guard. Rows expire, and Better Auth's own cleanup
 *    removes them.
 *
 * WHY THE SECRET IS ENCRYPTED AND THE RECOVERY CODES ARE HASHED. A TOTP
 * secret must be recoverable to verify a code, so it cannot be hashed — it is
 * sealed with AES-256-GCM under a key derived from `BETTER_AUTH_SECRET`,
 * which means a leaked database dump alone does not yield working second
 * factors. Recovery codes are only ever compared, so they are hashed and the
 * plaintext exists exactly once, on the screen that generated them.
 */

const DIGITS = 6
const PERIOD_SECONDS = 30

/**
 * Accepted clock drift, in periods either side of now.
 *
 * One step (±30s) is the usual compromise: phones drift, and a user who
 * starts typing at second 29 submits at second 31. Wider windows multiply the
 * number of codes valid at any instant.
 */
const DRIFT_STEPS = 1

const RECOVERY_CODE_COUNT = 10

/** Reserved `verifications.identifier` prefixes. */
const SESSION_PREFIX = 'two-factor:session:'
const RECOVERY_PREFIX = 'two-factor:recovery:'
const REPLAY_PREFIX = 'two-factor:last-step:'

export const TWO_FACTOR_PREFIXES = {
  session: SESSION_PREFIX,
  recovery: RECOVERY_PREFIX,
  replay: REPLAY_PREFIX,
} as const

/* --------------------------------------------------------------------------
   Base32 (RFC 4648) — the alphabet every authenticator app expects
   -------------------------------------------------------------------------- */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0
  let value = 0
  let out = ''

  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31]

  // No `=` padding: it is optional in RFC 4648 and several authenticator
  // apps reject a secret that contains it.
  return out
}

export function base32Decode(text: string): Uint8Array {
  const clean = text.toUpperCase().replace(/[\s=-]/g, '')
  const bytes: number[] = []
  let bits = 0
  let value = 0

  for (const char of clean) {
    const index = ALPHABET.indexOf(char)
    if (index === -1) throw new Error('That is not a valid base32 secret.')
    value = (value << 5) | index
    bits += 5
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }

  return Uint8Array.from(bytes)
}

/* --------------------------------------------------------------------------
   The algorithm
   -------------------------------------------------------------------------- */

/** 160 bits, the size RFC 4226 recommends for HMAC-SHA1. */
export function generateSecret(): string {
  return base32Encode(randomBytes(20))
}

function counterBuffer(step: number): Buffer {
  const buffer = Buffer.alloc(8)
  // 64-bit counter. `writeBigUInt64BE` because a step past 2^32 is a real
  // date (year 6053), and silently truncating would be a lovely bug to debug.
  buffer.writeBigUInt64BE(BigInt(step))
  return buffer
}

export function stepFor(now: Date | number): number {
  const millis = typeof now === 'number' ? now : now.getTime()
  return Math.floor(millis / 1000 / PERIOD_SECONDS)
}

/** The code for one time step. */
export function totpCode(secret: string, step: number): string {
  const digest = createHmac('sha1', Buffer.from(base32Decode(secret)))
    .update(counterBuffer(step))
    .digest()

  // Dynamic truncation, RFC 4226 section 5.3.
  const offset = (digest[digest.length - 1] ?? 0) & 0x0f
  const binary =
    (((digest[offset] ?? 0) & 0x7f) << 24) |
    (((digest[offset + 1] ?? 0) & 0xff) << 16) |
    (((digest[offset + 2] ?? 0) & 0xff) << 8) |
    ((digest[offset + 3] ?? 0) & 0xff)

  return String(binary % 10 ** DIGITS).padStart(DIGITS, '0')
}

export interface VerifyResult {
  valid: boolean
  /** The step the code belonged to, for replay rejection. */
  step: number
}

/**
 * Verify a submitted code.
 *
 * Compared in constant time, and across a drift window. The caller must
 * reject a step it has already accepted — a code stays valid for the whole
 * period, and without that check a shoulder-surfed code can be replayed
 * inside it.
 */
export function verifyTotp(
  secret: string,
  submitted: string,
  options: { now?: Date; drift?: number } = {},
): VerifyResult {
  const code = submitted.replace(/\D/g, '')
  if (code.length !== DIGITS) return { valid: false, step: -1 }

  const current = stepFor(options.now ?? new Date())
  const drift = options.drift ?? DRIFT_STEPS

  for (let offset = -drift; offset <= drift; offset++) {
    const step = current + offset
    if (constantTimeEquals(totpCode(secret, step), code)) return { valid: true, step }
  }

  return { valid: false, step: -1 }
}

export function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8')
  const right = Buffer.from(b, 'utf8')
  // timingSafeEqual throws on a length mismatch, which is itself a leak of
  // one bit — hash first so the comparison is always over 32 bytes.
  const leftHash = createHash('sha256').update(left).digest()
  const rightHash = createHash('sha256').update(right).digest()
  return timingSafeEqual(leftHash, rightHash)
}

/**
 * The URI an authenticator app consumes.
 *
 * The issuer appears twice — as a label prefix and as a parameter — because
 * older apps read only one of the two, and getting it wrong shows the user an
 * unlabelled entry they cannot tell apart from any other.
 */
export function otpauthUri(options: { secret: string; account: string; issuer: string }): string {
  const label = `${encodeURIComponent(options.issuer)}:${encodeURIComponent(options.account)}`
  const query = new URLSearchParams({
    secret: options.secret,
    issuer: options.issuer,
    algorithm: 'SHA1',
    digits: String(DIGITS),
    period: String(PERIOD_SECONDS),
  })
  return `otpauth://totp/${label}?${query.toString()}`
}

/** Grouped into blocks of four, which is how people read them back. */
export function formatSecretForDisplay(secret: string): string {
  return secret.replace(/(.{4})/g, '$1 ').trim()
}

/* --------------------------------------------------------------------------
   Secret sealing
   -------------------------------------------------------------------------- */

function encryptionKey(): Buffer {
  const secret = process.env.BETTER_AUTH_SECRET
  if (secret === undefined || secret === '') {
    throw new Error(
      'BETTER_AUTH_SECRET is not set, so two-factor secrets cannot be sealed. Refusing to store one in plain text.',
    )
  }
  // A fixed salt is correct here: the input is already a high-entropy secret,
  // and the derivation has to be reproducible across processes.
  return scryptSync(secret, 'bali-trips/totp-secret/v1', 32)
}

export function sealSecret(secret: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv)
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()])
  return [
    'v1',
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    encrypted.toString('base64url'),
  ].join('.')
}

export function openSecret(sealed: string): string {
  const [version, iv, tag, payload] = sealed.split('.')
  if (version !== 'v1' || !iv || !tag || !payload) {
    throw new Error('The stored two-factor secret is not in a format this build understands.')
  }

  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64url'))
  decipher.setAuthTag(Buffer.from(tag, 'base64url'))
  return Buffer.concat([
    decipher.update(Buffer.from(payload, 'base64url')),
    decipher.final(),
  ]).toString('utf8')
}

/* --------------------------------------------------------------------------
   Recovery codes
   -------------------------------------------------------------------------- */

/**
 * Ten single-use codes, shown once.
 *
 * The alphabet excludes the characters people mistranscribe (0/O, 1/I/L),
 * because these are read off a screenshot or a printout under stress — the
 * phone is lost, which is the only time they are ever used.
 */
const RECOVERY_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

export function generateRecoveryCodes(count = RECOVERY_CODE_COUNT): string[] {
  return Array.from({ length: count }, () => {
    const bytes = randomBytes(10)
    const body = Array.from(
      bytes,
      (byte) => RECOVERY_ALPHABET[byte % RECOVERY_ALPHABET.length],
    ).join('')
    return `${body.slice(0, 5)}-${body.slice(5, 10)}`
  })
}

export function normaliseRecoveryCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/**
 * Hash for storage.
 *
 * HMAC rather than a bare digest so a stolen database cannot be attacked with
 * a precomputed table: without `BETTER_AUTH_SECRET` the hashes are inert.
 * A slow KDF is unnecessary — these are 50 bits of uniform randomness, not
 * user-chosen passwords.
 */
export function hashRecoveryCode(code: string): string {
  const secret = process.env.BETTER_AUTH_SECRET ?? ''
  return createHmac('sha256', `${secret}:recovery`)
    .update(normaliseRecoveryCode(code))
    .digest('hex')
}

export function recoveryCodeMatches(code: string, hashes: readonly string[]): string | null {
  const candidate = hashRecoveryCode(code)
  for (const hash of hashes) {
    if (constantTimeEquals(candidate, hash)) return hash
  }
  return null
}
