import {addSourceToJsx} from './inject-source.js'
import {compileExtensionSolid, isExtensionModule} from './compile-extension.js'
import {isConcivSrcTsx} from './conciv-src.js'
import {splitExtension} from './split-extension.js'
import {EXTENSIONS_RESOLVED_ID, EXTENSIONS_VIRTUAL_ID, extensionsModuleSource} from './extensions.js'

const SOLID_SINGLETONS = ['solid-js', 'solid-js/web', 'solid-js/store', '@tanstack/solid-router', '@ark-ui/solid']

export function concivSolidConfig() {
  return {
    resolve: {dedupe: [...SOLID_SINGLETONS, '@conciv/extension']},
    optimizeDeps: {
      exclude: [...SOLID_SINGLETONS, '@conciv/extension'],
      include: [],
    },
  }
}

export function resolveExtensionsModule(id: string): string | null {
  return id === EXTENSIONS_VIRTUAL_ID ? EXTENSIONS_RESOLVED_ID : null
}

export function loadExtensionsModule(
  id: string,
  clientEntries: readonly string[],
  apiBase?: string,
  embedEntry?: string,
): string | null {
  return id === EXTENSIONS_RESOLVED_ID ? extensionsModuleSource(clientEntries, apiBase, embedEntry) : null
}

export function isClientEntry(id: string): boolean {
  return id.includes('client-entry')
}

export type TransformContext = {root: string; deferToTsd: boolean}

export function transformConcivModule(
  code: string,
  id: string,
  ssr: boolean,
  ctx: TransformContext,
):
  | ReturnType<typeof addSourceToJsx>
  | Promise<{code: string; map: string | null} | null>
  | {code: string; map: null}
  | null {
  if (!ssr && isClientEntry(id) && !code.includes(EXTENSIONS_VIRTUAL_ID)) {
    return {code: `${code}\nimport(${JSON.stringify(EXTENSIONS_VIRTUAL_ID)})\n`, map: null}
  }
  if (id.includes('node_modules')) return null
  if (isConcivSrcTsx(id)) return compileExtensionSolid(code, id, ssr)
  if (isExtensionModule(id))
    return splitExtension(code, id, 'browser').then((split) => compileExtensionSolid(split?.code ?? code, id, ssr))
  if (ctx.deferToTsd) return null
  return addSourceToJsx(code, id, ctx.root)
}
