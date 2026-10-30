import {readFile} from 'node:fs/promises'
import {join, resolve, sep} from 'node:path'
import {ORPCError, os} from '@orpc/server'
import {Hono} from 'hono'
import {getMimeType} from 'hono/utils/mime'
import {z} from 'zod'
import type {RpcContext} from '@conciv/protocol/rpc-types'
import type {TargetStore} from '../shared/types.js'
import {TARGET_FILE} from './store.js'

const PAGE_FILE = 'index.html'
const FALLBACK_PAGE = '<!doctype html><title>design x-ray</title><div data-design-xray></div>'
const FILES_PREFIX = '/files/'
const PAGE_PREFIX = '/xray/'

const xrayOs = os.$context<RpcContext>()

export function makeXrayRouter(input: {store: TargetStore; designDir: string}) {
  const {store, designDir} = input
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
        }
      }),
    },
  })
}

function inside(input: {dir: string; path: string}): boolean {
  return input.path.startsWith(`${input.dir}${sep}`)
}

function tail(input: {path: string; prefix: string}): string {
  return input.path.slice(input.path.indexOf(input.prefix) + input.prefix.length)
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
  const cache: {page: Promise<string> | null} = {page: null}
  const page = (): Promise<string> => {
    cache.page ??= readFile(join(root, PAGE_FILE), 'utf8').catch(() => FALLBACK_PAGE)
    return cache.page
  }
  return new Hono()
    .get('/xray', async (c) => {
      const id = c.req.query('target')
      if (id === undefined || (await store.find({id})) === null) return c.text('not found', 404)
      return c.html(await page())
    })
    .get('/xray/*', (c) => {
      const path = resolve(root, tail({path: c.req.path, prefix: PAGE_PREFIX}))
      if (!inside({dir: root, path})) return c.text('not found', 404)
      return fileResponse(path)
    })
    .get('/files/*', (c) => {
      const path = resolve(cwd, tail({path: c.req.path, prefix: FILES_PREFIX}))
      if (!inside({dir: designDir, path})) return c.text('not found', 404)
      return fileResponse(path)
    })
}
export type XrayRouter = ReturnType<typeof makeXrayRouter>
