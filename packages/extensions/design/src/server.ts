import {createRequire} from 'node:module'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {createStorage} from 'unstorage'
import fsDriver from 'unstorage/drivers/fs'
import {closeHomeDb, openHomeDb} from '@conciv/db'
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
import {createCatalog} from './server/catalog/catalog.js'
import {createViteOxcSource} from './server/catalog/vite-oxc-source.js'
import {createNameVariantHinter} from './server/catalog/name-variant-hinter.js'
import {backfillRelation} from './server/catalog/backfill-relation.js'
import {createCssTokenSource} from './server/catalog/token-source.js'

const DESIGN_EXTENSION_NAME = 'design'

const TAKUMI_WASM_EXPORT = 'takumi-paint/takumi_paint_wasm_bg.wasm'

const FILES_ROOT = '/'

const ASSET_FOLDER = ['public', 'design']

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
  const home = openHomeDb(server.home)
  const componentSources = {'vite-oxc': createViteOxcSource()}
  const catalog = createCatalog({
    home,
    db,
    cwd: server.cwd,
    sources: config.catalog.sources.map((source) => componentSources[source]),
  })
  const backfilled = backfillRelation({db, catalog}).catch(() => 0)
  const tokenSources = {css: createCssTokenSource({files: config.catalog.tokenFiles, catalog})}
  const runtime: DesignRuntime = {
    cwd: server.cwd,
    home,
    state,
    project,
    files,
    store: createStore({db, state, run: createRuns(db).current, catalog}),
    adapters: [
      createImageAdapter({config}),
      createFigmaAdapter({
        token: process.env.FIGMA_API_KEY ?? null,
        config,
        folder: createStorage({driver: fsDriver({base: join(server.cwd, ...ASSET_FOLDER)})}),
        cache: createStorage({driver: fsDriver({base: join(server.stateDir, 'design', 'assets')})}),
      }),
    ],
    measurer,
    pairer: pairerBySource({figma: createFigmaNodePairer(), image: createVotePairer()}),
    comparator: config.comparator,
    tokens: config.catalog.tokens.map((source) => tokenSources[source]),
  }
  const differ = createDiffer({
    show: config.show,
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
    context: {
      design: runtime,
      differ,
      db,
      catalog,
      catalogConfig: config.catalog,
      hinters: [createNameVariantHinter()],
    },
    router: xray.router,
    app: xray.app,
    dispose: async () => {
      await backfilled
      await Promise.all(runtime.adapters.map((adapter) => adapter.dispose?.()))
      differ.dispose()
      measurer.dispose()
      closeHomeDb(runtime.home)
    },
  }
})

export {design, design as default, type XrayRouter}

type XrayRouter = ReturnType<typeof createXrayRoutes>['router']

function pairerBySource(pairers: Record<Design['source']['kind'], Pairer>): Pairer {
  return (input) => pairers[input.design.source.kind](input)
}
