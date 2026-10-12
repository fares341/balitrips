import { closeAppPool, sweepFixtures } from './support'

/**
 * Runs once, in the Vitest main process, before any test file.
 *
 * Its only job is to make the suite re-runnable after a bad day. Per-test
 * teardown handles the normal case; nothing can handle a worker killed
 * mid-transaction except a sweep on the way in. Fixtures are prefixed and
 * dated in 2099 precisely so this can be aggressive without ever touching
 * real content.
 *
 * The pool is closed on the way out because this process is not a test
 * worker: nothing else here will use the connection, and an open one keeps
 * the runner alive after the last report.
 */
export async function setup(): Promise<void> {
  const removed = await sweepFixtures()
  if (removed > 0) {
    console.warn(
      `[integration] swept ${removed} leftover fixture rows from an earlier run. ` +
        'A previous run did not finish its teardown.',
    )
  }
  await closeAppPool()
}
