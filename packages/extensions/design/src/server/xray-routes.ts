import {extname, resolve, sep} from 'node:path'
import type {Storage} from 'unstorage'
import {range} from 'es-toolkit'
import {ORPCError, os} from '@orpc/server'
import {Hono, type Context} from 'hono'
import {getMimeType} from 'hono/utils/mime'
import {PNG} from 'pngjs'
import {z} from 'zod'
import {SessionId} from '@conciv/protocol/chat-types'
import type {RpcContext} from '@conciv/protocol/rpc-types'
import {designConfig} from '../shared/tolerances.js'
import {
  DecisionSchema,
  type Box,
  type DesignNode,
  type DesignRuntime,
  type Differ,
  type Match,
  type Raster,
} from '../shared/defs.js'
import {walk} from '../shared/tree.js'
import {createRaster} from './raster.js'

export function createXrayRoutes(input: {
  runtime: DesignRuntime
  differ: Differ
  pageDir: string
  takumiDir: string
  sourceChangedAt: () => number | null
}) {
  const {runtime, differ, sourceChangedAt} = input
  return {
    router: makeXrayRouter({runtime, differ, sourceChangedAt}),
    app: makeXrayApp({runtime, pageDir: resolve(input.pageDir), takumiDir: resolve(input.takumiDir)}),
  }
}

const PAGE_FILE = 'index.html'

const TARGET_IMAGE_PREFIX = 'target'

const NOT_BUILT = 'the x-ray page is not built; build @conciv/extension-design'

const NonEmptySchema = z.string().min(1)

const TargetSchema = z.object({id: NonEmptySchema})

const RunSchema = TargetSchema.extend({session: SessionId})

const MarkKindSchema = DecisionSchema.shape.kind.exclude(['pin', 'twin', 'typography'])

const WASM_EXTENSION = '.wasm'

const CROP_GAP = 4

const NodeQuerySchema = z.object({target: NonEmptySchema, node: NonEmptySchema, run: NonEmptySchema.optional()})

const WASM_HEADERS = {'content-type': 'application/wasm', 'cache-control': 'public, max-age=31536000, immutable'}

const xrayOs = os.$context<RpcContext>()

