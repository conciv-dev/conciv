import {defineConfig} from 'tsdown'

export default defineConfig([
  {
    sourcemap: true,
    entry: ['src/bin.ts'],
    format: 'esm',
    fixedExtension: false,
    dts: false,
    deps: {
      neverBundle: [
        /^@conciv\/harness(\/|$)/,
        /^@conciv\/extension(\/|-|$)/,
        /^@anthropic-ai\/claude-agent-sdk/,
        /^@opencode-ai\/sdk/,
        /^@agentclientprotocol\/sdk/,
        /^@tanstack\/ai-(sandbox|acp|claude-code|codex|opencode)/,
      ],
      onlyImport: ['@ast-grep/napi'],
    },
  },
  {
    sourcemap: true,
    entry: ['src/testing.ts'],
    format: 'esm',
    fixedExtension: false,
    clean: false,
    dts: {generator: 'oxc'},
  },
])
