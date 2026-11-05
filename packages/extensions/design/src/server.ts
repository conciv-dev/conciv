import {createRequire} from 'node:module'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {createStorage} from 'unstorage'
import fsDriver from 'unstorage/drivers/fs'
import {defineExtension} from '@conciv/extension'
import type {BundlerBridge} from '@conciv/protocol/bundler-types'
import {designConfig} from './shared/tolerances.js'
import type {DesignRuntime} from './shared/defs.js'
import {createStore} from './server/store.js'
import {createFigmaAdapter} from './server/sources/figma.js'
import {createImageAdapter} from './server/sources/image.js'
import {createMeasurer} from './server/measure.js'
import {createVotePairer} from './server/pairers/vote.js'
import {createDeltas} from './server/deltas.js'
import {createJudge} from './server/judge.js'
import {createWords} from './server/words.js'
import {createRunner} from './server/runner.js'
import {createDiffer} from './server/differ.js'
import {createXrayRoutes} from './server/xray-routes.js'
import {SERVER_STEPS} from './server/tools.js'

const DESIGN_EXTENSION_NAME = 'design'

const TAKUMI_WASM_EXPORT = 'takumi-paint/takumi_paint_wasm_bg.wasm'

const FILES_ROOT = '/'

const design = defineExtension({
  name: DESIGN_EXTENSION_NAME,
  configSchema: designConfig,
  tools: SERVER_STEPS,
}).server((server) => {
  const {config} = server
  const state = createStorage({driver: fsDriver({base: join(server.stateDir, 'design')})})
  const project = createStorage({driver: fsDriver({base: server.cwd, readOnly: true})})
  const files = createStorage({driver: fsDriver({base: FILES_ROOT, readOnly: true})})
  const changes = sourceChanges(server.bundler)
  const words = createWords({config, cwd: server.cwd})
  const store = createStore({state, words})
  const measurer = createMeasurer({config})
  const deltas = createDeltas({config, project, cwd: server.cwd, bundler: server.bundler})
  const runtime: DesignRuntime = {
    cwd: server.cwd,
    blind: config.blind,
    state,
    project,
    files,
    store,
    adapters: [createImageAdapter({config}), createFigmaAdapter({token: process.env.FIGMA_API_KEY ?? null, config})],
    measurer,
    pairer: createVotePairer(),
    deltas,
    judge: createJudge({config}),
    words,
    xrayUrl: ({id, session}) => {
      const origin = server.nativeUrl()
      const query = `target=${encodeURIComponent(id)}&session=${encodeURIComponent(session)}`
      return {
        url: `${origin ?? server.basePath}/api/ext/${DESIGN_EXTENSION_NAME}/xray/list?${query}`,
        absolute: origin !== undefined,
      }
    },
  }
  const differ = createDiffer({
    runtime,
    runner: createRunner(runtime),
    page: server.page,
    bundler: server.bundler,
  })
  const xray = createXrayRoutes({
    runtime,
    differ,
    pageDir: fileURLToPath(new URL('xray/', import.meta.url)),
    takumiDir: dirname(createRequire(import.meta.url).resolve(TAKUMI_WASM_EXPORT)),
    sourceChangedAt: changes.sourceChangedAt,
  })
  return {
    context: {design: runtime, differ},
    systemPrompt: async ({sessionId}) =>
      (await store.current(sessionId)) === null ? undefined : words.guide({blind: config.blind}),
    router: xray.router,
    app: xray.app,
    dispose: async () => {
      await Promise.all(runtime.adapters.map((adapter) => adapter.dispose?.()))
      changes.dispose()
      differ.dispose()
      deltas.dispose()
      measurer.dispose()
    },
  }
})

export {design, design as default, type XrayRouter}

type XrayRouter = ReturnType<typeof createXrayRoutes>['router']

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
