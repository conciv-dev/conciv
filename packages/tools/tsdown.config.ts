import {defineConfig} from 'tsdown'

// tools.ts is the package entry ("."); defs.ts is the browser-safe ./defs subpath (no node deps).
// @tanstack/ai + @conciv/protocol stay external.
export default defineConfig({
  entry: ['src/tools.ts', 'src/defs.ts'],
  format: 'esm',
  fixedExtension: false,
  dts: true,
})
