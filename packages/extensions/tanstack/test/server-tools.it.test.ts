import {afterEach, describe, expect, it} from 'vitest'
import {mkdtemp, realpath} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {createServer, type ViteDevServer} from 'vite'
import {z} from 'zod'
import {start, type Engine} from '@conciv/core/start'
import {makeCallTool, resolveSession, type CallTool} from '@conciv/harness-testkit'
import {makeViteBridge} from '@conciv/plugin/vite'
import type {BundlerBridge} from '@conciv/protocol/bundler-types'
import tanstackServer from '../src/server.js'

const BUILD_APP = fileURLToPath(new URL('./fixtures/build-errors-app', import.meta.url))
const MANIFEST_APP = fileURLToPath(new URL('./fixtures/route-manifest-app', import.meta.url))

const AppErrorSchema = z.object({
  kind: z.string(),
  message: z.string(),
  source: z.object({file: z.string(), line: z.number(), column: z.number()}).nullable(),
})
const AppErrorsSchema = z.array(AppErrorSchema)

const RouteInfoSchema = z.object({
  path: z.string(),
  kind: z.string(),
  dynamic: z.boolean(),
  file: z.string().nullable(),
})
const RoutesSchema = z.array(RouteInfoSchema)

async function makeStateRoot(): Promise<string> {
  return realpath(await mkdtemp(join(await realpath(tmpdir()), 'conciv-ts-server-')))
}

async function bootEngine(root: string, bridge?: BundlerBridge): Promise<{engine: Engine; callTool: CallTool}> {
  const engine = await start({
    options: {stateRoot: await makeStateRoot(), systemPrompt: false},
    root,
    bridge,
    launchEditor: () => {},
    extensions: [tanstackServer],
  })
  const apiBase = `http://127.0.0.1:${engine.port}`
  const session = await resolveSession(apiBase)
  return {engine, callTool: makeCallTool(apiBase, session)}
}

describe('tanstack server-half read tools (IT, real engine)', () => {
  const state = {engine: undefined as Engine | undefined, vite: undefined as ViteDevServer | undefined}
  afterEach(async () => {
    await state.engine?.stop()
    await state.vite?.close()
    state.engine = undefined
    state.vite = undefined
  })

  it('tanstack_build_errors surfaces a real vite transform error through the bundler stream', async () => {
    const vite = await createServer({
      root: BUILD_APP,
      configFile: false,
      logLevel: 'silent',
      server: {host: '127.0.0.1', port: 0},
    })
    state.vite = vite
    await vite.listen()
    const address = vite.httpServer?.address()
    const port = typeof address === 'object' && address ? address.port : 0
    const viteBase = `http://127.0.0.1:${port}`

    const bridge = makeViteBridge(vite)
    const {engine, callTool} = await bootEngine(BUILD_APP, bridge)
    state.engine = engine

    await fetch(`${viteBase}/broken.ts`, {headers: {'sec-fetch-dest': 'script'}}).catch(() => undefined)

    await expect
      .poll(
        async () => {
          const errors = AppErrorsSchema.parse(await callTool('tanstack_build_errors', {}))
          return errors.some((error) => error.kind === 'build')
        },
        {timeout: 10_000},
      )
      .toBe(true)

    const errors = AppErrorsSchema.parse(await callTool('tanstack_build_errors', {}))
    const buildError = errors.find((error) => error.kind === 'build')
    expect(buildError).toBeDefined()
    expect(buildError?.message.length).toBeGreaterThan(0)
    expect(buildError?.source?.file).toContain('broken.ts')
  })

  it('tanstack_route_manifest parses the real generated routeTree.gen off disk', async () => {
    const {engine, callTool} = await bootEngine(MANIFEST_APP)
    state.engine = engine

    const routes = RoutesSchema.parse(await callTool('tanstack_route_manifest', {}))
    const paths = routes.map((route) => route.path)
    expect(paths).toContain('/')
    expect(paths).toContain('/about')
    expect(paths).toContain('/form')

    const layout = routes.find((route) => route.kind === 'layout')
    expect(layout?.file).toContain('__root')

    const about = routes.find((route) => route.path === '/about')
    expect(about?.kind).toBe('page')
    expect(about?.dynamic).toBe(false)
  })
})
