import {defineConfig} from 'tsdown'

// `plugin` is the package entry; `config` is a subpath export (DevgentConfig). The vitest
// runner-child MUST stay a separate output file — the manager spawns it as its own process
// via new URL('./vitest-runner-child.js', import.meta.url). vite/@tanstack/ai/@devgent/* and
// launch-editor stay external.
export default defineConfig({
  entry: ['src/plugin.ts', 'src/config.ts', 'src/vitest-runner-child.ts'],
  format: 'esm',
  fixedExtension: false,
  dts: true,
})
