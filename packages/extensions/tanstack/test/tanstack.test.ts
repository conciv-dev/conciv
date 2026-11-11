import {execFileSync} from 'node:child_process'
import {cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {mkdtemp, realpath} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {afterAll, afterEach, beforeAll, describe, expect, it, test} from 'vitest'
import {expect as expectLocator} from 'playwright/test'
import type {ViteDevServer} from 'vite'
import {z} from 'zod'
import {start, type Engine, type StartOpts} from '@conciv/core/start'
import {loadExtensionPackages} from '@conciv/extension-compiler/extensions'
import tanstack from '../src/index.js'
import {bootCoreKit, type CoreKit} from '@conciv/extension-testkit/core-kit'
import {makeCallTool, resolveSession, type CallTool} from '@conciv/harness-testkit'
import {makeViteBridge} from '@conciv/extension/vite'
import {buildAndPack, installPacked, packTarball} from '@conciv/e2e-utils/packed'
import type {BundlerBridge, BundlerDiagnostic} from '@conciv/protocol/bundler-types'
import tanstackExtension from '../src/server.js'
import {
  gotoAbout,
  startViteFixtureServer,
  tanstackAdapter,
  useTanstackTestApi,
  waitForAboutQuery,
  waitForPagePlane,
} from './helpers.js'

async function startTrusted(opts: StartOpts): Promise<{engine: Engine; apiBase: string}> {
  const engine = await start(opts)
  return {engine, apiBase: `http://127.0.0.1:${engine.port}/t/${engine.agentToken}`}
}

describe('boot', () => {
  const get = useTanstackTestApi()

  test('real TanStack host app boots and its page serves the conciv page plane in a real browser', async () => {
    const {api} = get()

    await expectLocator(api.page.getByRole('heading', {name: 'TanStack inspection home'})).toBeVisible()

    await waitForPagePlane(api.page)

    await gotoAbout(api.page)
    await expectLocator(api.page.getByText('Greeting: hello')).toBeVisible()
    await expectLocator(api.page.getByText('Answer: 42')).toBeVisible()
    await expectLocator(api.page.getByText('Tags: a, b')).toBeVisible()
    await waitForAboutQuery(api.page)
  })
})

describe('package install', () => {
  test('the factory loads as an installed extension package and its server tool runs on the real engine', async () => {
    const root = await realpath(await mkdtemp(join(await realpath(tmpdir()), 'conciv-fi-')))
    cpSync(fileURLToPath(new URL('./fixtures/route-manifest-app', import.meta.url)), root, {recursive: true})

    const {extensions} = await loadExtensionPackages([tanstack()])
    expect(extensions.map((extension) => extension.name)).toEqual(['tanstack'])

    const {engine, apiBase} = await startTrusted({
      options: {stateRoot: root, systemPrompt: false},
      root,
      launchEditor: () => {},
      extensions,
    })
    const callTool = makeCallTool(apiBase, await resolveSession(apiBase))
    const routes = await callTool('tanstack_route_manifest', {})
    expect(Array.isArray(routes)).toBe(true)
    await engine.stop()
  })
})

describe('framework adapter', () => {
  const get = useTanstackTestApi()

  test('adapter.client.detect reports the running framework against the real app', async () => {
    const {api} = get()
    await waitForPagePlane(api.page)

    const info = await tanstackAdapter(api).client.detect()
    expect(info).toEqual({name: 'tanstack-start', version: null, router: 'file-based', dev: true})
  })

  test('adapter.client.data surfaces the router loader cache for the real about route', async () => {
    const {api} = get()
    await waitForPagePlane(api.page)
    await gotoAbout(api.page)

    const adapter = tanstackAdapter(api)
    const entries = await adapter.client.data.entries()
    const about = entries.find((entry) => entry.key === '/about')
    expect(about).toBeDefined()
    expect(about?.state).toBe('fresh')
    expect(about?.updatedAt).not.toBeNull()

    const value = await adapter.client.data.get('/about')
    expect(value).toMatchObject({server: {greeting: 'hello'}})
  })

  test('adapter.client.data.invalidate re-runs the real router loader', async () => {
    const {api} = get()
    await waitForPagePlane(api.page)
    await gotoAbout(api.page)

    const adapter = tanstackAdapter(api)
    const readUpdatedAt = async () => {
      const entries = await adapter.client.data.entries()
      return entries.find((entry) => entry.key === '/about')?.updatedAt ?? null
    }

    const before = await readUpdatedAt()
    expect(before).not.toBeNull()

    await adapter.client.data.invalidate('/about')
    expect(await readUpdatedAt()).toBeGreaterThan(before ?? 0)
  })

  test('adapter.queryCache splits the live TanStack Query cache into queries and mutations', async () => {
    const {api} = get()
    await waitForPagePlane(api.page)

    await api.page.getByRole('link', {name: 'About'}).click()
    await waitForAboutQuery(api.page)

    const adapter = tanstackAdapter(api)
    const [queries, mutations] = await Promise.all([adapter.queryCache?.queries(), adapter.queryCache?.mutations()])
    expect(Array.isArray(mutations)).toBe(true)
    const demo = queries?.find((entry) => entry.key === JSON.stringify(['spike', 'demo']))
    expect(demo?.status).toBe('success')
  })

  test('adapter.client.errors.snapshot captures a real runtime error thrown in an event handler', async () => {
    const {api} = get()
    await waitForPagePlane(api.page)

    await api.page.getByRole('link', {name: 'Boom'}).click()
    await expectLocator(api.page.getByRole('heading', {name: 'Boom page'})).toBeVisible()
    const crashed = api.page.waitForEvent('pageerror')
    await api.page.getByRole('button', {name: 'Trigger runtime error'}).click()
    expect(String(await crashed)).toContain('boom-from-event-handler')

    const adapter = tanstackAdapter(api)
    const captured = await adapter.client.errors.snapshot()
    expect(
      captured.some((error) => error.kind === 'runtime' && error.message.includes('boom-from-event-handler')),
    ).toBe(true)
  })
})

describe('packed resolution', {tags: ['packed']}, () => {
  test('packed tarball has no workspace protocol and its root export is the factory', () => {
    const tgz = packTarball(process.cwd(), mkdtempSync(join(tmpdir(), 'conciv-packed-')))
    const manifestText = execFileSync('tar', ['-xzOf', tgz, 'package/package.json']).toString()
    expect(manifestText).not.toContain('workspace:')
    const manifest: unknown = JSON.parse(manifestText)
    if (typeof manifest !== 'object' || manifest === null || !('exports' in manifest)) throw new Error('no exports')
    expect(manifest.exports).toMatchObject({
      '.': {types: './dist/index.d.ts', import: './dist/index.js', default: './dist/index.js'},
    })
    const files = execFileSync('tar', ['-tzf', tgz]).toString()
    expect(files).toContain('package/dist/index.js')
    expect(files).toContain('package/dist/client.js')
    expect(files).toContain('package/dist/server.js')
  })
})

describe('resolution matrix', {tags: ['packed']}, () => {
  const workspaceRoot = fileURLToPath(new URL('../../../../', import.meta.url))

  const rootPackage = '@conciv/extension-tanstack'

  type PackedPackage = {name: string; tarball: string}

  type Fixture = {dir: string; packDir: string; packed: PackedPackage[]}

  const ctx: {fixture?: Fixture} = {}

  function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }

  async function packWorkspaceClosure(
    packDir: string,
  ): Promise<{packed: PackedPackage[]; overrides: Record<string, string>}> {
    const {overrides} = await buildAndPack(packDir, [rootPackage])
    const packed = Object.entries(overrides).map(([name, override]) => {
      const tarball = override.replace(/^file:/, '')
      const manifestText = execFileSync('tar', ['-xzOf', tarball, 'package/package.json']).toString()
      expect(manifestText, `${name} tarball must not carry workspace protocol`).not.toContain('workspace:')
      return {name, tarball}
    })
    return {packed, overrides}
  }

  function writeFixtureManifest(dir: string, overrides: Record<string, string>): void {
    const root = overrides[rootPackage]
    if (root === undefined) throw new Error('root package missing from closure')
    const {packageManager} = z
      .object({packageManager: z.string()})
      .parse(JSON.parse(readFileSync(join(workspaceRoot, 'package.json'), 'utf8')))
    const manifest = {
      name: 'conciv-resolution-matrix-fixture',
      version: '0.0.0',
      private: true,
      type: 'module',
      packageManager,
      dependencies: {
        [rootPackage]: root,
        '@tanstack/react-router': '^1.170.0',
        'solid-js': '^1.9.13',
      },
    }
    writeFileSync(join(dir, 'package.json'), JSON.stringify(manifest, null, 2))
  }

  async function buildFixture(): Promise<Fixture> {
    const dir = mkdtempSync(join(tmpdir(), 'conciv-resolution-matrix-'))
    const packDir = mkdtempSync(join(tmpdir(), 'conciv-resolution-packs-'))
    const {packed, overrides} = await packWorkspaceClosure(packDir)
    writeFixtureManifest(dir, overrides)
    await installPacked({
      root: dir,
      packages: ['.'],
      allowBuilds: {'isolated-vm': false, protobufjs: false},
      overrides,
      fresh: true,
    })
    return {dir, packDir, packed}
  }

  function fixture(): Fixture {
    if (!ctx.fixture) throw new Error('fixture not built')
    return ctx.fixture
  }

  beforeAll(async () => {
    ctx.fixture = await buildFixture()
  }, 420_000)

  afterAll(() => {
    if (!ctx.fixture) return
    rmSync(ctx.fixture.dir, {recursive: true, force: true})
    rmSync(ctx.fixture.packDir, {recursive: true, force: true})
  })

  describe('resolution matrix', () => {
    test('fixture install resolves every @conciv package from file tarballs only', () => {
      const {dir, packed} = fixture()
      const lock = readFileSync(join(dir, 'pnpm-lock.yaml'), 'utf8')
      for (const entry of packed) {
        expect(lock, `${entry.name} must resolve via file: in the lockfile`).toContain(`${entry.name}@file:`)
        const registryVersion = new RegExp(`${escapeRegExp(entry.name)}@\\d`)
        expect(registryVersion.test(lock), `${entry.name} must not resolve from the registry`).toBe(false)
      }
      expect(lock).not.toContain('registry.npmjs.org/@conciv')
    })

    test('the installed factory names the packed server and client entries and the server entry runs', () => {
      const {dir} = fixture()
      const probe = join(dir, 'node-probe.mjs')
      writeFileSync(
        probe,
        [
          `import tanstack from '${rootPackage}'`,
          `const installed = tanstack()`,
          `const server = await import(installed.server)`,
          `process.stdout.write(JSON.stringify({server: installed.server, client: installed.client, name: server.default.name}))`,
        ].join('\n'),
      )
      const output = execFileSync('node', [probe], {cwd: dir}).toString()
      const probed = z.object({server: z.string(), client: z.string(), name: z.string()}).parse(JSON.parse(output))
      expect(probed.server).toContain(join('node_modules', '@conciv', 'extension-tanstack', 'dist', 'server.js'))
      expect(probed.client).toContain(join('node_modules', '@conciv', 'extension-tanstack', 'dist', 'client.js'))
      expect(probed.name).toBe('tanstack')
    })
  })
})

