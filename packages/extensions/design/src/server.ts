import {readdir} from 'node:fs/promises'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {defineExtension, type ServerApi} from '@conciv/extension'
import type {BundlerBridge} from '@conciv/protocol/bundler-types'
import {designConfig, type DesignConfig} from './shared/tolerances.js'
import {DESIGN_EXTENSION_NAME, DESIGN_GUIDE} from './shared/defs.js'
import type {CssMap, DesignRuntime} from './shared/types.js'
import {COLOR_METRICS, DELTA_KINDS} from './server/deltas.js'
import {createDiffer, GEOMETRY, MATCHERS, PIXEL_COMPARATORS, SERVER_STEPS} from './server/differ.js'
import {buildCssMap, MAPPERS} from './server/provenance.js'
import {createTargetStore} from './server/store.js'
import {ADAPTERS, destroyPaddle, ENRICHERS, ROLE_RULES, SEGMENTERS, TEXT_READERS} from './server/target.js'
import {makeXrayApp, makeXrayRouter} from './server/xray-routes.js'

function pickRuntime(input: {
  config: DesignConfig
  server: ServerApi<DesignConfig>
}): Omit<DesignRuntime, 'store' | 'cssMap' | 'xrayUrl'> {
  const {config} = input
  return {
    cwd: input.server.cwd,
    comparators: {
      pixel: PIXEL_COMPARATORS[config.comparator],
      geometry: GEOMETRY[config.geometry],
      color: COLOR_METRICS[config.color],
      text: TEXT_READERS[config.text],
    },
    matcher: MATCHERS[config.matcher],
    adapters: ADAPTERS,
    enrichers: ENRICHERS,
    segmenter: SEGMENTERS[config.segmenter],
    roles: ROLE_RULES[config.roles],
    deltaKinds: DELTA_KINDS,
    mappers: MAPPERS,
  }
}

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

function sourceChanges(bundler: BundlerBridge | undefined): {
  sourceChangedAt: () => number | null
  dispose: () => void
} {
  const last: {at: number | null} = {at: null}
  const unsubscribe = bundler?.subscribe?.((diagnostic) => {
    if (diagnostic.kind === 'hmr-update') last.at = diagnostic.timestamp
  })
  return {sourceChangedAt: () => last.at, dispose: unsubscribe ?? (() => {})}
}

export const design = defineExtension({
  name: DESIGN_EXTENSION_NAME,
  configSchema: designConfig,
  tools: SERVER_STEPS,
}).server((server) => {
  const css = lazyCssMap({cwd: server.cwd, bundler: server.bundler})
  const changes = sourceChanges(server.bundler)
  const designDir = join(server.stateDir, 'design')
  const store = createTargetStore({dir: designDir, cwd: server.cwd})
  const runtime: DesignRuntime = {
    ...pickRuntime({config: server.config, server}),
    store,
    cssMap: css.cssMap,
    xrayUrl: ({id, session}) => {
      const origin = server.nativeUrl()
      const query = `target=${encodeURIComponent(id)}&session=${encodeURIComponent(session)}`
      return {
        url: `${origin ?? server.basePath}/api/ext/${DESIGN_EXTENSION_NAME}/xray/list?${query}`,
        absolute: origin !== undefined,
      }
    },
  }
  return {
    context: {design: runtime, differ: createDiffer({runtime, store, page: server.page})},
    systemPrompt: async ({sessionId}) =>
      (await store.current({session: sessionId})) === null ? undefined : DESIGN_GUIDE,
    router: makeXrayRouter({store, designDir, sourceChangedAt: changes.sourceChangedAt}),
    app: makeXrayApp({store, pageDir: fileURLToPath(new URL('xray/', import.meta.url)), designDir, cwd: server.cwd}),
    dispose: async () => {
      await destroyPaddle()
      css.dispose()
      changes.dispose()
    },
  }
})

export default design
