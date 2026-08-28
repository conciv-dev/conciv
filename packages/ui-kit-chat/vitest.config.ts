import {defineConfig} from 'vitest/config'
import {playwright} from '@vitest/browser-playwright'
import solidPlugin from 'vite-plugin-solid'
import UnoCSS from 'unocss/vite'
import {browserOptimizeDeps, ciTest, ciTestSolidBrowser} from '@conciv/vitest-config'

const HIGHLIGHT_WORKER_LANGUAGES = [
  '@shikijs/langs-precompiled/typescript',
  '@shikijs/langs-precompiled/tsx',
  '@shikijs/langs-precompiled/javascript',
  '@shikijs/langs-precompiled/jsx',
  '@shikijs/langs-precompiled/json',
  '@shikijs/langs-precompiled/css',
  '@shikijs/langs-precompiled/html',
  '@shikijs/langs-precompiled/markdown',
]

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
          testTimeout: ciTest().testTimeout,
          hookTimeout: ciTest().hookTimeout,
        },
      },
      {
        extends: true,
        plugins: [solidPlugin(), UnoCSS({content: {filesystem: ['src/**/*.{ts,tsx}', 'test/**/*.{ts,tsx}']}})],
        optimizeDeps: browserOptimizeDeps(HIGHLIGHT_WORKER_LANGUAGES),
        test: {
          ...ciTestSolidBrowser(),
          name: 'ui-kit-chat-browser',
          include: ['test/**/*.browser.test.tsx'],
          fileParallelism: false,
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
