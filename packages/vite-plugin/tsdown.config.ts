import {defineConfig} from 'tsdown'

// `plugin` is the package entry; `config` re-exports @devgent/core's DevgentConfig. The engine
// + vitest runner-child now live in @devgent/core. vite/@devgent/* stay external.
export default defineConfig({
  entry: ['src/plugin.ts', 'src/config.ts'],
  format: 'esm',
  fixedExtension: false,
  dts: true,
})
