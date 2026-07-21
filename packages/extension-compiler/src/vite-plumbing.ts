import {existsSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {addSourceToJsx} from './inject-source.js'
import {compileExtensionSolid, isExtensionModule} from './compile-extension.js'
import {isConcivSrcTsx} from './conciv-src.js'

export {concivSrcEntry} from './conciv-src.js'
import {splitExtension} from './split-extension.js'
import {EXTENSIONS_RESOLVED_ID, EXTENSIONS_ROUTE, EXTENSIONS_VIRTUAL_ID, extensionsModuleSource} from './extensions.js'

const SOLID_SINGLETONS = ['solid-js', 'solid-js/web', 'solid-js/store', '@tanstack/solid-router', '@ark-ui/solid']

function packageNameOf(id: string): string {
  const segments = id.split('/')
  return id.startsWith('@') ? segments.slice(0, 2).join('/') : (segments[0] ?? id)
}

function resolvableFrom(id: string, root: string): boolean {
  let dir = root
  while (true) {
    if (existsSync(join(dir, 'node_modules', packageNameOf(id), 'package.json'))) return true
    const parent = dirname(dir)
    if (parent === dir) return false
    dir = parent
  }
}

export function concivSolidConfig(opts: {root?: string; warmupFiles?: readonly string[]} = {}) {
  const root = opts.root
  const singletons = [...SOLID_SINGLETONS, '@conciv/extension']
  const rootResolvable = root === undefined ? singletons : singletons.filter((id) => resolvableFrom(id, root))
  return {
    resolve: {dedupe: rootResolvable},
    optimizeDeps: {
      exclude: rootResolvable,
      include: [],
    },
    server: {warmup: {clientFiles: [...(opts.warmupFiles ?? [])]}},
  }
}

export function dropIncludedFromExcludes(
  optimizeDeps: {include?: string[]; exclude?: string[]} | undefined,
  managedIds: readonly string[],
): void {
  if (!optimizeDeps?.exclude?.length) return
  const included = new Set(optimizeDeps.include ?? [])
  const managed = new Set(managedIds)
  optimizeDeps.exclude = optimizeDeps.exclude.filter((id) => !(managed.has(id) && included.has(id)))
}

export function resolveExtensionsModule(id: string): string | null {
  const bareId = id.replace(/[?#].*$/, '')
  return bareId === EXTENSIONS_VIRTUAL_ID || bareId === EXTENSIONS_ROUTE ? EXTENSIONS_RESOLVED_ID : null
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
  if (isConcivSrcTsx(id)) {
    const stamped = addSourceToJsx(code, id, ctx.root)
    return compileExtensionSolid(stamped?.code ?? code, id, ssr)
  }
  if (isExtensionModule(id))
    return splitExtension(code, id, 'browser').then((split) => compileExtensionSolid(split?.code ?? code, id, ssr))
  if (ctx.deferToTsd) return null
  return addSourceToJsx(code, id, ctx.root)
}
