import {defineConfig} from 'tsdown'

// `engine` is the package entry; `config` + `widget-tags` are subpath exports. The test runner
// (incl. its spawned child) now lives in @mandarax/test-runner. h3/srvx/@tanstack/ai/@mandarax/* external.
export default defineConfig({
  entry: ['src/engine.ts', 'src/config.ts', 'src/widget-tags.ts', 'src/db/index.ts'],
  format: 'esm',
  fixedExtension: false,
  dts: true,
})
