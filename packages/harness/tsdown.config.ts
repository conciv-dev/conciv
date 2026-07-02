import {defineConfig} from 'tsdown'

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
