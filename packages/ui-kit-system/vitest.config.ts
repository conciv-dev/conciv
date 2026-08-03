import {defineConfig} from 'vitest/config'
import {playwright} from '@vitest/browser-playwright'
import solidPlugin from 'vite-plugin-solid'
import UnoCSS from 'unocss/vite'
import {ciTest} from '@conciv/vitest-config'

export default defineConfig({
  test: {
    ...ciTest(),
    projects: [
      {
        plugins: [solidPlugin(), UnoCSS({content: {filesystem: ['src/**/*.{ts,tsx}', 'test/**/*.{ts,tsx}']}})],
        test: {
          name: 'browser',
          include: ['test/**/*.browser.test.ts', 'test/**/*.browser.test.tsx'],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({}),
            instances: [{browser: 'chromium', launch: {channel: 'chrome'}}],
          },
        },
      },
      {
        test: {
          name: 'node',
          environment: 'node',
          include: ['test/**/*.it.test.ts'],
          testTimeout: ciTest().testTimeout,
          hookTimeout: ciTest().hookTimeout,
        },
      },
    ],
  },
})
