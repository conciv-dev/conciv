import {defineConfig} from 'vitest/config'

// Node-only test project. Each IT boots a real spawned server + real Chromium (Playwright driven
// directly) and builds the host page with vite, so files run serially to avoid resource contention.
export default defineConfig({
  test: {
    name: 'extension-testkit',
    environment: 'node',
    include: ['test/**/*.test.ts', 'test/**/*.it.test.ts'],
    testTimeout: 60_000,
    fileParallelism: false,
  },
})
