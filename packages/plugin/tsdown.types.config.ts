import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: {'experimental/opaque': 'src/experimental/opaque.ts'},
  format: 'esm',
  fixedExtension: false,
  clean: false,
  dts: {emitDtsOnly: true, generator: 'oxc', sourcemap: false},
  deps: {dts: {alwaysBundle: ['@conciv/opaque']}},
})
