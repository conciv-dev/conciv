import {defineConfig} from 'vitest/config'
import {playwright} from '@vitest/browser-playwright'
import solidPlugin from 'vite-plugin-solid'
import UnoCSS from 'unocss/vite'
import {browserOptimizeDeps, ciTest, ciTestSolidBrowser, HOOK_TIMEOUT_MS, TEST_TIMEOUT_MS} from '@conciv/vitest-config'

export default defineConfig({
  resolve: {conditions: ['browser', 'development']},
  ssr: {resolve: {conditions: ['browser', 'development'], externalConditions: ['browser', 'development']}},
  test: {
    ...ciTest(),
    projects: [
      {
        extends: true,
        plugins: [solidPlugin(), UnoCSS({content: {filesystem: ['src/**/*.{ts,tsx}', 'test/**/*.{ts,tsx}']}})],
        optimizeDeps: browserOptimizeDeps(),
        test: {
          name: 'ui-kit-chat-tools-browser',
          include: ['test/**/*.browser.test.tsx'],
          testTimeout: TEST_TIMEOUT_MS,
          hookTimeout: HOOK_TIMEOUT_MS,
          setupFiles: ciTestSolidBrowser().setupFiles,
          fileParallelism: false,
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({contextOptions: {permissions: ['clipboard-read', 'clipboard-write']}}),
            instances: [{browser: 'chromium'}],
          },
        },
      },
    ],
  },
})
