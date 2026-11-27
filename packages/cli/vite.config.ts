import {isBuiltin} from 'node:module'
import {defineConfig, type Plugin} from 'vite'
import {libConfig} from '@internal/vite-config'
import {concivTest} from '@internal/vitest-config/conciv-test'

function onlyImport(allowed: ReadonlyArray<string>): Plugin {
  return {
    name: 'conciv:cli-only-import',
    apply: 'build',
    generateBundle(_options, bundle) {
      const imported = Object.values(bundle).flatMap((chunk) =>
        chunk.type === 'chunk' ? [...chunk.imports, ...chunk.dynamicImports] : [],
      )
      const outside = imported.filter(
        (id) => !(id in bundle) && !isBuiltin(id) && !allowed.some((name) => id === name || id.startsWith(`${name}/`)),
      )
      if (outside.length > 0)
        this.error(`the cli imports packages it does not depend on: ${[...new Set(outside)].join(', ')}`)
    },
  }
}

export default defineConfig(
  libConfig({
    root: import.meta.url,
    plugins: [onlyImport(['@ast-grep/napi']), concivTest()],
    environments: {
      server: {
        entries: ['src/bin.ts', 'src/commands-json.ts'],
        bundle: true,
        types: false,
        noExternal: true,
        external: [
          /^@conciv\/harness(?!\/init)(\/|$)/,
          /^@anthropic-ai\/claude-agent-sdk/,
          /^@opencode-ai\/sdk/,
          /^@agentclientprotocol\/sdk/,
          /^@tanstack\/ai-(sandbox|acp|claude-code|codex|opencode)/,
          '@ast-grep/napi',
        ],
      },
    },
  }),
)
