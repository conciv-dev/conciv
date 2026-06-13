import {defineConfig} from 'vitest/config'

// Only our own integration tests. The fixtures/ tree holds an app with an intentional-fail
// test that the manager runs OUT OF PROCESS — it must never be collected by our own run.
export default defineConfig({
  test: {
    include: ['test/**/*.it.test.ts'],
    exclude: ['test/fixtures/**', 'node_modules/**', 'dist/**'],
  },
})
