import {defineConfig} from 'tsdown'

export default defineConfig({
  sourcemap: true,
  entry: ['src/conciv-lockup.tsx'],
  format: 'esm',
  fixedExtension: false,
  dts: false,
  external: ['react', /^motion/],
  banner: {js: "'use client';"},
})
