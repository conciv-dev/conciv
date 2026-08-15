import {readdirSync, readFileSync} from 'node:fs'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
import {createJiti, type Jiti, type JSXOptions, type TransformOptions, type TransformResult} from 'jiti'
import type {AnyExtension} from '@conciv/extension'
import {splitExtension} from './split-extension.js'
import {dedupeExtensions, EXTENSION_GLOB, type ExtensionEntry} from './dedupe-extensions.js'

export const EXTENSIONS_VIRTUAL_ID = 'virtual:conciv-extensions'
export const EXTENSIONS_RESOLVED_ID = '\0' + EXTENSIONS_VIRTUAL_ID
export const EXTENSIONS_ROUTE = '/@conciv/extensions.js'

export type Builtins = {
  serverExtensions: readonly AnyExtension[]
  clientEntries: readonly string[]
  embedEntry?: string
  dedupeEntry?: string
  nativePageDir?: string
}

export const NO_BUILTINS: Builtins = {serverExtensions: [], clientEntries: []}

export function extensionsModuleSource(
  clientEntries: readonly string[],
  apiBase?: string,
  embedEntry?: string,
  dedupeEntry?: string,
): string {
  const imports = clientEntries.map((entry, index) => `import builtin${index} from ${JSON.stringify(entry)}`)
  const builtinNames = clientEntries.map((_, index) => `builtin${index}`)
  const apiBaseLine =
    apiBase === undefined
      ? []
      : [`if (typeof window !== 'undefined') window.__CONCIV_API_BASE__ = ${JSON.stringify(apiBase)}`]
  return [
    `import {mountConciv} from ${JSON.stringify(embedEntry ?? '@conciv/embed')}`,
    ...imports,
    ...apiBaseLine,
    `import {dedupeExtensions, toSortedEntries} from ${JSON.stringify(dedupeEntry ?? '@conciv/extension-compiler/dedupe')}`,
    `const mods = import.meta.glob(${JSON.stringify(EXTENSION_GLOB)}, {eager: true})`,
    `const folderEntries = toSortedEntries(mods)`,
    `const builtinEntries = [${builtinNames.map((n, i) => `{extension: ${n}, source: 'builtin:${i}'}`).join(', ')}]`,
    `const picked = dedupeExtensions([...builtinEntries, ...folderEntries])`,
    `for (const d of picked.dropped) console.warn('conciv extension dropped:', d.source, d.reason)`,
    `void mountConciv(picked.extensions)`,
    '',
  ].join('\n')
}

const EXTENSION_DIR = 'conciv/extensions'
const EXTENSION_RE = /\.(?:ts|tsx|js|jsx)$/

function isMissingDirError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}

export function listExtensionFiles(root: string): string[] {
  try {
    return readdirSync(join(root, EXTENSION_DIR), {withFileTypes: true})
      .filter((entry) => entry.isFile() && EXTENSION_RE.test(entry.name) && !entry.name.endsWith('.d.ts'))
      .map((entry) => entry.name)
      .toSorted()
  } catch (error) {
    if (isMissingDirError(error)) return []
    throw error
  }
}

export async function loadExtensionPackages(
  root: string,
  resolveFrom: string,
  specifiers: readonly string[],
): Promise<AnyExtension[]> {
  const rootJiti = createJiti(pathToFileURL(join(root, 'noop.js')).href)
  const resolveFromUrl = rootJiti.esmResolve(resolveFrom)
  const packageJiti = createJiti(resolveFromUrl)
  return Promise.all(
    specifiers.map(async (specifier) => {
      const loaded = await packageJiti.import<{default?: AnyExtension}>(specifier)
      const extension = loaded && typeof loaded === 'object' && 'default' in loaded ? loaded.default : undefined
      if (extension === undefined) throw new Error(`conciv builtin extension ${specifier} has no default export`)
      return extension
    }),
  )
}

const EXTENSION_JSX: JSXOptions = {runtime: 'automatic', importSource: 'solid-js'}

function splitThenTransform(base: Jiti, options: TransformOptions): TransformResult {
  const split = options.filename === undefined ? null : splitExtension(options.source, options.filename, 'node')
  return {code: base.transform({...options, source: split?.code ?? options.source})}
}

function createSplittingJiti(root: string): Jiti {
  const parentUrl = pathToFileURL(join(root, 'noop.js')).href
  const base = createJiti(parentUrl, {jsx: EXTENSION_JSX})
  return createJiti(parentUrl, {
    jsx: EXTENSION_JSX,
    fsCache: false,
    transform: (options) => splitThenTransform(base, options),
  })
}

export async function loadServerExtensions(
  root: string,
  builtinServerExtensions: readonly AnyExtension[],
): Promise<AnyExtension[]> {
  const builtinEntries: ExtensionEntry[] = builtinServerExtensions.map((extension, index) => ({
    extension,
    source: `builtin:${index}`,
  }))
  const files = listExtensionFiles(root).map((name) => join(root, EXTENSION_DIR, name))
  if (files.length === 0) return dedupeExtensions(builtinEntries).extensions
  const jiti = createSplittingJiti(root)
  const folderEntries: ExtensionEntry[] = []
  for (const file of files) {
    const source = readFileSync(file, 'utf8')
    const evaluated = await jiti.evalModule(source, {filename: file})
    const value = evaluated && typeof evaluated === 'object' && 'default' in evaluated ? evaluated.default : undefined
    if (value === undefined) throw new Error(`conciv extension ${file} has no default export`)
    folderEntries.push({extension: value, source: file})
  }
  const result = dedupeExtensions([...builtinEntries, ...folderEntries])
  for (const drop of result.dropped) console.error(`conciv extension dropped: ${drop.source} (${drop.reason})`)
  return result.extensions
}
