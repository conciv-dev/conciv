import {defineConfig} from 'tsdown'

// Per-module entries (no barrel) → dist/<name>.js + .d.ts, matching the package's subpath
// exports. @tanstack/ai stays external.
export default defineConfig({
  entry: [
    'src/chat-types.ts',
    'src/ui-types.ts',
    'src/done-types.ts',
    'src/test-types.ts',
    'src/harness-types.ts',
    'src/runner-types.ts',
    'src/bundler-types.ts',
    'src/config-types.ts',
    'src/page-types.ts',
    'src/page-introspect-types.ts',
    'src/usage-types.ts',
    'src/tool-view-types.ts',
    'src/db-types.ts',
    'src/sync-types.ts',
  ],
  format: 'esm',
  fixedExtension: false,
  external: ['yjs'],
  dts: true,
})
