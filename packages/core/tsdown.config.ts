import {defineConfig} from 'tsdown'

export default defineConfig({
  sourcemap: true,
  entry: {
    start: 'src/start.ts',
    config: 'src/config.ts',
    app: 'src/app.ts',
    runtime: 'src/runtime.ts',
    testing: 'src/testing.ts',
    'search-index-worker': 'src/sessions/search-index-worker.ts',
  },
  format: 'esm',
  fixedExtension: false,
  dts: false,
  deps: {alwaysBundle: ['@internal/vitest-config']},
})
