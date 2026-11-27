import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: ['src/mount.ts'],
  format: 'esm',
  fixedExtension: false,
  clean: false,
  tsconfig: 'tsconfig.build.json',
  dts: {emitDtsOnly: true},
})