describe('router adapter', () => {
  const get = useTanstackTestApi()

  const routerStateSchema = z.object({
    location: z.object({pathname: z.string(), search: z.string(), hash: z.string()}),
    matches: z.array(z.object({routeId: z.string(), path: z.string(), loaderData: z.unknown()})),
  })

  type RouteNodeShape = {id: string; children: RouteNodeShape[]}

  const routeNodeSchema: z.ZodType<RouteNodeShape> = z.lazy(() =>
    z.object({id: z.string(), children: z.array(routeNodeSchema)}),
  )

  function collectIds(node: RouteNodeShape): string[] {
    return [node.id, ...node.children.flatMap(collectIds)]
  }

  test('callTool drives the fiber-walk adapter against the running TanStack app', async () => {
    const {api} = get()

    await waitForPagePlane(api.page)
    await gotoAbout(api.page)
    await waitForAboutQuery(api.page)

    const state = routerStateSchema.parse(await api.callTool('tanstack_router_state', {}))
    expect(state.location.pathname).toBe('/about')
    const aboutMatch = state.matches.find((match) => match.routeId === '/about')
    expect(aboutMatch).toBeDefined()
    expect(aboutMatch?.loaderData).toBeTruthy()

    const tree = routeNodeSchema.parse(await api.callTool('tanstack_route_tree', {}))
    const ids = collectIds(tree)
    expect(ids.length).toBeGreaterThanOrEqual(4)
  })

  const searchStateSchema = z.object({
    matches: z.array(z.object({routeId: z.string(), search: z.record(z.string(), z.unknown())})),
  })

  test('tanstack_router_state redacts secret-keyed search params through dehydrate', async () => {
    const {api} = get()

    await waitForPagePlane(api.page)
    await api.page.getByRole('link', {name: 'Token route'}).click()
    await expectLocator(api.page.getByRole('heading', {name: 'Secret page'})).toBeVisible()

    const payload = await api.callTool('tanstack_router_state', {})
    const state = searchStateSchema.parse(payload)
    const secretMatch = state.matches.find((match) => match.routeId === '/secret')
    expect(secretMatch).toBeDefined()
    expect(secretMatch?.search.token).toBe('[redacted]')
    expect(JSON.stringify(state.matches)).not.toContain('super-secret-value')
  })

  const cacheEntrySchema = z.object({
    key: z.string(),
    state: z.enum(['fresh', 'stale', 'fetching', 'error']),
    status: z.string().nullable(),
    observers: z.number().nullable(),
    updatedAt: z.number().nullable(),
  })

  const queryCacheSchema = z.object({queries: z.array(cacheEntrySchema), mutations: z.array(cacheEntrySchema)})

  test('tanstack_query_cache extracts the live TanStack Query cache from the running app', async () => {
    const {api} = get()

    await waitForPagePlane(api.page)
    await gotoAbout(api.page)
    await waitForAboutQuery(api.page)

    const cache = queryCacheSchema.parse(await api.callTool('tanstack_query_cache', {}))
    const demo = cache.queries.find((entry) => entry.key === JSON.stringify(['spike', 'demo']))
    expect(demo).toBeDefined()
    expect(demo?.status).toBe('success')
    expect(demo?.observers).toBe(1)
  })

  test('tanstack_navigate drives real TanStack Router navigation on the running app', async () => {
    const {api} = get()

    await waitForPagePlane(api.page)

    await api.callToolApproved('tanstack_navigate', {to: '/form'})

    await expectLocator(api.page.getByRole('heading', {name: 'Form page'})).toBeVisible()
    expect(routerStateSchema.parse(await api.callTool('tanstack_router_state', {})).location.pathname).toBe('/form')
  })

  test('navigate threads search through the adapter into the running TanStack Router location', async () => {
    const {api} = get()

    await waitForPagePlane(api.page)

    const adapter = tanstackAdapter(api)
    await adapter.client.navigation.navigate({to: '/secret', search: {token: 'nav-applied'}})

    await expectLocator(api.page.getByRole('heading', {name: 'Secret page'})).toBeVisible()
    expect(routerStateSchema.parse(await api.callTool('tanstack_router_state', {})).location.search).toContain(
      'token=nav-applied',
    )
  })

  test('tanstack_query_invalidate no-ops on unknown keys and refetches the real key on the running app', async () => {
    const {api} = get()

    await waitForPagePlane(api.page)
    await gotoAbout(api.page)
    await waitForAboutQuery(api.page)

    const demoKey = JSON.stringify(['spike', 'demo'])
    const readDemo = async () => {
      const cache = queryCacheSchema.parse(await api.callTool('tanstack_query_cache', {}))
      const entry = cache.queries.find((row) => row.key === demoKey)
      if (!entry) throw new Error('demo query missing from the tanstack query cache')
      return entry
    }

    const before = await readDemo()
    expect(before.status).toBe('success')
    expect(before.updatedAt).not.toBeNull()

    await api.callToolApproved('tanstack_query_invalidate', {key: JSON.stringify(['nope', 'nope'])})
    const afterUnknown = await readDemo()
    expect(afterUnknown.updatedAt).toBe(before.updatedAt)
    expect(afterUnknown.state).toBe(before.state)

    await api.callToolApproved('tanstack_query_invalidate', {key: demoKey})
    const after = await readDemo()
    expect(after.updatedAt).toBeGreaterThan(before.updatedAt ?? 0)
  })

  const truncationMarkerSchema = z.object({__conciv: z.literal('object'), preview: z.literal('{…}')}).loose()

  const loaderDataSchema = z.object({
    routeId: z.string(),
    data: z
      .object({
        server: z.object({greeting: z.string()}).loose(),
        local: z.object({n: z.number()}).loose(),
        deep: z.object({a: truncationMarkerSchema}).loose(),
      })
      .loose(),
  })

  test('tanstack_loader_data returns dehydrated leaf loader data with depth truncation applied', async () => {
    const {api} = get()

    await waitForPagePlane(api.page)
    await gotoAbout(api.page)

    const payload = await api.callTool('tanstack_loader_data', {})
    const loaderData = loaderDataSchema.parse(payload)

    expect(loaderData.routeId).toBe('/about')
    expect(Object.keys(loaderData.data)).toEqual(expect.arrayContaining(['server', 'local', 'deep']))
    expect(loaderData.data.deep.a.__conciv).toBe('object')
    expect(loaderData.data.deep.a.preview).toBe('{…}')
    expect(JSON.stringify(payload)).not.toContain('too-deep')
  })
})

