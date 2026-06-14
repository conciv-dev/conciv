import {defineConfig} from 'tsdown'

// `engine` is the package entry; `config` is a subpath export. The test runner (incl. its
// spawned child) now lives in @aidx/test-runner. h3/srvx/@tanstack/ai/@aidx/* stay external.
export default defineConfig({
  entry: ['src/engine.ts', 'src/config.ts'],
  format: 'esm',
  fixedExtension: false,
  dts: true,
})
