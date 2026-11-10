import {createRequire} from 'node:module'
import {dirname, join} from 'node:path'
import {createStorage} from 'unstorage'
import fsDriver from 'unstorage/drivers/fs'
import {desc, isNull} from 'drizzle-orm'
import {closeHomeDb, openHomeDb} from '@conciv/db'
import {defineExtension, type ExtensionDb} from '@conciv/extension'
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
import {createCatalog} from './server/catalog/catalog.js'
import {createViteOxcSource} from './server/catalog/vite-oxc-source.js'
import {createNameVariantHinter} from './server/catalog/name-variant-hinter.js'
import {createComponentRows} from './server/catalog/component-rows.js'
import {backfillRelation} from './server/catalog/backfill-relation.js'
import {createCssTokenSource} from './server/catalog/token-source.js'
import {createPreviewServer} from './server/catalog/preview-server.js'
import {openStore} from './server/runs/open-store.js'
import {storeSources} from './server/runs/sources.js'

const DESIGN_EXTENSION_NAME = 'design'

const TAKUMI_WASM_EXPORT = 'takumi-paint/takumi_paint_wasm_bg.wasm'

const FILES_ROOT = '/'

const PUBLIC_FOLDER = 'public'

const ASSET_FOLDER = [PUBLIC_FOLDER, 'design']

const design = defineExtension({
  name: DESIGN_EXTENSION_NAME,
  configSchema: designConfig,
  tools: SERVER_STEPS,
  tables: designTables,
  sources: (tables) => ({...designSources(tables), ...storeSources()}),
  migrations,
  devServer: createPreviewServer,
}).server((server) => {
  const {config, db} = server
  const state = createStorage({driver: fsDriver({base: join(server.stateDir, 'design')})})
  const project = createStorage({driver: fsDriver({base: server.cwd, readOnly: true})})
  const files = createStorage({driver: fsDriver({base: FILES_ROOT, readOnly: true})})
  const measurer = createMeasurer({config})
  const home = openHomeDb(server.home)
  openStore(server.home).close()
  const componentSources = {'vite-oxc': createViteOxcSource()}
  const catalog = createCatalog({
    home,
    db,
    cwd: server.cwd,
    sources: config.catalog.sources.map((source) => componentSources[source]),
  })
  const backfilled = backfillRelation({db, catalog}).catch(() => 0)
  const tokenSources = {css: createCssTokenSource({files: config.catalog.tokenFiles, catalog})}
  const hinters = [createNameVariantHinter()]
  const runtime: DesignRuntime = {
    cwd: server.cwd,
    home,
    state,
    project,
    files,
    store: createStore({db, state, run: () => openRun(db), catalog}),
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

async function openRun(db: ExtensionDb<ReturnType<typeof designTables>>): Promise<number | null> {
  const {runs} = db.tables
  const [open] = await db.orm
    .select({run: runs.run_id})
    .from(runs)
    .where(isNull(runs.ended))
    .orderBy(desc(runs.run_id))
    .limit(1)
  return open?.run ?? null
}
