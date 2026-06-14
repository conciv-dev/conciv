import {defineConfig} from 'tsdown'

// Per-module entries (no barrel). registry.ts is the package entry ("."); each adapter's
// <id>.ts is a subpath export. @tanstack/ai + @aidx/protocol stay external.
export default defineConfig({
  entry: [
    'src/registry.ts',
    'src/claude/claude.ts',
    'src/codex/codex.ts',
    'src/gemini-cli/gemini-cli.ts',
    'src/opencode/opencode.ts',
    'src/pi/pi.ts',
  ],
  format: 'esm',
  fixedExtension: false,
  dts: true,
})
