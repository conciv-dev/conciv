import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: [
    'src/chat-types.ts',
    'src/ui-types.ts',
    'src/done-types.ts',
    'src/editor-types.ts',
    'src/harness-types.ts',
    'src/terminal-types.ts',
    'src/bundler-types.ts',
    'src/config-types.ts',
    'src/page-types.ts',
    'src/page-introspect-types.ts',
    'src/usage-types.ts',
    'src/tool-view-types.ts',
    'src/tool-timing.ts',
  ],
  format: 'esm',
  fixedExtension: false,
  dts: true,
})
