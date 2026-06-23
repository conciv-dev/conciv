import {readdirSync} from 'node:fs'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
import {createJiti} from 'jiti'
import type {ExtensionBuilder, ExtensionServerContributions} from '@mandarax/extension'
import {collectServerContributions} from '@mandarax/extension'

export const EXTENSIONS_VIRTUAL_ID = 'virtual:mandarax-extensions'
export const EXTENSIONS_RESOLVED_ID = '\0' + EXTENSIONS_VIRTUAL_ID

// The single client entry the plugin serves through Vite (so bare imports resolve + dedupe). It globs
// the file-based extensions (their default export is an ExtensionBuilder), seeds them onto the shared
// __MANDARAX__ queue, THEN imports the widget — so the widget, every extension, solid-js and
// @mandarax/extension all live in ONE Vite graph (one ExtensionRuntimeContext) and the widget drains
// the queue on mount. import.meta.glob is eager so the queue is seeded before the widget loads.
export function extensionsModuleSource(): string {
  return [
    "const mods = import.meta.glob('/mandarax/extensions/*.{ts,tsx}', {eager: true})",
    'const builders = Object.values(mods).map((m) => m && m.default).filter(Boolean)',
    'const g = (window.__MANDARAX__ ??= {})',
    'g.queue = [...(g.queue ?? []), ...builders]',
    "await import('@mandarax/widget')",
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
// text) for the engine. jiti is a bundler-agnostic node TS loader, so this works under any bundler
// (the client half rides the app bundler's HMR). Solid jsx importSource so a .tsx extension's renderer
// transpiles without pulling React. Re-runs on dev-server (re)start; server edits need a restart.
export async function loadServerContributions(root: string): Promise<ExtensionServerContributions> {
  const files = extensionFiles(root)
  if (files.length === 0) return collectServerContributions([])
  const jiti = createJiti(pathToFileURL(join(root, 'noop.js')).href, {
    jsx: {runtime: 'automatic', importSource: 'solid-js'},
  })
  const builders: ExtensionBuilder<object>[] = []
  for (const file of files) {
    const mod = await jiti.import<{default?: ExtensionBuilder<object>}>(file)
    if (mod.default) builders.push(mod.default)
  }
  return collectServerContributions(builders)
}
