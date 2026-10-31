import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: ['src/server.ts', 'src/client.ts', 'src/testkit.ts'],
  format: 'esm',
  fixedExtension: false,
  dts: true,
  noExternal: [/^@tanstack\/ai-(acp|claude-code|code-mode|codex|opencode|sandbox|sandbox-local-process)(\/|$)/],
})
