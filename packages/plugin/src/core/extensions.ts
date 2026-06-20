import {readdirSync} from 'node:fs'
import {join} from 'node:path'
import type {MandaraxExtension, ExtensionServerContributions} from '@mandarax/extensions'
import {collectServerContributions} from '@mandarax/extensions'

// The vite virtual module that discovers + applies CLIENT halves in the browser; its body (the glob)
// comes from @mandarax/extensions. The ids are vite conventions, so they live with the bundler hook.
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

// Load each extension's SERVER half via the bundler's TS loader and collect its contributions (extra
// agent tools + system prompt text) to hand to the engine. `load` is the bundler's module evaluator
// (vite's ssrLoadModule) so no separate transpiler is needed.
export async function loadServerContributions(
  root: string,
  load: (path: string) => Promise<{default?: unknown}>,
): Promise<ExtensionServerContributions> {
  const files = extensionFiles(root)
  const extensions: MandaraxExtension[] = []
  for (const file of files) {
    const mod = await load(file)
    if (mod.default) extensions.push(mod.default as MandaraxExtension)
  }
  return collectServerContributions(extensions)
}
