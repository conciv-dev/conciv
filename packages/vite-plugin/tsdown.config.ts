import {defineConfig} from 'tsdown'

// DEPRECATED alias — two re-export entries (plugin → @devgent/plugin/vite, config →
// @devgent/core/config). @devgent/* stay external.
export default defineConfig({
  entry: ['src/plugin.ts', 'src/config.ts'],
  format: 'esm',
  fixedExtension: false,
  dts: true,
  external: [/^@devgent\//, 'vite'],
})
