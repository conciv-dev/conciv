import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/server.ts', 'src/testkit.ts', 'src/server-testkit.ts'],
  format: 'esm',
  fixedExtension: false,
  dts: true,
  noExternal: [/^@tanstack\/ai-(acp|claude-code|codex|opencode|sandbox-local-process)(\/|$)/],
})