describe('server tools', () => {
  const BUILD_APP = fileURLToPath(new URL('./fixtures/build-errors-app', import.meta.url))
  const MANIFEST_APP = fileURLToPath(new URL('./fixtures/route-manifest-app', import.meta.url))
  const DOUBLE_QUOTED_APP = fileURLToPath(new URL('./fixtures/double-quoted-manifest-app', import.meta.url))

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
    const {engine, apiBase} = await startTrusted({
      options: {stateRoot: await makeStateRoot(), systemPrompt: false},
      root,
      bridge,
      launchEditor: () => {},
      extensions: [tanstackExtension],
    })
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
      const {vite, viteBase} = await startViteFixtureServer(BUILD_APP)
      state.vite = vite

      const bridge = makeViteBridge(vite)
      const {engine, callTool} = await bootEngine(BUILD_APP, bridge)
      state.engine = engine

      const failed = Promise.withResolvers<BundlerDiagnostic>()
      const stopWatching = bridge.subscribe?.((diagnostic) => {
        if (diagnostic.kind === 'build-error') failed.resolve(diagnostic)
      })
      await fetch(`${viteBase}/broken.ts`, {headers: {'sec-fetch-dest': 'script'}}).catch(() => undefined)
      await failed.promise
      stopWatching?.()

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
      expect(about?.file?.endsWith('.tsx')).toBe(true)

      const form = routes.find((route) => route.path === '/form')
      expect(form?.file?.endsWith('routes/form')).toBe(true)
    })

    it('tanstack_route_manifest parses a double-quoted generated routeTree with a $param dynamic route', async () => {
      const {engine, callTool} = await bootEngine(DOUBLE_QUOTED_APP)
      state.engine = engine

      const routes = RoutesSchema.parse(await callTool('tanstack_route_manifest', {}))
      const paths = routes.map((route) => route.path)
      expect(paths).toContain('/')
      expect(paths).toContain('/posts/$postId')

      const dynamic = routes.find((route) => route.path === '/posts/$postId')
      expect(dynamic?.kind).toBe('page')
      expect(dynamic?.dynamic).toBe(true)
    })

    it('tanstack_route_manifest errors when the generated route tree is absent', async () => {
      const {engine, callTool} = await bootEngine(await makeStateRoot())
      state.engine = engine

      await expect(callTool('tanstack_route_manifest', {})).rejects.toThrow()
    })

    it('tanstack_build_errors errors when no bundler bridge is attached', async () => {
      const {engine, callTool} = await bootEngine(MANIFEST_APP)
      state.engine = engine

      await expect(callTool('tanstack_build_errors', {})).rejects.toThrow(/bundler bridge unavailable/)
    })
  })
})

