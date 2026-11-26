import {defineConfig} from 'tsdown'

export default defineConfig({
  sourcemap: true,
  entry: ['src/**/*.ts', '!src/**/*.test.ts', '!src/**/*.d.ts'],
  unbundle: true,
  format: 'esm',
  fixedExtension: false,
  dts: false,
  loader: {'.md': 'text'},
})
