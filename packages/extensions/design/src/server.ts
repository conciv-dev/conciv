import {createRequire} from 'node:module'
import {dirname, join, relative} from 'node:path'
import {fileURLToPath} from 'node:url'
import {createStorage} from 'unstorage'
import fsDriver from 'unstorage/drivers/fs'
import {defineExtension} from '@conciv/extension'
import type {BundlerBridge} from '@conciv/protocol/bundler-types'
import {designConfig, TOLERANCES} from './shared/tolerances.js'
import {DESIGN_EXTENSION_NAME, DESIGN_GUIDE, type DesignRuntime} from './shared/defs.js'
import {COLOR_METRICS, PIXEL_COMPARATORS} from './server/raster.js'
import {createFigmaAdapter} from './server/sources/figma.js'
import {createImageAdapter, destroyPaddle, ROLE_RULES, SEGMENTERS, TEXT_READERS} from './server/sources/image.js'
import {createDiffer} from './server/differ.js'
import {createStore} from './server/store.js'
import {WORDS} from './server/words.js'
import {createGeometry} from './server/geometry.js'
import {SIMILARITY} from './server/pairers/similarity.js'
import {createVotePairer} from './server/pairers/vote.js'
import {rankByImpact} from './server/rankers.js'
import {createDeltas} from './server/deltas.js'
import {createMeasurer} from './server/measure.js'
import {createJudge} from './server/judge.js'
import {createProvenance} from './server/provenance.js'
import {createRegistrar} from './server/register.js'
import {SERVER_STEPS} from './server/tools.js'
import {createXrayRoutes} from './server/xray-routes.js'

const TAKUMI_WASM_EXPORT = 'takumi-paint/takumi_paint_wasm_bg.wasm'
const TARGET_IMAGE = 'target.png'

export const design = defineExtension({
  name: DESIGN_EXTENSION_NAME,
  configSchema: designConfig,
  tools: SERVER_STEPS,
}).server((server) => {
  const {config} = server
  const designDir = join(server.stateDir, 'design')
  const state = createStorage({driver: fsDriver({base: designDir})})
  const project = createStorage({driver: fsDriver({base: server.cwd, readOnly: true})})
  const changes = sourceChanges(server.bundler)
  const store = createStore({state, words: WORDS})
  const comparators = {
    pixel: PIXEL_COMPARATORS[config.comparator],
    color: COLOR_METRICS[config.color],
    text: TEXT_READERS[config.text],
  }
  const roles = ROLE_RULES[config.roles]
  const geometry = createGeometry({tolerances: TOLERANCES})
  const pairers = {vote: () => createVotePairer({similarity: SIMILARITY, geometry})}
  const ranker = rankByImpact
  const provenance = createProvenance({project, cwd: server.cwd, bundler: server.bundler})
  const deltas = createDeltas({
    geometry,
    color: comparators.color,
    liveText: provenance.liveText,
  })
  const measurer = createMeasurer({color: comparators.color, comparator: comparators.pixel})
  const judge = createJudge({ranker, words: WORDS, deltas, color: comparators.color})
  const registrar = createRegistrar({
    adapters: [
      createImageAdapter({reader: comparators.text, segmenter: SEGMENTERS[config.segmenter], roles}),
      createFigmaAdapter({token: process.env.FIGMA_API_KEY ?? null, roles}),
    ],
    store,
    measurer,
    project,
    cwd: server.cwd,
  })
  const runtime: DesignRuntime = {
    cwd: server.cwd,
    blind: config.blind,
    state,
    project,
    store,
    comparators,
    pairer: pairers[config.pairer](),
    ranker,
    words: WORDS,
    deltas,
    geometry,
    measurer,
    judge,
    provenance,
    registrar,
    xrayUrl: ({id, session}) => {
      const origin = server.nativeUrl()
      const query = `target=${encodeURIComponent(id)}&session=${encodeURIComponent(session)}`
      return {
        url: `${origin ?? server.basePath}/api/ext/${DESIGN_EXTENSION_NAME}/xray/list?${query}`,
        absolute: origin !== undefined,
      }
    },
  }
  const differ = createDiffer({runtime, page: server.page, bundler: server.bundler})
  const xray = createXrayRoutes({
    store,
    state,
    differ,
    targetImage: (id) => relative(server.cwd, join(designDir, id, TARGET_IMAGE)),
    sourceChangedAt: changes.sourceChangedAt,
    page: fileURLToPath(new URL('xray/', import.meta.url)),
    takumi: dirname(createRequire(import.meta.url).resolve(TAKUMI_WASM_EXPORT)),
    designDir,
    cwd: server.cwd,
  })
  return {
    context: {
      design: runtime,
      differ,
    },
    systemPrompt: async ({sessionId}) =>
      (await store.current(sessionId)) === null ? undefined : designGuide(config.blind),
    router: xray.router,
    app: xray.app,
    dispose: async () => {
      await destroyPaddle()
      provenance.dispose()
      changes.dispose()
      differ.dispose()
    },
  }
})

export default design

export type XrayRouter = ReturnType<typeof createXrayRoutes>['router']

function designGuide(blind: boolean): string {
  return blind ? `${DESIGN_GUIDE} ${BLIND_GUIDE}` : DESIGN_GUIDE
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

const BLIND_GUIDE = "Never open a png or take a screenshot; the tool's numbers are the only view of the page you have."
