import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: ['src/bin.ts'],
  format: 'esm',
  fixedExtension: false,
  dts: false,
  deps: {
    neverBundle: [
      /^@conciv\/(harness|claude-connect)(\/|$)/,
      /^@conciv\/extension(\/|-|$)/,
      /^@anthropic-ai\/claude-agent-sdk/,
      /^@opencode-ai\/sdk/,
      /^@agentclientprotocol\/sdk/,
      /^@tanstack\/ai-(sandbox|acp|claude-code|codex|opencode)/,
    ],
    onlyImport: ['@ast-grep/napi'],
  },
})
