import {defineConfig} from 'vitest/config'

// Node-only test project: pure units plus integration tests that boot a real trail + real Chromium
// (Playwright driven directly). No jsdom, no storybook here. Solid components are compiled by the
// vite build and exercised in browser ITs via esbuild-bundled fixtures, never imported into node.
export default defineConfig({
  test: {
    name: 'whiteboard',
    environment: 'node',
    include: ['test/**/*.test.ts', 'test/**/*.it.test.ts'],
    testTimeout: 30_000,
  },
})
