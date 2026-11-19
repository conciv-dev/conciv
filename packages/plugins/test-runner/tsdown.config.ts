import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/rpc.ts',
    'src/vitest.ts',
    'src/vitest-child.ts',
    'src/playwright.ts',
    'src/playwright-child.ts',
  ],
  format: 'esm',
  fixedExtension: false,
  dts: false,
})
