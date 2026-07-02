import type {Plugin} from 'vite'
import {addSourceToJsx} from './inject-source.js'
import {compileExtensionSolid, isExtensionModule} from './compile-extension.js'
import {splitExtension} from './split-extension.js'
import {type Builtins, EXTENSIONS_RESOLVED_ID, EXTENSIONS_VIRTUAL_ID, extensionsModuleSource} from './extensions.js'

export function concivSolidConfig() {
  return {
    resolve: {dedupe: ['solid-js', '@conciv/extension']},
    optimizeDeps: {exclude: ['@conciv/widget', '@conciv/extension']},
  }
}

export function resolveExtensionsModule(id: string): string | null {
  return id === EXTENSIONS_VIRTUAL_ID ? EXTENSIONS_RESOLVED_ID : null
}

export function loadExtensionsModule(id: string, clientEntries: readonly string[]): string | null {
  return id === EXTENSIONS_RESOLVED_ID ? extensionsModuleSource(clientEntries) : null
}

export type TransformContext = {root: string; deferToTsd: boolean}

export function transformConcivModule(
  code: string,
  id: string,
  ssr: boolean,
  ctx: TransformContext,
): ReturnType<typeof addSourceToJsx> | Promise<{code: string; map: string | null} | null> | null {
  if (id.includes('node_modules')) return null
  if (isExtensionModule(id))
    return splitExtension(code, id, 'browser').then((split) => compileExtensionSolid(split?.code ?? code, id, ssr))
  if (ctx.deferToTsd) return null
  return addSourceToJsx(code, id, ctx.root)
}

export function concivBuildPlugin(builtins: Builtins): Plugin {
  let root = process.cwd()
  let deferToTsd = false
  return {
    name: 'conciv:build',
    enforce: 'pre',
    config: () => concivSolidConfig(),
    configResolved(config) {
      root = config.root
      deferToTsd = config.plugins.some((plugin) => plugin.name === '@tanstack/devtools:inject-source')
    },
    resolveId: (id) => resolveExtensionsModule(id),
    load: (id) => loadExtensionsModule(id, builtins.clientEntries),
    transform(code, id, opts) {
      return transformConcivModule(code, id, opts?.ssr ?? false, {root, deferToTsd})
    },
  }
}
