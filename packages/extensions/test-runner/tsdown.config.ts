import {defineConfig} from 'tsdown'

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
