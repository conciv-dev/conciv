import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/server.ts', 'src/client.ts', 'src/testkit.ts'],
  format: 'esm',
  fixedExtension: false,
  dts: true,
  noExternal: [
    /^@tanstack\/ai-(acp|claude-code|codex|opencode|sandbox|sandbox-local-process)(\/|$)/,
    /^@agentclientprotocol\/sdk(\/|$)/,
    /^@opencode-ai\/sdk(\/|$)/,
  ],
})
