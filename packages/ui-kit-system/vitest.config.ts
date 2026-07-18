import {defineConfig} from 'vitest/config'
import {playwright} from '@vitest/browser-playwright'
import solidPlugin from 'vite-plugin-solid'
import {ciReporters} from '@conciv/vitest-config'

export default defineConfig({
  plugins: [solidPlugin()],
  test: {
    reporters: ciReporters(),
    name: 'browser',
    include: ['test/**/*.browser.test.ts', 'test/**/*.browser.test.tsx'],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright({}),
      instances: [{browser: 'chromium', launch: {channel: 'chrome'}}],
    },
  },
})
