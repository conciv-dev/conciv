import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: [
    'src/registry.ts',
    'src/_shared/cwd.ts',
    'src/_shared/page.ts',
    'src/claude/index.ts',
    'src/claude/system-prompt.ts',
    'src/codex/index.ts',
    'src/opencode/index.ts',
    'src/pi/index.ts',
  ],
  format: 'esm',
  fixedExtension: false,
  dts: false,
  noExternal: [/^@tanstack\/ai-(acp|claude-code|codex|opencode)(\/|$)/],
})
