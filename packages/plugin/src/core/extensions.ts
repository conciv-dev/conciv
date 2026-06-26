import {readdirSync, readFileSync} from 'node:fs'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
import {createJiti} from 'jiti'
import type {AnyExtension} from '@mandarax/extension'
import testRunnerExtension from '@mandarax/extension-test-runner'
import {splitExtension} from './split-extension.js'

export const EXTENSIONS_VIRTUAL_ID = 'virtual:mandarax-extensions'
export const EXTENSIONS_RESOLVED_ID = '\0' + EXTENSIONS_VIRTUAL_ID

// Built-in client entries the plugin ships. The bundler must resolve these from the PLUGIN (they are
// the plugin's deps, not the app's), so the vite hook maps each to its plugin-resolved absolute path.
export const BUILTIN_CLIENT_ENTRIES = ['@mandarax/extension-test-runner/client'] as const

// The built-in extensions the plugin ships, merged ahead of the user's file-based ones (server side
// here; client side via extensionsModuleSource).
const builtinExtensions: AnyExtension[] = [testRunnerExtension]

// The single client entry the plugin serves through Vite (so the widget, every extension, solid-js and
// @mandarax/extension share ONE Vite graph + one ExtensionRuntimeContext). It imports each built-in's
// client view, globs the file-based extensions (default export = an ExtensionBuilder, server half
// already collapsed by the transform), and hands them all to mountWidget — no global, no queue.
export function extensionsModuleSource(): string {
  return [
    "import {mountWidget} from '@mandarax/widget'",
    "import testRunner from '@mandarax/extension-test-runner/client'",
    "const mods = import.meta.glob('/mandarax/extensions/*.{ts,tsx}', {eager: true})",
    'const userExtensions = Object.values(mods).map((m) => m && m.default).filter(Boolean)',
    'mountWidget([testRunner, ...userExtensions])',
    '',
  ].join('\n')
}

const EXTENSION_DIR = 'mandarax/extensions'
const EXTENSION_RE = /\.(?:ts|tsx|js|jsx)$/

// Discover the extension files under <root>/mandarax/extensions (none → empty list, no dir → empty).
function extensionFiles(root: string): string[] {
  try {
    return readdirSync(join(root, EXTENSION_DIR))
      .filter((name) => EXTENSION_RE.test(name))
      .map((name) => join(root, EXTENSION_DIR, name))
  } catch {
    return []
  }
}

// Load each extension's SERVER half and collect its contributions (extra agent tools + system prompt
// text) for the engine. Each file is split for node first (collapse .client()/.render() + drop their
// imports) so the backend never loads client/card/Solid code, then jiti evaluates the collapsed
// source. jiti is bundler-agnostic; re-runs on dev-server (re)start, server edits need a restart.
export async function loadServerExtensions(root: string): Promise<AnyExtension[]> {
  const files = extensionFiles(root)
  if (files.length === 0) return [...builtinExtensions]
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
  return [...builtinExtensions, ...builders]
}
