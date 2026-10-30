import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: [
    'src/messages.ts',
    'src/events.ts',
    'src/tools.ts',
    'src/usage.ts',
    'src/adapters.ts',
    'src/testkit.ts',
    'src/server.ts',
    'src/server-testkit.ts',
  ],
  format: 'esm',
  fixedExtension: false,
  dts: true,
  noExternal: [/^@tanstack\/ai-(acp|claude-code|codex|opencode|sandbox-local-process)(\/|$)/],
})
