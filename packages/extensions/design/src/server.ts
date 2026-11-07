import {createRequire} from 'node:module'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {createStorage} from 'unstorage'
import fsDriver from 'unstorage/drivers/fs'
import {defineExtension} from '@conciv/extension'
import {designConfig} from './shared/tolerances.js'
import type {Design, DesignRuntime, Pairer} from './shared/defs.js'
import {createStore} from './server/store.js'
import {createFigmaAdapter} from './server/sources/figma.js'
import {createImageAdapter} from './server/sources/image.js'
import {createMeasurer} from './server/measure.js'
import {createVotePairer} from './server/pairers/vote.js'
import {createFigmaNodePairer} from './server/pairers/figma-nodes.js'
import {createRunner} from './server/runner.js'
import {createDiffer} from './server/differ.js'
import {createXrayRoutes} from './server/xray-routes.js'
import {SERVER_STEPS} from './server/tools.js'
import {designTables} from './server/tables.js'
import {designSources} from './server/sources.js'
import {migrations} from './server/migrations.gen.js'
import {createRuns} from './server/runs.js'
import {DESIGN_COMMANDS} from './server/commands.js'

const DESIGN_EXTENSION_NAME = 'design'

const TAKUMI_WASM_EXPORT = 'takumi-paint/takumi_paint_wasm_bg.wasm'

const FILES_ROOT = '/'

const design = defineExtension({
  name: DESIGN_EXTENSION_NAME,
  configSchema: designConfig,
  tools: SERVER_STEPS,
  tables: designTables,
  sources: designSources,
  migrations,
  cliCommands: DESIGN_COMMANDS,
}).server((server) => {
  const {config, db} = server
  const state = createStorage({driver: fsDriver({base: join(server.stateDir, 'design')})})
  const project = createStorage({driver: fsDriver({base: server.cwd, readOnly: true})})
  const files = createStorage({driver: fsDriver({base: FILES_ROOT, readOnly: true})})
  const measurer = createMeasurer({config})
  const runtime: DesignRuntime = {
    cwd: server.cwd,
    state,
    project,
    files,
    store: createStore({db, state, run: createRuns(db).current}),
    adapters: [createImageAdapter({config}), createFigmaAdapter({token: process.env.FIGMA_API_KEY ?? null, config})],
    measurer,
    pairer: pairerBySource({figma: createFigmaNodePairer(), image: createVotePairer()}),
    comparator: config.comparator,
  }
  const differ = createDiffer({
    runtime,
    runner: createRunner(runtime),
    page: server.page,
    bundler: server.bundler,
  })
  const xray = createXrayRoutes({
    runtime,
    pageDir: fileURLToPath(new URL('xray/', import.meta.url)),
    takumiDir: dirname(createRequire(import.meta.url).resolve(TAKUMI_WASM_EXPORT)),
  })
  return {
    context: {design: runtime, differ, db},
    router: xray.router,
    app: xray.app,
    dispose: async () => {
      await Promise.all(runtime.adapters.map((adapter) => adapter.dispose?.()))
      differ.dispose()
      measurer.dispose()
    },
  }
})

export {design, design as default, type XrayRouter}

type XrayRouter = ReturnType<typeof createXrayRoutes>['router']

function pairerBySource(pairers: Record<Design['source']['kind'], Pairer>): Pairer {
  return (input) => pairers[input.design.source.kind](input)
}
