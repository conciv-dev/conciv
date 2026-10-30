import {readdir} from 'node:fs/promises'
import {join} from 'node:path'
import {defineExtension} from '@conciv/extension'
import type {BundlerBridge} from '@conciv/protocol/bundler-types'
import {designConfig} from './shared/config.js'
import {DESIGN_EXTENSION_NAME} from './shared/defs.js'
import type {CssMap, DesignRuntime} from './shared/types.js'
import {buildCssMap} from './server/provenance/css-map.js'
import {pickRuntime} from './server/registries.js'
import {createTargetStore} from './server/store.js'
import {SERVER_STEPS} from './tool/server.js'

async function cssFiles(cwd: string): Promise<string[]> {
  const root = join(cwd, 'src')
  const names = await readdir(root, {recursive: true}).catch(() => [])
  return names.filter((name) => name.endsWith('.css') && !name.includes('node_modules')).map((name) => join(root, name))
}

function lazyCssMap(input: {cwd: string; bundler: BundlerBridge | undefined}): {
  cssMap: () => Promise<CssMap>
  dispose: () => void
} {
  const build = async (): Promise<CssMap> => buildCssMap({cwd: input.cwd, files: await cssFiles(input.cwd)})
  const cache: {map: Promise<CssMap> | null} = {map: null}
  const unsubscribe = input.bundler?.subscribe?.((diagnostic) => {
    if (diagnostic.kind === 'hmr-update' && diagnostic.file.endsWith('.css')) cache.map = null
  })
  if (unsubscribe === undefined) return {cssMap: build, dispose: () => {}}
  return {
    cssMap: () => {
      cache.map ??= build()
      return cache.map
    },
    dispose: unsubscribe,
  }
}

export const design = defineExtension({
  name: DESIGN_EXTENSION_NAME,
  configSchema: designConfig,
  tools: SERVER_STEPS,
}).server((server) => {
  const css = lazyCssMap({cwd: server.cwd, bundler: server.bundler})
  const runtime: DesignRuntime = {
    ...pickRuntime({config: server.config, server}),
    store: createTargetStore({dir: join(server.stateDir, 'design'), cwd: server.cwd}),
    cssMap: css.cssMap,
  }
  return {context: {design: runtime}, dispose: css.dispose}
})

export default design
