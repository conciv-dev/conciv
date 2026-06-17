import {defineConfig} from 'tsdown'

// tools.ts is the package entry ("."). @tanstack/ai + @opendui/aidx-protocol stay external.
export default defineConfig({
  entry: ['src/tools.ts'],
  format: 'esm',
  fixedExtension: false,
  dts: true,
})
