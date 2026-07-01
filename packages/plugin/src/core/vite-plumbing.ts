import type {Plugin} from 'vite'
import {addSourceToJsx} from './inject-source.js'
import {compileExtensionSolid, isExtensionModule} from './compile-extension.js'
import {splitExtension} from './split-extension.js'
import {type Builtins, EXTENSIONS_RESOLVED_ID, EXTENSIONS_VIRTUAL_ID, extensionsModuleSource} from './extensions.js'

// The widget + extensions must share ONE solid + one @conciv/extension instance (so an extension's
// useContext resolves the widget's Provider): dedupe collapses duplicate copies; exclude keeps Vite's
// dep optimizer from re-inlining them.
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

// Extension files (conciv/extensions/*) are a Solid zone for the client bundle: collapse every
// .server(fn) call + dead-code-eliminate its node imports, then compile the JSX with Solid before the
// host's React transform runs. Everything else gets the data-conciv-source stamp (unless TanStack
// devtools' injector already owns it).
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

// The shared conciv build plumbing as a standalone Vite plugin: the solid/extension dedupe config,
// the virtual:conciv-extensions module, and the source-inject + extension transform. No engine boot
// and no widget middleware (those are serve-only, in makeViteHook). The extension-testkit composes this
// exact plugin so source injection + extension handling live in ONE place, never reimplemented.
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
