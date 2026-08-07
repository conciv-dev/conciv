import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: [
    'src/registry.ts',
    'src/claude/init.ts',
    'src/claude/bridge.ts',
    'src/claude/endpoint.ts',
    'src/claude/install-state.ts',
    'src/claude/names.ts',
    'src/claude/plugin-files.ts',
    'src/codex.ts',
    'src/gemini-cli.ts',
    'src/opencode.ts',
    'src/pi.ts',
    'src/json.ts',
    'src/paths.ts',
  ],
  format: 'esm',
  fixedExtension: false,
  dts: true,
})
