import {readdir, readFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {dirname, extname, join, resolve, sep} from 'node:path'
import {fileURLToPath} from 'node:url'
import {defineExtension, type ServerApi} from '@conciv/extension'
import type {BundlerBridge} from '@conciv/protocol/bundler-types'
import {designConfig, TOLERANCES, type DesignConfig} from './shared/tolerances.js'
import {BLIND_GUIDE, DESIGN_EXTENSION_NAME, DESIGN_GUIDE, MARK_KINDS} from './shared/defs.js'
import type {Box, CssMap, DesignRuntime, Differ, Raster, TargetStore} from './shared/types.js'
import {besides, COLOR_METRICS, cutout, decodePng, DELTA_KINDS, downscale, encodePng} from './server/raster.js'
import {
  createFigmaAdapter,
  destroyPaddle,
  ENRICHERS,
  imageAdapter,
  ROLE_RULES,
  SEGMENTERS,
  TEXT_READERS,
} from './server/target.js'
import {buildCssMap, createDiffer, MAPPERS, PIXEL_COMPARATORS, SERVER_STEPS} from './server/differ.js'
import {watchSettled} from './server/loop.js'
import {PAIRERS, RANKERS} from './server/pair.js'
import {createTargetStore, TARGET_FILE} from './server/store.js'
import {ORPCError, os} from '@orpc/server'
import {Hono, type Context} from 'hono'
import {getMimeType} from 'hono/utils/mime'
import {z} from 'zod'
import {SessionId} from '@conciv/protocol/chat-types'
import type {RpcContext} from '@conciv/protocol/rpc-types'

const TAKUMI_WASM_EXPORT = 'takumi-paint/takumi_paint_wasm_bg.wasm'

function pickRuntime(input: {
  config: DesignConfig
  server: ServerApi<DesignConfig>
}): Omit<DesignRuntime, 'store' | 'cssMap' | 'xrayUrl'> {
  const {config} = input
  return {
    cwd: input.server.cwd,
    blind: config.blind,
    comparators: {
      pixel: PIXEL_COMPARATORS[config.comparator],
      color: COLOR_METRICS[config.color],
      text: TEXT_READERS[config.text],
    },
    pairer: PAIRERS[config.pairer],
    ranker: RANKERS[config.ranker],
    adapters: [imageAdapter, createFigmaAdapter({token: process.env.FIGMA_API_KEY ?? null})],
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
  const differ = createDiffer({runtime, store, page: server.page})
  const settled = watchSettled({
    bundler: server.bundler,
    store,
    page: server.page,
    refresh: differ.refresh,
    touch: differ.touch,
  })
  return {
    context: {
      design: runtime,
      differ: {
        ...differ,
        run: async (request) => {
          await settled.quiet()
          return differ.run(request)
        },
      },
    },
    systemPrompt: async ({sessionId}) =>
      (await store.current({session: sessionId})) === null ? undefined : designGuide(server.config.blind),
    router: makeXrayRouter({store, differ, designDir, sourceChangedAt: changes.sourceChangedAt}),
    app: makeXrayApp({
      store,
      pageDir: fileURLToPath(new URL('xray/', import.meta.url)),
      designDir,
      cwd: server.cwd,
      takumiDir: dirname(createRequire(import.meta.url).resolve(TAKUMI_WASM_EXPORT)),
    }),
    dispose: async () => {
      await destroyPaddle()
      css.dispose()
      changes.dispose()
      settled.dispose()
    },
  }
})

export default design

function designGuide(blind: boolean): string {
  return blind ? `${DESIGN_GUIDE} ${BLIND_GUIDE}` : DESIGN_GUIDE
}

const PAGE_FILE = 'index.html'
const NOT_BUILT = 'the x-ray page is not built; build @conciv/extension-design'
const NonEmptySchema = z.string().min(1)
const TargetSchema = z.object({id: NonEmptySchema})
const RunSchema = TargetSchema.extend({session: SessionId})
const WASM_EXTENSION = '.wasm'
const CROP_GAP = 4
const NodeQuerySchema = z.object({target: NonEmptySchema, node: NonEmptySchema, run: NonEmptySchema.optional()})
const WASM_HEADERS = {'content-type': 'application/wasm', 'cache-control': 'public, max-age=31536000, immutable'}

const xrayOs = os.$context<RpcContext>()

function makeXrayRouter(input: {
  store: TargetStore
  differ: Pick<Differ, 'capture' | 'accept'>
  designDir: string
  sourceChangedAt: () => number | null
}) {
  const {store, differ, designDir, sourceChangedAt} = input
  const decided = async (run: {id: string; session: SessionId}) => ({
    report: await differ.capture(run).catch(() => null),
  })
  return xrayOs.router({
    xray: {
      targets: xrayOs
        .input(z.object({route: z.string().optional()}))
        .handler(({input: filter}) => store.list(filter.route === undefined ? {} : {route: filter.route})),
      current: xrayOs.input(z.object({session: z.string()})).handler(({input: query}) => store.current(query)),
      stamp: xrayOs.input(TargetSchema).handler(async ({input: query}) => ({
        run: (await store.latestRun(query.id))?.run ?? null,
        sourceChangedAt: sourceChangedAt(),
      })),
      report: xrayOs.input(TargetSchema).handler(async ({input: query}) => {
        const target = await store.find({id: query.id})
        if (target === null) throw new ORPCError('NOT_FOUND', {message: `no design target with id ${query.id}`})
        const latest = await store.latestRun(target.id)
        return {
          target,
          report: latest?.report ?? null,
          pairs: latest?.pairs ?? [],
          decisions: await store.decisions(target.id),
          twins: await store.twins(target.id),
          ledger: await store.ledger(target.id),
          design: await store.design(target.id),
          targetImage: store.reportPath(join(designDir, target.id, TARGET_FILE)),
          nodes: await store.model(target.id).then(
            (model) => model.nodes,
            () => [],
          ),
          sourceChangedAt: sourceChangedAt(),
        }
      }),
      pin: xrayOs
        .input(RunSchema.extend({node: NonEmptySchema, path: NonEmptySchema}))
        .handler(async ({input: request}) => {
          const decision = await store.decide({id: request.id, kind: 'pin', anchor: request.node, value: request.path})
          return {decision, ...(await decided(request))}
        }),
      unpin: xrayOs.input(RunSchema.extend({decision: NonEmptySchema})).handler(async ({input: request}) => {
        const revoked = await store.revoke({id: request.id, decision: request.decision})
        return {revoked, ...(await decided(request))}
      }),
      mark: xrayOs
        .input(
          RunSchema.extend({
            kind: z.enum(MARK_KINDS),
            node: NonEmptySchema,
            value: z.union([z.string(), z.number()]).optional(),
          }),
        )
        .handler(async ({input: request}) => {
          const decision = await store.decide({
            id: request.id,
            kind: request.kind,
            anchor: request.node,
            value: request.value ?? null,
          })
          return {decision, ...(await decided(request))}
        }),
      revoke: xrayOs.input(RunSchema.extend({decision: NonEmptySchema})).handler(async ({input: request}) => {
        const revoked = await store.revoke({id: request.id, decision: request.decision})
        return {revoked, ...(await decided(request))}
      }),
      accept: xrayOs.input(TargetSchema).handler(async ({input: request}) => {
        const target = await differ.accept({id: request.id})
        return {target, report: await store.lastResult(target.id)}
      }),
      capture: xrayOs.input(RunSchema).handler(({input: request}) => differ.capture(request)),
    },
  })
}

function inside(input: {dir: string; path: string}): boolean {
  return input.path.startsWith(`${input.dir}${sep}`)
}

async function fileResponse(path: string): Promise<Response> {
  const body = await readFile(path).catch(() => null)
  if (body === null) return new Response('not found', {status: 404})
  return new Response(new Uint8Array(body), {
    headers: {'content-type': getMimeType(path) ?? 'application/octet-stream'},
  })
}

async function wasmResponse(path: string): Promise<Response> {
  const body = await readFile(path).catch(() => null)
  if (body === null) return new Response('not found', {status: 404})
  return new Response(new Uint8Array(body), {headers: WASM_HEADERS})
}

function makeXrayApp(input: {store: TargetStore; pageDir: string; designDir: string; cwd: string; takumiDir: string}) {
  const {store, pageDir, cwd} = input
  const takumiDir = resolve(input.takumiDir)
  const designDir = resolve(input.designDir)
  const root = resolve(pageDir)
  const cache: {page: string | null} = {page: null}
  const page = async (): Promise<string | null> => {
    cache.page ??= await readFile(join(root, PAGE_FILE), 'utf8').catch(() => null)
    return cache.page
  }
  const known = async (target: string | undefined): Promise<boolean> => {
    const id = NonEmptySchema.safeParse(target)
    return id.success && (await store.find({id: id.data})) !== null
  }
  const servePage = async (c: Context) => {
    if (!(await known(c.req.query('target')))) return c.text('not found', 404)
    const html = await page()
    if (html === null) return c.text(NOT_BUILT, 503)
    return c.html(html)
  }
  return new Hono()
    .get('/xray', async (c) => {
      if (!(await known(c.req.query('target')))) return c.text('not found', 404)
      return c.redirect(`xray/list${new URL(c.req.url).search}`)
    })
    .get('/xray/node', async (c) => {
      const query = NodeQuerySchema.safeParse(c.req.query())
      if (!query.success || !(await known(query.data.target))) return c.text('not found', 404)
      const png = await nodeCrop({store, designDir, ...query.data})
      if (png === null) return c.text('not found', 404)
      return new Response(new Uint8Array(png), {headers: {'content-type': 'image/png'}})
    })
    .get('/xray/list', servePage)
    .get('/xray/capture', servePage)
    .get('/xray/:asset{.+}', (c) => {
      const asset = NonEmptySchema.safeParse(c.req.param('asset'))
      if (!asset.success) return c.text('not found', 404)
      const path = resolve(root, asset.data)
      if (!inside({dir: root, path})) return c.text('not found', 404)
      return fileResponse(path)
    })
    .get('/takumi/:asset', (c) => {
      const path = resolve(takumiDir, c.req.param('asset'))
      if (!inside({dir: takumiDir, path}) || extname(path) !== WASM_EXTENSION) return c.text('not found', 404)
      return wasmResponse(path)
    })
    .get('/files/:file{.+}', (c) => {
      const file = NonEmptySchema.safeParse(c.req.param('file'))
      if (!file.success) return c.text('not found', 404)
      const path = resolve(cwd, file.data)
      if (!inside({dir: designDir, path})) return c.text('not found', 404)
      return fileResponse(path)
    })
}
export type XrayRouter = ReturnType<typeof makeXrayRouter>

async function nodeCrop(input: {
  store: TargetStore
  designDir: string
  target: string
  node: string
  run?: string | undefined
}): Promise<Uint8Array | null> {
  const {store, target, node} = input
  const model = await store.model(target).catch(() => null)
  const found = model?.nodes.find((entry) => entry.id === node)
  if (model === null || found === undefined) return null
  const designRaster = model.scale === 1 ? model.raster : downscale({raster: model.raster, scale: model.scale})
  const box = grown(scaled({box: found.box, scale: model.scale}))
  const designCrop = cutout({raster: designRaster, box})
  const live = await liveCrop({...input, box})
  return encodePng(live === null ? designCrop : besides({rasters: [designCrop, live], gap: CROP_GAP}))
}

async function liveCrop(input: {
  store: TargetStore
  designDir: string
  target: string
  node: string
  run?: string | undefined
  box: Box
}): Promise<Raster | null> {
  const {store, designDir, target, node, box} = input
  const run = input.run ?? (await store.latestRun(target))?.run
  if (run === undefined) return null
  const stored = await store.run({id: target, run})
  const live = stored?.pairs.find((pair) => pair.node === node)?.fingerprint?.box
  const bytes = await readFile(join(designDir, target, `live-${run}.png`)).catch(() => null)
  if (live === undefined || bytes === null) return null
  const margin = TOLERANCES.tileMargin
  return cutout({
    raster: decodePng(bytes),
    box: {...box, x: Math.round(live.x) - margin, y: Math.round(live.y) - margin},
  })
}

function scaled(input: {box: Box; scale: number}): Box {
  const {box, scale} = input
  return {x: box.x / scale, y: box.y / scale, w: box.w / scale, h: box.h / scale}
}

function grown(box: Box): Box {
  const margin = TOLERANCES.tileMargin
  return {
    x: Math.round(box.x) - margin,
    y: Math.round(box.y) - margin,
    w: Math.round(box.w) + 2 * margin,
    h: Math.round(box.h) + 2 * margin,
  }
}