function makeXrayRouter(input: {runtime: DesignRuntime; differ: Differ; sourceChangedAt: () => number | null}) {
  const {runtime, differ, sourceChangedAt} = input
  const {store} = runtime
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
        const stored = await store.design(target.id).catch(() => null)
        const {report, outline} = await differ.xray({id: target.id})
        return {
          target,
          report,
          run: await store.latest(target.id),
          decisions: await store.decisions(target.id),
          design: outline,
          targetImage: targetImage({runtime, id: target.id}),
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
            kind: MarkKindSchema,
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

function targetImage(input: {runtime: DesignRuntime; id: string}): string {
  return `${TARGET_IMAGE_PREFIX}/${encodeURIComponent(input.id)}`
}

function designNodes(root: DesignNode): DesignNode[] {
  return [...walk(root)].filter(({parent}) => parent !== null).map(({node}) => node)
}

function makeXrayApp(input: {runtime: DesignRuntime; pageDir: string; takumiDir: string}) {
  const {runtime, pageDir, takumiDir} = input
  const {store, files, cwd} = runtime
  const stateDir = store.path('')
  const cache: {page: string | null} = {page: null}
  const page = async (): Promise<string | null> => {
    const bytes = cache.page === null ? await readRaw({storage: files, key: resolve(pageDir, PAGE_FILE)}) : null
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
      const png = await nodeCrop({runtime, ...query.data})
      if (png === null) return c.text('not found', 404)
      return new Response(new Uint8Array(png), {headers: {'content-type': 'image/png'}})
    })
    .get('/xray/list', servePage)
    .get('/xray/capture', servePage)
    .get('/xray/:asset{.+}', (c) => {
      const asset = NonEmptySchema.safeParse(c.req.param('asset'))
      if (!asset.success) return c.text('not found', 404)
      const path = resolve(pageDir, asset.data)
      if (!inside({dir: pageDir, path})) return c.text('not found', 404)
      return fileResponse({storage: files, key: path})
    })
    .get('/takumi/:asset', (c) => {
      const path = resolve(takumiDir, c.req.param('asset'))
      if (!inside({dir: takumiDir, path}) || extname(path) !== WASM_EXTENSION) return c.text('not found', 404)
      return wasmResponse({storage: files, key: path})
    })
    .get(`/files/${TARGET_IMAGE_PREFIX}/:id`, async (c) => {
      const image = await store.image({id: c.req.param('id')})
      if (image === null) return c.text('not found', 404)
      return new Response(new Uint8Array(image), {headers: {'content-type': 'image/png'}})
    })
    .get('/files/:file{.+}', (c) => {
      const file = NonEmptySchema.safeParse(c.req.param('file'))
      if (!file.success || stateDir === null) return c.text('not found', 404)
      const path = resolve(cwd, file.data)
      if (!inside({dir: stateDir, path})) return c.text('not found', 404)
      return fileResponse({storage: files, key: path})
    })
}

function inside(input: {dir: string; path: string}): boolean {
  return input.path.startsWith(`${input.dir}${sep}`)
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

async function nodeCrop(input: {
  runtime: DesignRuntime
  target: string
  node: string
  run?: string | undefined
}): Promise<Uint8Array | null> {
  const {runtime, target, node} = input
  const stored = await runtime.store.design(target).catch(() => null)
  const found = stored === null ? null : designNode({root: stored.root, id: node})
  const image = await runtime.store.image({id: target})
  if (stored === null || found === null || image === null) return null
  const raster = createRaster(image)
  const designRaster = stored.scale === 1 ? raster : raster.scaled(stored.scale)
  const box = grown(scaled({box: found.box, scale: stored.scale}))
  const designCrop = cutout({raster: designRaster, box})
  const live = await liveCrop({...input, box})
  return encoded(live === null ? designCrop : besides({tiles: [designCrop, live], gap: CROP_GAP}))
}

async function liveCrop(input: {
  runtime: DesignRuntime
  target: string
  node: string
  run?: string | undefined
  box: Box
}): Promise<Tile | null> {
  const {runtime, target, node, box} = input
  const run = input.run ?? (await runtime.store.runs(target)).at(-1)
  if (run === undefined) return null
  const stored = await runtime.store.run({id: target, run})
  const live = stored === null ? undefined : matchedLive({root: stored.root, id: node})
  const bytes = await runtime.store.image({id: target, run, kind: 'live'})
  if (live === undefined || bytes === null) return null
  const margin = designConfig.tolerances.tileMargin
  return cutout({
    raster: createRaster(bytes),
    box: {...box, x: Math.round(live.x) - margin, y: Math.round(live.y) - margin},
  })
}

function designNode(input: {root: DesignNode; id: string}): DesignNode | null {
  for (const {node} of walk(input.root)) {
    if (node.id === input.id) return node
  }
  return null
}

function matchedLive(input: {root: Match; id: string}): Box | undefined {
  for (const {node} of walk(input.root)) {
    if (node.node.id === input.id) return node.live?.box
  }
  return undefined
}

function scaled(input: {box: Box; scale: number}): Box {
  const {box, scale} = input
  return {x: box.x / scale, y: box.y / scale, w: box.w / scale, h: box.h / scale}
}

function grown(box: Box): Box {
  const margin = designConfig.tolerances.tileMargin
  return {
    x: Math.round(box.x) - margin,
    y: Math.round(box.y) - margin,
    w: Math.round(box.w) + 2 * margin,
    h: Math.round(box.h) + 2 * margin,
  }
}

function cutout(input: {raster: Raster; box: Box}): Tile {
  const {raster, box} = input
  const pixels = raster.pixels()
  const data = new Uint8Array(box.w * box.h * 4)
  range(box.h).forEach((row) => {
    const y = box.y + row
    if (y < 0 || y >= raster.height) return
    const left = Math.max(0, box.x)
    const right = Math.min(raster.width, box.x + box.w)
    if (right <= left) return
    const start = (y * raster.width + left) * 4
    data.set(pixels.subarray(start, start + (right - left) * 4), (row * box.w + left - box.x) * 4)
  })
  return {width: box.w, height: box.h, data}
}

function besides(input: {tiles: [Tile, Tile]; gap: number}): Tile {
  const {tiles, gap} = input
  const width = tiles.reduce((sum, tile) => sum + tile.width, 0) + gap * Math.max(0, tiles.length - 1)
  const height = Math.max(0, ...tiles.map((tile) => tile.height))
  const data = new Uint8Array(width * height * 4)
  tiles.reduce((left, tile) => {
    range(tile.height).forEach((row) => {
      const start = row * tile.width * 4
      data.set(tile.data.subarray(start, start + tile.width * 4), (row * width + left) * 4)
    })
    return left + tile.width + gap
  }, 0)
  return {width, height, data}
}

function encoded(tile: Tile): Uint8Array {
  const png = new PNG({width: tile.width, height: tile.height})
  png.data = Buffer.from(tile.data)
  return new Uint8Array(PNG.sync.write(png))
}

type Tile = {width: number; height: number; data: Uint8Array}
