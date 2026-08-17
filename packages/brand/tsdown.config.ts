import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: {react: 'src/react/conciv-lockup.tsx'},
  tsconfig: 'tsconfig.react.json',
  format: 'esm',
  fixedExtension: false,
  dts: true,
  clean: false,
  external: [/^@conciv\//, 'react', /^motion/],
  banner: {js: "'use client';"},
})