describe('serverfn trace', () => {
  const SERVERFN_APP = fileURLToPath(new URL('./fixtures/serverfn-app', import.meta.url))

  const TraceSchema = z.object({
    id: z.string(),
    name: z.string(),
    durationMs: z.number(),
    status: z.enum(['ok', 'error']),
    at: z.number(),
  })
  const FunctionSchema = z.object({
    id: z.string(),
    name: z.string(),
    route: z.string().nullable(),
    file: z.string().nullable(),
  })
  const PayloadSchema = z.object({
    traces: z.array(TraceSchema),
    functions: z.array(FunctionSchema),
  })

  const SERVER_FN = {file: '/src/x.ts', export: 'getThing_createServerFn_handler'}
  const SERVER_FN_ID = Buffer.from(JSON.stringify(SERVER_FN)).toString('base64')

  const BASEPATH_FN = {file: '/src/y.ts', export: 'getUnderBase_createServerFn_handler'}
  const BASEPATH_FN_ID = Buffer.from(JSON.stringify(BASEPATH_FN)).toString('base64')

  async function makeStateRoot(): Promise<string> {
    return realpath(await mkdtemp(join(await realpath(tmpdir()), 'conciv-ts-serverfn-')))
  }

  async function bootEngine(root: string, bridge?: BundlerBridge): Promise<{engine: Engine; callTool: CallTool}> {
    const {engine, apiBase} = await startTrusted({
      options: {stateRoot: await makeStateRoot(), systemPrompt: false},
      root,
      bridge,
      launchEditor: () => {},
      extensions: [tanstackExtension],
    })
    const session = await resolveSession(apiBase)
    return {engine, callTool: makeCallTool(apiBase, session)}
  }

  describe('tanstack server_fn_trace (IT, real vite dev server + real HTTP request)', () => {
    const state = {engine: undefined as Engine | undefined, vite: undefined as ViteDevServer | undefined}
    afterEach(async () => {
      await state.engine?.stop()
      await state.vite?.close()
      state.engine = undefined
      state.vite = undefined
    })

    it('captures a real /_serverFn/ request through the generic request-trace stream and decodes it', async () => {
      const {vite, viteBase} = await startViteFixtureServer(SERVERFN_APP)
      state.vite = vite

      const bridge = makeViteBridge(vite)
      const {engine, callTool} = await bootEngine(SERVERFN_APP, bridge)
      state.engine = engine

      const traced = Promise.withResolvers<BundlerDiagnostic>()
      const stopWatching = bridge.subscribe?.((diagnostic) => {
        if (diagnostic.kind === 'request-trace' && diagnostic.url.includes(SERVER_FN_ID)) traced.resolve(diagnostic)
      })
      await fetch(`${viteBase}/`).catch(() => undefined)
      await fetch(`${viteBase}/_serverFn/${SERVER_FN_ID}`).catch(() => undefined)
      await traced.promise
      stopWatching?.()

      const payload = PayloadSchema.parse(await callTool('tanstack_server_fn_trace', {}))
      const trace = payload.traces.find((t) => t.name === SERVER_FN.export)
      expect(trace).toBeDefined()
      expect(trace?.durationMs).toBeGreaterThanOrEqual(0)
      expect(trace?.status === 'ok' || trace?.status === 'error').toBe(true)

      const fn = payload.functions.find((f) => f.name === SERVER_FN.export)
      expect(fn?.file).toBe(SERVER_FN.file)
      expect(fn?.route).toBeNull()

      expect(payload.traces.every((t) => t.name === SERVER_FN.export)).toBe(true)
    })

    it('captures a /_serverFn/ request served under an app basepath', async () => {
      const {vite, viteBase} = await startViteFixtureServer(SERVERFN_APP)
      state.vite = vite

      const bridge = makeViteBridge(vite)
      const {engine, callTool} = await bootEngine(SERVERFN_APP, bridge)
      state.engine = engine

      const traced = Promise.withResolvers<BundlerDiagnostic>()
      const stopWatching = bridge.subscribe?.((diagnostic) => {
        if (diagnostic.kind === 'request-trace' && diagnostic.url.includes(BASEPATH_FN_ID)) traced.resolve(diagnostic)
      })
      await fetch(`${viteBase}/app/_serverFn/${BASEPATH_FN_ID}`).catch(() => undefined)
      await traced.promise
      stopWatching?.()

      const payload = PayloadSchema.parse(await callTool('tanstack_server_fn_trace', {}))
      const trace = payload.traces.find((t) => t.name === BASEPATH_FN.export)
      expect(trace).toBeDefined()
      expect(trace?.id).toBe(BASEPATH_FN_ID)

      const fn = payload.functions.find((f) => f.name === BASEPATH_FN.export)
      expect(fn?.file).toBe(BASEPATH_FN.file)
      expect(fn?.route).toBeNull()
    })
  })
})

