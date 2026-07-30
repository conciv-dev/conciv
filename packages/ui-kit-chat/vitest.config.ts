import {defineConfig} from 'vitest/config'
import solid from 'vite-plugin-solid'
import {playwright} from '@vitest/browser-playwright'
import {ciTest} from '@conciv/vitest-config'

export default defineConfig({
  resolve: {conditions: ['browser', 'development']},
  ssr: {resolve: {conditions: ['browser', 'development'], externalConditions: ['browser', 'development']}},
  test: {
    ...ciTest(),
    projects: [
      {
        extends: true,
        test: {
          name: 'ui-kit-chat',
          environment: 'node',
          include: ['test/**/*.test.ts'],
          server: {deps: {inline: ['solid-js']}},
        },
      },
      {
        plugins: [solid()],
        test: {
          name: 'ui-kit-chat-browser',
          include: ['test/**/*.browser.test.tsx'],
          browser: {enabled: true, headless: true, provider: playwright({}), instances: [{browser: 'chromium'}]},
        },
      },
    ],
  },
})
