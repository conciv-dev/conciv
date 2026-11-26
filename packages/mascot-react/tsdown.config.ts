import {defineConfig} from 'tsdown'

export default defineConfig({
  sourcemap: true,
  entry: ['src/mascot-react.ts'],
  format: 'esm',
  fixedExtension: false,
  unbundle: true,
  dts: false,
  external: ['react', /^react\//, /^@conciv\/mascot/],
})