describe('tool catalog', () => {
  const state: {kit?: CoreKit} = {}

  beforeAll(async () => {
    state.kit = await bootCoreKit({id: 'fake-tanstack-catalog', extensions: [tanstackExtension]})
  }, 120_000)

  afterAll(async () => state.kit?.cleanup())

  function kit(): CoreKit {
    const booted = state.kit
    if (!booted) throw new Error('the core kit did not boot')
    return booted
  }

  const PAGE_TOOLS = [
    'tanstack_back',
    'tanstack_data_entries',
    'tanstack_data_invalidate',
    'tanstack_detect',
    'tanstack_errors_snapshot',
    'tanstack_loader_data',
    'tanstack_navigate',
    'tanstack_query_cache',
    'tanstack_query_invalidate',
    'tanstack_query_refetch',
    'tanstack_route_tree',
    'tanstack_router_invalidate',
    'tanstack_router_state',
  ]

  const SERVER_TOOLS = ['tanstack_build_errors', 'tanstack_route_manifest', 'tanstack_server_fn_trace']

  test('the agent catalog lists exactly one tanstack tool per verb, page verbs bound client-side', async () => {
    const catalog = await kit().rpc.registry.catalog()
    const tanstackEntries = catalog
      .filter((entry) => entry.name.startsWith('tanstack_'))
      .map((entry) => `${entry.name} (${entry.binding})`)
      .toSorted()

    expect(tanstackEntries).toEqual(
      [...PAGE_TOOLS.map((name) => `${name} (client)`), ...SERVER_TOOLS.map((name) => `${name} (server)`)].toSorted(),
    )
  })

  test('every listed tanstack tool carries a summary the agent can read', async () => {
    const catalog = await kit().rpc.registry.catalog()
    const missing = catalog
      .filter((entry) => entry.name.startsWith('tanstack_'))
      .filter((entry) => entry.summary.trim().length === 0)
      .map((entry) => entry.name)

    expect(missing).toEqual([])
  })
})
