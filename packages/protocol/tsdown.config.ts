import {defineConfig} from 'tsdown'

// Per-module entries (no barrel) → dist/<name>.js + .d.ts, matching the package's subpath
// exports. @tanstack/ai stays external.
export default defineConfig({
  entry: [
    'src/chat-types.ts',
    'src/ui-types.ts',
    'src/test-types.ts',
    'src/vitest-types.ts',
    'src/harness-types.ts',
    'src/runner-types.ts',
    'src/bundler-types.ts',
    'src/page-protocol.ts',
  ],
  format: 'esm',
  fixedExtension: false,
  dts: true,
})
