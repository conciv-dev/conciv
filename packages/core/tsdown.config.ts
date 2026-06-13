import {defineConfig} from 'tsdown'

// `engine` is the package entry; `config` is a subpath export. The vitest runner-child MUST
// stay a separate output file — the vitest manager spawns it as its own process via
// new URL('./child.js', import.meta.url). h3/srvx/@tanstack/ai/@devgent/* stay external.
export default defineConfig({
  entry: ['src/engine.ts', 'src/config.ts', 'src/runner/vitest/child.ts'],
  format: 'esm',
  fixedExtension: false,
  dts: true,
})
