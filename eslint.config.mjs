import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'
import nextTypeScript from 'eslint-config-next/typescript'

/** @type {import('eslint').Linter.Config[]} */
const config = [
  {
    ignores: [
      'design/**',
      'design-reference/**',
      '.next/**',
      'node_modules/**',
      'drizzle/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'next-env.d.ts',
    ],
  },

  ...nextCoreWebVitals,
  ...nextTypeScript,

  {
    rules: {
      // Money and dates are the two places this project cannot afford
      // sloppiness — surface unused values rather than letting a dropped
      // variable silently change a total.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-floating-promises': 'off',
    },
  },
]

export default config
