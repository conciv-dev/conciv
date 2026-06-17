import {defineConfig} from 'tsdown'

// Single executable entry. tsdown bundles the internal modules and preserves the shebang;
// citty/zod/consola/@clack and @opendui/aidx-protocol stay external.
export default defineConfig({
  entry: ['src/bin.ts'],
  format: 'esm',
  fixedExtension: false,
  dts: false,
})
