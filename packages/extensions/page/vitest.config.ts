import {defineConfig} from 'vitest/config'
import {playwright} from '@vitest/browser-playwright'
import {ciTest} from '@conciv/vitest-config'

export default defineConfig({
  esbuild: {jsx: 'automatic', jsxImportSource: 'react'},
  test: {
    ...ciTest(),
    include: ['test/**/*.browser.test.ts', 'test/**/*.browser.test.tsx'],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright({}),
      instances: [{browser: 'chromium'}],
    },
  },
})
