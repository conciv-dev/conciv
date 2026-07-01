import {defineConfig} from 'tsdown'

// Per-module entries (no barrel). registry.ts is the package entry ("."); each adapter's
// <id>.ts is a subpath export. @tanstack/ai + @conciv/protocol stay external.
export default defineConfig({
  entry: [
    'src/registry.ts',
    'src/claude/index.ts',
    'src/codex/index.ts',
    'src/gemini-cli/index.ts',
    'src/opencode/index.ts',
    'src/pi/index.ts',
  ],
  format: 'esm',
  fixedExtension: false,
  dts: true,
})
