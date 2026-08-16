import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: ['src/solid/index.ts'],
  outDir: 'dist/solid',
  format: 'esm',
  fixedExtension: false,
  unbundle: true,
  dts: false,
  clean: false,
  outExtensions: () => ({js: '.jsx'}),
  inputOptions: {jsx: 'preserve'},
  external: ['solid-js', /^solid-js\//, /^\.\.\//],
})
