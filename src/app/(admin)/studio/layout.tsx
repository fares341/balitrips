import { requireElevated } from '../_lib/session'
import { twoFactorGate } from '../_lib/session'
import { Shell } from '../_ui/shell'

/**
 * The admin shell.
 *
 * Gated on role only, deliberately. This is NOT the authorization boundary —
 * a layout does not re-run for every server action, and a route that somehow
 * rendered outside it would be unguarded. Every page and every action below
 * calls `requireCapability()` for the specific capability it needs, and that
 * is also where the second-factor check happens.
 *
 * The layout cannot perform the second-factor check itself: it wraps the
 * enrolment screen too, so redirecting from here would be an infinite loop
 * for exactly the people who need to reach it.
 */
export const dynamic = 'force-dynamic'

export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  const session = await requireElevated()
  const gate = await twoFactorGate(session)

  return (
    <Shell session={session} twoFactor={gate}>
      {children}
    </Shell>
  )
}
