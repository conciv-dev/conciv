import {defineConfig} from 'tsdown'

export default defineConfig({
  sourcemap: true,
  entry: ['src/react.ts'],
  format: 'esm',
  fixedExtension: false,
  dts: false,
  external: [/^@conciv\//, 'react', 'react-dom', 'solid-js'],
  banner: {js: "'use client';"},
})
