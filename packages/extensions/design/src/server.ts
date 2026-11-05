import {createRequire} from 'node:module'
import {dirname, extname, join, relative, resolve, sep} from 'node:path'
import {fileURLToPath} from 'node:url'
import {createStorage, type Storage} from 'unstorage'
import fsDriver from 'unstorage/drivers/fs'
import {defineExtension, type ServerApi} from '@conciv/extension'
import type {BundlerBridge} from '@conciv/protocol/bundler-types'
import {designConfig, TOLERANCES, type DesignConfig} from './shared/tolerances.js'
import {
  BLIND_GUIDE,
  DESIGN_EXTENSION_NAME,
  DESIGN_GUIDE,
  MARK_KINDS,
  type DesignNode,
  type Store,
} from './shared/defs.js'
import type {Box, CssMap, DesignRuntime, Differ, Raster} from './shared/types.js'
import {find, walk} from './shared/tree.js'
import {besides, COLOR_METRICS, cutout, decodePng, DELTA_KINDS, downscale, encodePng} from './server/raster.js'
import {createFigmaAdapter} from './server/sources/figma.js'
import {createImageAdapter, destroyPaddle, ROLE_RULES, SEGMENTERS, TEXT_READERS} from './server/sources/image.js'
import {buildCssMap, createDiffer, MAPPERS, PIXEL_COMPARATORS, SERVER_STEPS} from './server/differ.js'
import {watchSettled} from './server/loop.js'
import {PAIRERS, RANKERS} from './server/pair.js'
import {createStore} from './server/store.js'
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
}): Omit<DesignRuntime, 'store' | 'state' | 'project' | 'cssMap' | 'xrayUrl'> {
  const {config} = input
  const roles = ROLE_RULES[config.roles]
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
    adapters: [
      createImageAdapter({reader: TEXT_READERS[config.text], segmenter: SEGMENTERS[config.segmenter], roles}),
      createFigmaAdapter({token: process.env.FIGMA_API_KEY ?? null, roles}),
    ],
    deltaKinds: DELTA_KINDS,
    mappers: MAPPERS,
  }
}

async function cssFiles(project: Storage): Promise<string[]> {
  const keys = await project.getKeys('src').catch(() => [])
  return keys.map((key) => key.replaceAll(':', '/')).filter((file) => file.endsWith('.css'))
}

