import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts'],
  format: 'esm',
  fixedExtension: false,
  dts: false,
  external: [/^@conciv\//, 'react'],
  banner: {js: "'use client';"},
})
