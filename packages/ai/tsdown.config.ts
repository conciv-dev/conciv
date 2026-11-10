import {defineConfig} from 'tsdown'

export default defineConfig([
  {
    entry: {
      server: 'src/server.ts',
      testkit: 'src/testkit.ts',
      'quickjs-worker': 'src/server/quickjs-worker.ts',
    },
    format: 'esm',
    fixedExtension: false,
    dts: true,
    noExternal: [/^@tanstack\/ai-(acp|claude-code|code-mode|codex|opencode|sandbox|sandbox-local-process)(\/|$)/],
  },
  {
    entry: {client: 'src/client.ts'},
    format: 'esm',
    fixedExtension: false,
    dts: true,
    noExternal: [/^@tanstack\/ai-(client|solid)(\/|$)/],
    env: {NODE_ENV: 'production'},
  },
])
