import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: ['src/vite-plumbing.ts', 'src/extensions.ts', 'src/compile-extension.ts', 'src/split-extension.ts'],
  format: 'esm',
  fixedExtension: false,
  dts: false,
  external: ['vite'],
})
