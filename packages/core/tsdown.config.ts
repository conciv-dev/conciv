import {defineConfig} from 'tsdown'

// `engine` is the package entry; `config` + `widget-tags` are subpath exports. The test runner
// (incl. its spawned child) now lives in @opendui/aidx-test-runner. h3/srvx/@tanstack/ai/@opendui/aidx-* external.
export default defineConfig({
  entry: ['src/engine.ts', 'src/config.ts', 'src/widget-tags.ts'],
  format: 'esm',
  fixedExtension: false,
  dts: true,
})
