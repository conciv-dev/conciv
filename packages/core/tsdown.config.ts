import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: {
    start: 'src/start.ts',
    config: 'src/config.ts',
    app: 'src/app.ts',
    runtime: 'src/runtime.ts',
    'search-index-worker': 'src/sessions/search-index-worker.ts',
  },
  format: 'esm',
  fixedExtension: false,
  dts: {resolver: 'tsc'},
})
