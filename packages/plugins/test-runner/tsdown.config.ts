import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/rpc.ts',
    'src/runners/vitest/adapter.ts',
    'src/runners/vitest/child.ts',
    'src/runners/playwright/adapter.ts',
    'src/runners/playwright/child.ts',
  ],
  format: 'esm',
  fixedExtension: false,
  dts: false,
})
