import {createRequire} from 'node:module'
import {dirname, join} from 'node:path'
import {createStorage} from 'unstorage'
import fsDriver from 'unstorage/drivers/fs'
import {closeHomeDb, openHomeDb} from '@conciv/db'
import {defineExtension} from '@conciv/extension'
import {SessionId} from '@conciv/protocol/chat-types'
import type {RunStatus} from '@conciv/protocol/chat-event-types'
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
import {designSources} from './server/sources.js'
import {createCatalog} from './server/catalog/catalog.js'
import {createViteOxcSource} from './server/catalog/vite-oxc-source.js'
import {createNameVariantHinter} from './server/catalog/name-variant-hinter.js'
import {createComponentRows} from './server/catalog/component-rows.js'
import {backfillRelation} from './server/catalog/backfill-relation.js'
import {createCssTokenSource} from './server/catalog/token-source.js'
import {createPreviewServer} from './server/catalog/preview-server.js'
import {openStore} from './server/runs/open-store.js'
import {createSessionRuns} from './server/runs/session-runs.js'
import {storeTables} from './server/runs/store-tables.js'
import {projectKey} from './server/catalog/project-key.js'
import {storeSources} from './server/runs/sources.js'
import {DESIGN_COMMANDS} from './server/runs/commands/design-commands.js'

const DESIGN_EXTENSION_NAME = 'design'

const extensionDir = dirname(createRequire(import.meta.url).resolve('@conciv/extension-design/package.json'))

const UNFINISHED = new Set<RunStatus>(['running', 'interrupted'])

const TAKUMI_WASM_EXPORT = 'takumi-paint/takumi_paint_wasm_bg.wasm'

const FILES_ROOT = '/'

const PUBLIC_FOLDER = 'public'

const ASSET_FOLDER = [PUBLIC_FOLDER, 'design']

const design = defineExtension({
  name: DESIGN_EXTENSION_NAME,
  configSchema: designConfig,
  tools: SERVER_STEPS,
  sources: () => ({...designSources(), ...storeSources()}),
  cliCommands: DESIGN_COMMANDS,
  devServer: createPreviewServer,
}).server((server) => {
  const {config, db} = server
  if (db === undefined) throw new Error('the design extension reads its sources through the conciv database')
  const state = createStorage({driver: fsDriver({base: join(server.stateDir, 'design')})})
  const project = createStorage({driver: fsDriver({base: server.cwd, readOnly: true})})
  const files = createStorage({driver: fsDriver({base: FILES_ROOT, readOnly: true})})
  const measurer = createMeasurer({config})
  const home = openHomeDb(server.home)
  const opened = openStore(server.home)
  const store = {orm: opened.orm, tables: storeTables}
  const runs = createSessionRuns({
    orm: opened.orm,
    cwd: server.cwd,
    extensionDir,
    labels: config.runs,
    harness: (sessionId) => server.harness(SessionId.parse(sessionId)).id,
  })
  const componentSources = {'vite-oxc': createViteOxcSource()}
  const catalog = createCatalog({
    home,
    db: store,
    cwd: server.cwd,
    sources: config.catalog.sources.map((source) => componentSources[source]),
  })
  const backfilled = backfillRelation({db: store, catalog}).catch(() => 0)
  const tokenSources = {css: createCssTokenSource({files: config.catalog.tokenFiles, catalog})}
  const hinters = [createNameVariantHinter()]
  const runtime: DesignRuntime = {
    cwd: server.cwd,
    home,
    state,
    project,
    files,
    runs,
    store: createStore({db: store, home: server.home, state, runs, project: projectKey({cwd: server.cwd}), catalog}),
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
    components: createComponentRows({catalog, hinters, config: config.catalog, cwd: server.cwd}),
    symbolicate: server.symbolicate,
  }
  const differ = createDiffer({
    show: config.show,
    runtime,
    runner: createRunner({
      runtime,
      folder: createStorage({driver: fsDriver({base: join(server.cwd, PUBLIC_FOLDER), readOnly: true})}),
    }),
    page: server.page,
    bundler: server.bundler,
  })
  const xray = createXrayRoutes({
    runtime,
    catalog,
    hotkeys: config.hotkeys,
    takumiDir: dirname(createRequire(import.meta.url).resolve(TAKUMI_WASM_EXPORT)),
  })
  return {
    context: {
      design: runtime,
      differ,
      db,
      catalog,
      catalogConfig: config.catalog,
      hinters,
    },
    router: xray.router,
    app: xray.app,
    turnEnd: (sessionId, run) =>
      UNFINISHED.has(run.status)
        ? undefined
        : runs.close(sessionId, {
            status: run.status,
            ended: run.finishedAt ?? Date.now(),
            ...(run.usage === undefined ? {} : {usage: run.usage}),
            ...(run.error === undefined ? {} : {error: run.error}),
          }),
    sessionEnd: (sessionId) =>
      runs.close(sessionId, {status: (verdict) => (verdict === 'done' ? 'completed' : 'aborted'), ended: Date.now()}),
    dispose: async () => {
      await backfilled
      await runs.closeAll({status: 'aborted', ended: Date.now()})
      await Promise.all(runtime.adapters.map((adapter) => adapter.dispose?.()))
      differ.dispose()
      measurer.dispose()
      closeHomeDb(runtime.home)
      opened.close()
    },
  }
})

export {design, design as default, type XrayRouter}

type XrayRouter = ReturnType<typeof createXrayRoutes>['router']

function pairerBySource(pairers: Record<Design['source']['kind'], Pairer>): Pairer {
  return (input) => pairers[input.design.source.kind](input)
}
