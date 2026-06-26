import {defineConfig} from 'vitest/config'

// Node-only test project: pure units plus integration tests that boot a real spawned Jazz server +
// real Chromium (Playwright driven directly). No jsdom, no storybook here. Solid components are built
// by vite into fixtures and exercised in the browser, never imported into node. Each IT spawns a Jazz
// server (WASM) + browser, so files run serially to avoid resource contention flaking startup.
export default defineConfig({
  test: {
    name: 'whiteboard',
    environment: 'node',
    include: ['test/**/*.test.ts', 'test/**/*.it.test.ts'],
    testTimeout: 30_000,
    fileParallelism: false,
  },
})
