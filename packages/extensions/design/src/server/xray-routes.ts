import {readFile} from 'node:fs/promises'
import {extname, join, resolve, sep} from 'node:path'
import {ORPCError, os} from '@orpc/server'
import {Hono, type Context} from 'hono'
import {getMimeType} from 'hono/utils/mime'
import {z} from 'zod'
import {SessionId} from '@conciv/protocol/chat-types'
import type {RpcContext} from '@conciv/protocol/rpc-types'
import {MARK_KINDS} from '../shared/defs.js'
import type {Differ, TargetStore} from '../shared/types.js'
import {TARGET_FILE} from './store.js'

const PAGE_FILE = 'index.html'
const NOT_BUILT = 'the x-ray page is not built; build @conciv/extension-design'
const NonEmptySchema = z.string().min(1)
const TargetSchema = z.object({id: NonEmptySchema})
const RunSchema = TargetSchema.extend({session: SessionId})
const WASM_EXTENSION = '.wasm'
const WASM_HEADERS = {'content-type': 'application/wasm', 'cache-control': 'public, max-age=31536000, immutable'}

const xrayOs = os.$context<RpcContext>()

export function makeXrayRouter(input: {
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

export function makeXrayApp(input: {
  store: TargetStore
  pageDir: string
  designDir: string
  cwd: string
  takumiDir: string
}) {
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
