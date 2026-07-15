import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: [
    'src/vite-plumbing.ts',
    'src/extensions.ts',
    'src/inject-source.ts',
    'src/compile-extension.ts',
    'src/split-extension.ts',
  ],
  format: 'esm',
  fixedExtension: false,
  dts: true,
  external: ['vite'],
})
