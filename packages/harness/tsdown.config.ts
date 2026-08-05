import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: [
    'src/registry.ts',
    'src/_shared/cwd.ts',
    'src/claude/index.ts',
    'src/claude/connect-plugin-files.ts',
    'src/claude/connect-install-state.ts',
    'src/codex/index.ts',
    'src/gemini-cli/index.ts',
    'src/opencode/index.ts',
    'src/pi/index.ts',
  ],
  format: 'esm',
  fixedExtension: false,
  dts: true,
  noExternal: [/^@tanstack\/ai-(acp|claude-code|codex|opencode)(\/|$)/],
})
