import {defineConfig} from 'vitest/config'
import {playwright} from '@vitest/browser-playwright'
import solidPlugin from 'vite-plugin-solid'
import UnoCSS from 'unocss/vite'
import {ciTest} from '@conciv/vitest-config'

export default defineConfig({
  resolve: {conditions: ['browser', 'development']},
  ssr: {resolve: {conditions: ['browser', 'development'], externalConditions: ['browser', 'development']}},
  test: {
    ...ciTest(),
    projects: [
      {
        resolve: {conditions: ['browser', 'development']},
        ssr: {resolve: {conditions: ['browser', 'development'], externalConditions: ['browser', 'development']}},
        test: {
          name: 'ui-kit-chat',
          environment: 'node',
          include: ['test/**/*.test.ts'],
          server: {deps: {inline: ['solid-js']}},
          testTimeout: ciTest().testTimeout,
          hookTimeout: ciTest().hookTimeout,
        },
      },
      {
        resolve: {conditions: ['browser', 'development']},
        plugins: [solidPlugin(), UnoCSS({content: {filesystem: ['src/**/*.{ts,tsx}', 'test/**/*.{ts,tsx}']}})],
        test: {
          name: 'ui-kit-chat-browser',
          include: ['test/**/*.browser.test.tsx'],
          testTimeout: ciTest().testTimeout,
          hookTimeout: ciTest().hookTimeout,
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({}),
            instances: [{browser: 'chromium', launch: {channel: 'chrome'}}],
          },
        },
      },
    ],
  },
})