function lazyCssMap(input: {project: Storage; bundler: BundlerBridge | undefined}): {
  cssMap: () => Promise<CssMap>
  dispose: () => void
} {
  const {project} = input
  const build = async (): Promise<CssMap> => buildCssMap({project, files: await cssFiles(project)})
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
  const designDir = join(server.stateDir, 'design')
  const state = createStorage({driver: fsDriver({base: designDir})})
  const project = createStorage({driver: fsDriver({base: server.cwd, readOnly: true})})
  const css = lazyCssMap({project, bundler: server.bundler})
  const changes = sourceChanges(server.bundler)
  const store = createStore(state)
  const runtime: DesignRuntime = {
    ...pickRuntime({config: server.config, server}),
    store,
    state,
    project,
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
      (await store.current(sessionId)) === null ? undefined : designGuide(server.config.blind),
    router: makeXrayRouter({
      store,
      differ,
      targetImage: (id) => relative(server.cwd, join(designDir, id, TARGET_IMAGE)),
      sourceChangedAt: changes.sourceChangedAt,
    }),
    app: makeXrayApp({
      store,
      state,
      page: readOnly(fileURLToPath(new URL('xray/', import.meta.url))),
      takumi: readOnly(dirname(createRequire(import.meta.url).resolve(TAKUMI_WASM_EXPORT))),
      designDir,
      cwd: server.cwd,
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
const TARGET_IMAGE = 'target.png'
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
  store: Store
  differ: Pick<Differ, 'capture' | 'accept' | 'xray'>
  targetImage: (id: string) => string
  sourceChangedAt: () => number | null
}) {
  const {store, differ, sourceChangedAt} = input
  const decided = async (run: {id: string; session: SessionId}) => ({
    report: await differ.capture(run).catch(() => null),
  })
  return xrayOs.router({
    xray: {
      targets: xrayOs
        .input(z.object({route: z.string().optional()}))
        .handler(({input: filter}) => store.list(filter.route)),
      current: xrayOs.input(z.object({session: z.string()})).handler(({input: query}) => store.current(query.session)),
      stamp: xrayOs.input(TargetSchema).handler(async ({input: query}) => ({
        run: (await store.runs(query.id)).at(-1) ?? null,
        sourceChangedAt: sourceChangedAt(),
      })),
      report: xrayOs.input(TargetSchema).handler(async ({input: query}) => {
        const target = await store.record(query.id)
        if (target === null) throw new ORPCError('NOT_FOUND', {message: `no design target with id ${query.id}`})
        const latest = (await store.runs(target.id)).at(-1)
        const stored = await store.design(target.id).catch(() => null)
        const {report, outline} = await differ.xray({id: target.id})
        return {
          target,
          report,
          run: latest === undefined ? null : await store.run({id: target.id, run: latest}),
          decisions: await store.decisions(target.id),
          design: outline,
          targetImage: input.targetImage(target.id),
          nodes: stored === null ? [] : designNodes(stored.root),
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
        return {target, report: (await differ.xray({id: target.id})).report}
      }),
      capture: xrayOs.input(RunSchema).handler(({input: request}) => differ.capture(request)),
    },
  })
}

function inside(input: {dir: string; path: string}): boolean {
  return input.path.startsWith(`${input.dir}${sep}`)
}

function readOnly(base: string): Storage {
  return createStorage({driver: fsDriver({base, readOnly: true})})
}

async function readRaw(input: {storage: Storage; key: string}): Promise<Uint8Array<ArrayBuffer> | null> {
  const raw: unknown = await input.storage.getItemRaw(input.key).catch(() => null)
  return raw instanceof Uint8Array ? new Uint8Array(raw) : null
}

async function fileResponse(input: {storage: Storage; key: string}): Promise<Response> {
  const body = await readRaw(input)
  if (body === null) return new Response('not found', {status: 404})
  return new Response(body, {headers: {'content-type': getMimeType(input.key) ?? 'application/octet-stream'}})
}

async function wasmResponse(input: {storage: Storage; key: string}): Promise<Response> {
  const body = await readRaw(input)
  if (body === null) return new Response('not found', {status: 404})
  return new Response(body, {headers: WASM_HEADERS})
}

function makeXrayApp(input: {
  store: Store
  state: Storage
  page: Storage
  takumi: Storage
  designDir: string
  cwd: string
}) {
  const {store, state, page: assets, takumi, cwd} = input
  const designDir = resolve(input.designDir)
  const cache: {page: string | null} = {page: null}
  const page = async (): Promise<string | null> => {
    const bytes = cache.page === null ? await readRaw({storage: assets, key: PAGE_FILE}) : null
    cache.page ??= bytes === null ? null : new TextDecoder().decode(bytes)
    return cache.page
  }
  const known = async (target: string | undefined): Promise<boolean> => {
    const id = NonEmptySchema.safeParse(target)
    return id.success && (await store.record(id.data)) !== null
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
      const png = await nodeCrop({store, ...query.data})
      if (png === null) return c.text('not found', 404)
      return new Response(new Uint8Array(png), {headers: {'content-type': 'image/png'}})
    })
    .get('/xray/list', servePage)
    .get('/xray/capture', servePage)
    .get('/xray/:asset{.+}', (c) => {
      const asset = NonEmptySchema.safeParse(c.req.param('asset'))
      if (!asset.success) return c.text('not found', 404)
      return fileResponse({storage: assets, key: asset.data})
    })
    .get('/takumi/:asset', (c) => {
      const asset = c.req.param('asset')
      if (extname(asset) !== WASM_EXTENSION) return c.text('not found', 404)
      return wasmResponse({storage: takumi, key: asset})
    })
    .get('/files/:file{.+}', (c) => {
      const file = NonEmptySchema.safeParse(c.req.param('file'))
      if (!file.success) return c.text('not found', 404)
      const path = resolve(cwd, file.data)
      if (!inside({dir: designDir, path})) return c.text('not found', 404)
      return fileResponse({storage: state, key: relative(designDir, path).split(sep).join(':')})
    })
}
export type XrayRouter = ReturnType<typeof makeXrayRouter>

async function nodeCrop(input: {
  store: Store
  target: string
  node: string
  run?: string | undefined
}): Promise<Uint8Array | null> {
  const {store, target, node} = input
  const stored = await store.design(target).catch(() => null)
  const found = stored === null ? null : find({root: stored.root, id: node})
  const image = await store.targetImage(target)
  if (stored === null || found === null || image === null) return null
  const raster = decodePng(image)
  const designRaster = stored.scale === 1 ? raster : downscale({raster, scale: stored.scale})
  const box = grown(scaled({box: found.box, scale: stored.scale}))
  const designCrop = cutout({raster: designRaster, box})
  const live = await liveCrop({...input, box})
  return encodePng(live === null ? designCrop : besides({rasters: [designCrop, live], gap: CROP_GAP}))
}

async function liveCrop(input: {
  store: Store
  target: string
  node: string
  run?: string | undefined
  box: Box
}): Promise<Raster | null> {
  const {store, target, node, box} = input
  const run = input.run ?? (await store.runs(target)).at(-1)
  if (run === undefined) return null
  const stored = await store.run({id: target, run})
  const match = stored === null ? null : find({root: stored.root, id: node, idOf: (entry) => entry.node.id})
  const live = match?.live?.box
  const bytes = await store.liveImage({id: target, run})
  if (live === undefined || bytes === null) return null
  const margin = TOLERANCES.tileMargin
  return cutout({
    raster: decodePng(bytes),
    box: {...box, x: Math.round(live.x) - margin, y: Math.round(live.y) - margin},
  })
}

function designNodes(root: DesignNode): DesignNode[] {
  return [...walk({root})].filter(({parent}) => parent !== null).map(({node}) => node)
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
