import {defineConfig} from 'tsdown'

// The node half of the extension: the server view (server.ts, "."), the runner registry + driver,
// and each runner adapter. JSX-free, so tsdown builds it. The Solid client view (client.ts + the
// card) is built by vite (vite.config.ts); all .d.ts come from `tsc -p tsconfig.build.json`.
// Each runner's child.ts MUST stay its own output: the driver spawns it as a fresh process via
// new URL('./child.js', import.meta.url), so it cannot be bundled into its adapter.
export default defineConfig({
  entry: [
    'src/server.ts',
    'src/runner/registry.ts',
    'src/runner/driver.ts',
    'src/runner/child-protocol.ts',
    'src/runners/vitest/adapter.ts',
    'src/runners/vitest/child.ts',
    'src/runners/jest.ts',
    'src/runners/node-test.ts',
    'src/runners/playwright/adapter.ts',
    'src/runners/playwright/child.ts',
  ],
  format: 'esm',
  fixedExtension: false,
  dts: false,
})
