import {extname, resolve, sep} from 'node:path'
import type {Storage} from 'unstorage'
import {ORPCError, os} from '@orpc/server'
import {Hono, type Context} from 'hono'
import {getMimeType} from 'hono/utils/mime'
import {z} from 'zod'
import type {RpcContext} from '@conciv/protocol/rpc-types'
import type {Box, DesignRuntime, IdNode} from '../shared/defs.js'
import type {Store} from '../shared/store.js'

export function createXrayRoutes(input: {runtime: DesignRuntime; pageDir: string; takumiDir: string}) {
  const {runtime} = input
  return {
    router: makeXrayRouter(runtime),
    app: makeXrayApp({runtime, pageDir: resolve(input.pageDir), takumiDir: resolve(input.takumiDir)}),
  }
}

const PAGE_FILE = 'index.html'

const NOT_BUILT = 'the x-ray page is not built; build @conciv/extension-design'

const NonEmptySchema = z.string().min(1)

const WASM_EXTENSION = '.wasm'

const WASM_HEADERS = {'content-type': 'application/wasm', 'cache-control': 'public, max-age=31536000, immutable'}

const PNG_HEADERS = {'content-type': 'image/png'}

const ImageKindSchema = z.enum(['live', 'diff'])

const xrayOs = os.$context<RpcContext>()

function makeXrayRouter(runtime: DesignRuntime) {
  const {store} = runtime
  return xrayOs.router({
    xray: {
      targets: xrayOs.handler(() => store.list()),
      current: xrayOs.input(z.object({session: z.string()})).handler(({input: query}) => store.current(query.session)),
      rounds: xrayOs.input(z.object({id: NonEmptySchema})).handler(async ({input: query}) => {
        const target = (await store.list()).find((record) => record.id === query.id)
        if (target === undefined) throw new ORPCError('NOT_FOUND', {message: `no design with id ${query.id}`})
        return {target, rounds: await store.rounds(target.id), mapping: await store.mapping(target.id)}
      }),
      layers: xrayOs
        .input(z.object({id: NonEmptySchema, round: z.number().int().positive()}))
        .handler(async ({input: query}) => {
          const target = (await store.list()).find((record) => record.id === query.id)
          if (target === undefined) throw new ORPCError('NOT_FOUND', {message: `no design with id ${query.id}`})
          const [ids, looks] = await Promise.all([store.ids(query), store.looks(target.id)])
          if (ids === null) return null
          const byNode = new Map(looks.map((look) => [look.node, look]))
          return {round: query.round, width: target.width, root: layerOf({node: ids.root, byNode, scale: target.scale})}
        }),
    },
  })
}

function makeXrayApp(input: {runtime: DesignRuntime; pageDir: string; takumiDir: string}) {
  const {runtime, pageDir, takumiDir} = input
  const {store, files} = runtime
  const cache: {page: string | null} = {page: null}
  const page = async (): Promise<string | null> => {
    const bytes = cache.page === null ? await readRaw({storage: files, key: resolve(pageDir, PAGE_FILE)}) : null
    cache.page ??= bytes === null ? null : new TextDecoder().decode(bytes)
    return cache.page
  }
  const servePage = async (c: Context) => {
    const html = await page()
    if (html === null) return c.text(NOT_BUILT, 503)
    return c.html(html)
  }
  return new Hono()
    .get('/xray', servePage)
    .get('/xray/list', servePage)
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
    .get('/files/target/:id', async (c) => pngResponse(await store.image({id: c.req.param('id')})))
    .get('/files/:kind/:id/:round', async (c) => {
      const kind = ImageKindSchema.safeParse(c.req.param('kind'))
      const round = Number(c.req.param('round'))
      if (!kind.success || !Number.isInteger(round)) return c.text('not found', 404)
      return pngResponse(await store.image({id: c.req.param('id'), round, kind: kind.data}))
    })
}

function layerOf(input: {node: IdNode; byNode: Map<string, Look>; scale: number}): Layer {
  const {node, byNode, scale} = input
  return {
    id: node.id,
    dom: node.dom,
    cssom: node.cssom,
    src: node.src,
    fom: node.fom.map((entry) => {
      const look = byNode.get(entry.nodeId) ?? null
      const box = look === null ? null : {x: look.x * scale, y: look.y * scale, w: look.w * scale, h: look.h * scale}
      return {...entry, box, look}
    }),
    children: node.children.map((child) => layerOf({...input, node: child})),
  }
}

type Look = Awaited<ReturnType<Store['looks']>>[number]

type Layer = Omit<IdNode, 'fom' | 'children'> & {
  fom: (IdNode['fom'][number] & {box: Box | null; look: Look | null})[]
  children: Layer[]
}

function pngResponse(image: Uint8Array | null): Response {
  if (image === null) return new Response('not found', {status: 404})
  return new Response(new Uint8Array(image), {headers: PNG_HEADERS})
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
