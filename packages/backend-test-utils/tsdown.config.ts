import {defineConfig} from 'tsdown'

export default defineConfig({
  sourcemap: true,
  entry: ['src/backend-test-utils.ts', 'src/browser.ts', 'src/vitest.ts'],
  format: 'esm',
  platform: 'node',
  fixedExtension: false,
  dts: false,
})
