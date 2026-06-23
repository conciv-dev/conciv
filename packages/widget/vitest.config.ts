import solid from 'vite-plugin-solid'
import {playwright} from '@vitest/browser-playwright'
import {defineConfig} from 'vitest/config'

// Two projects. `widget` (node): the http-server-backed integration tests that drive the built global
// bundle in Chromium via Playwright. `widget-browser`: real-browser component tests that render the
// widget's own Solid source (compiled on the fly by vite-plugin-solid) — used for extension rendering,
// where the test module and the widget share ONE module graph so @mandarax/extension's runtime context
// is the same instance the Component reads via useContext. Real browser, real Solid, no jsdom.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'widget',
          environment: 'node',
          include: ['test/**/*.test.ts'],
          testTimeout: 90_000,
          hookTimeout: 90_000,
        },
      },
      {
        plugins: [solid()],
        test: {
          name: 'widget-browser',
          include: ['test/**/*.browser.test.tsx'],
          testTimeout: 90_000,
          hookTimeout: 90_000,
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({}),
            instances: [{browser: 'chromium'}],
          },
        },
      },
    ],
  },
})
