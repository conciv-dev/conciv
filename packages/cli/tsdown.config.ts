import {defineConfig} from 'tsdown'

export default defineConfig({
  sourcemap: true,
  entry: ['src/bin.ts', 'src/commands-json.ts'],
  format: 'esm',
  fixedExtension: false,
  dts: false,
  deps: {
    neverBundle: [
      /^@conciv\/harness(?!\/init)(\/|$)/,
      /^@anthropic-ai\/claude-agent-sdk/,
      /^@opencode-ai\/sdk/,
      /^@agentclientprotocol\/sdk/,
      /^@tanstack\/ai-(sandbox|acp|claude-code|codex|opencode)/,
    ],
    onlyImport: ['@ast-grep/napi'],
  },
})
