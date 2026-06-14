import {defineConfig} from 'vitest/config'

// The widget's browser integration tests: each boots a tiny Node http server that serves a
// page embedding the real built global bundle + scripted /__pw/* endpoints, then drives the
// widget in a real Chromium via Playwright. Real transport, real browser, real bundle —
// scripted fixtures, no mocks. A dedicated vitest config (taking precedence over vite.config
// .ts, which is the lib build) keeps the test runner out of the widget's build pipeline.
export default defineConfig({
  test: {
    name: 'widget',
    environment: 'node',
    include: ['test/**/*.test.ts'],
    testTimeout: 90_000,
    hookTimeout: 90_000,
  },
})
