import {readdirSync, readFileSync} from 'node:fs'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
import {createJiti} from 'jiti'
import type {AnyExtension} from '@conciv/extension'
import {splitExtension} from './split-extension.js'

export const EXTENSIONS_VIRTUAL_ID = 'virtual:conciv-extensions'
export const EXTENSIONS_RESOLVED_ID = '\0' + EXTENSIONS_VIRTUAL_ID

export type Builtins = {serverExtensions: readonly AnyExtension[]; clientEntries: readonly string[]}

export const NO_BUILTINS: Builtins = {serverExtensions: [], clientEntries: []}

export function extensionsModuleSource(clientEntries: readonly string[], apiBase?: string): string {
  const apiBaseLine =
    apiBase === undefined
      ? []
      : [`if (typeof window !== 'undefined') window.__CONCIV_API_BASE__ = ${JSON.stringify(apiBase)}`]
  return [
    ...apiBaseLine,
    `console.info('[conciv] widget UI removed pending the new conciv client (oRPC rewrite); /rpc API is live; ${clientEntries.length} extension client entries idle')`,
    '',
  ].join('\n')
}

const EXTENSION_DIR = 'conciv/extensions'
const EXTENSION_RE = /\.(?:ts|tsx|js|jsx)$/

function extensionFiles(root: string): string[] {
  try {
    return readdirSync(join(root, EXTENSION_DIR))
      .filter((name) => EXTENSION_RE.test(name))
      .map((name) => join(root, EXTENSION_DIR, name))
  } catch {
    return []
  }
}

export async function loadServerExtensions(
  root: string,
  builtinServerExtensions: readonly AnyExtension[],
): Promise<AnyExtension[]> {
  const files = extensionFiles(root)
  if (files.length === 0) return [...builtinServerExtensions]
  const jiti = createJiti(pathToFileURL(join(root, 'noop.js')).href, {
    jsx: {runtime: 'automatic', importSource: 'solid-js'},
  })
  const builders: AnyExtension[] = []
  for (const file of files) {
    const source = readFileSync(file, 'utf8')
    const split = await splitExtension(source, file, 'node')
    const evaluated = await jiti.evalModule(split?.code ?? source, {filename: file})
    const builder = (evaluated as {default?: AnyExtension}).default
    if (builder) builders.push(builder)
  }
  return [...builtinServerExtensions, ...builders]
}
