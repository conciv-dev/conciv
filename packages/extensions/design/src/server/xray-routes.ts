import {readFile} from 'node:fs/promises'
import {join, resolve, sep} from 'node:path'
import {ORPCError, os} from '@orpc/server'
import {Hono, type Context} from 'hono'
import {getMimeType} from 'hono/utils/mime'
import {z} from 'zod'
import type {RpcContext} from '@conciv/protocol/rpc-types'
import type {TargetStore} from '../shared/types.js'
import {TARGET_FILE} from './store.js'

const PAGE_FILE = 'index.html'
const NOT_BUILT = 'the x-ray page is not built; build @conciv/extension-design'
const NonEmptySchema = z.string().min(1)

const xrayOs = os.$context<RpcContext>()

export function makeXrayRouter(input: {store: TargetStore; designDir: string; sourceChangedAt: () => number | null}) {
  const {store, designDir, sourceChangedAt} = input
  return xrayOs.router({
    xray: {
      targets: xrayOs
        .input(z.object({route: z.string().optional()}))
        .handler(({input: filter}) => store.list(filter.route === undefined ? {} : {route: filter.route})),
      report: xrayOs.input(z.object({id: z.string()})).handler(async ({input: query}) => {
        const target = await store.find({id: query.id})
        if (target === null) throw new ORPCError('NOT_FOUND', {message: `no design target with id ${query.id}`})
        return {
          target,
          report: await store.lastResult(target.id),
          targetImage: store.reportPath(join(designDir, target.id, TARGET_FILE)),
          nodes: await store.model(target.id).then(
            (model) => model.nodes,
            () => [],
          ),
          sourceChangedAt: sourceChangedAt(),
        }
      }),
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

export function makeXrayApp(input: {store: TargetStore; pageDir: string; designDir: string; cwd: string}) {
  const {store, pageDir, cwd} = input
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
    .get('/files/:file{.+}', (c) => {
      const file = NonEmptySchema.safeParse(c.req.param('file'))
      if (!file.success) return c.text('not found', 404)
      const path = resolve(cwd, file.data)
      if (!inside({dir: designDir, path})) return c.text('not found', 404)
      return fileResponse(path)
    })
}
export type XrayRouter = ReturnType<typeof makeXrayRouter>
