import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
    /**
     * `*.integration.test.ts` needs a live, seeded Postgres and commits real
     * rows, so it must never run in the suite that runs on every save. It has
     * its own config — `vitest.integration.config.mts`. Without this exclude
     * the glob above would swallow it, because those files end in `.test.ts`
     * too.
     */
    exclude: ['**/node_modules/**', '**/dist/**', '**/.next/**', 'src/**/*.integration.test.ts'],
    // Keep timezone-dependent logic honest: run in a zone that is neither
    // UTC nor Bali, so any accidental reliance on the host zone fails here
    // rather than in production.
    env: { TZ: 'America/New_York' },
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
})
