import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: {
    server: 'src/server.ts',
    client: 'src/client.ts',
    testkit: 'src/testkit.ts',
    'quickjs-worker': 'src/server/quickjs-worker.ts',
  },
  format: 'esm',
  fixedExtension: false,
  dts: true,
  noExternal: [/^@tanstack\/ai-(acp|claude-code|code-mode|codex|opencode|sandbox|sandbox-local-process)(\/|$)/],
})
