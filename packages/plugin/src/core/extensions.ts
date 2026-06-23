import {readdirSync} from 'node:fs'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
import {createJiti} from 'jiti'
import type {ExtensionBuilder, ExtensionServerContributions} from '@mandarax/extension'
import {collectServerContributions} from '@mandarax/extension'

// The vite virtual module that discovers + applies CLIENT halves in the browser; its body (the glob)
// still comes from the legacy @mandarax/extensions package — the new-contract client discovery is
// slice 3b. The ids are vite conventions, so they live with the bundler hook.
export {extensionsModuleSource} from '@mandarax/extensions'
export const EXTENSIONS_VIRTUAL_ID = 'virtual:mandarax-extensions'
export const EXTENSIONS_RESOLVED_ID = '\0' + EXTENSIONS_VIRTUAL_ID

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
