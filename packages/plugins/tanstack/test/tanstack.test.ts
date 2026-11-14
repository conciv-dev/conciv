import {copyFileSync, readdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {mkdtemp, realpath, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {createServer, type ViteDevServer} from 'vite'
import {describe, expect, it, onTestFinished} from 'vitest'
import {z} from 'zod'
import {makeViteBridge} from '@conciv/extension/vite'
import {connectMcpClient, makeDiscoverTools} from '@conciv/harness-testkit'
import {bootCoreKit, type CoreKit} from '@conciv/plugin-testkit/core-kit'
import type {BundlerBridge, BundlerDiagnostic} from '@conciv/protocol/bundler-types'

const PACKAGE_DIR = fileURLToPath(new URL('..', import.meta.url))
const FIXTURES = join(PACKAGE_DIR, 'test', 'fixtures')

const RoutesSchema = z.array(
  z.object({path: z.string(), kind: z.string(), dynamic: z.boolean(), file: z.string().nullable()}),
)
const AppErrorsSchema = z.array(
  z.object({
    kind: z.string(),
    message: z.string(),
    source: z.object({file: z.string(), line: z.number(), column: z.number()}).nullable(),
  }),
)
const TracePayloadSchema = z.object({
  traces: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      durationMs: z.number(),
      status: z.enum(['ok', 'error']),
      at: z.number(),
    }),
  ),
  functions: z.array(
    z.object({id: z.string(), name: z.string(), route: z.string().nullable(), file: z.string().nullable()}),
  ),
})
const ExecuteFailureSchema = z.object({error: z.object({message: z.string(), name: z.literal('Error')})})

const SERVER_FN = {file: '/src/x.ts', export: 'getThing_createServerFn_handler'}
const SERVER_FN_ID = Buffer.from(JSON.stringify(SERVER_FN)).toString('base64')
const BASEPATH_FN = {file: '/src/y.ts', export: 'getUnderBase_createServerFn_handler'}
const BASEPATH_FN_ID = Buffer.from(JSON.stringify(BASEPATH_FN)).toString('base64')

function fixtureFiles(name: string): Record<string, string> {
  const directory = join(FIXTURES, name)
  return Object.fromEntries(
    readdirSync(directory, {recursive: true, withFileTypes: true})
      .filter((entry) => entry.isFile())
      .map((entry) => {
        const path = join(entry.parentPath, entry.name)
        return [path.slice(directory.length + 1), readFileSync(path, 'utf8')]
      }),
  )
}

async function scratchDirectory(prefix: string): Promise<string> {
  const directory = await realpath(await mkdtemp(join(await realpath(tmpdir()), prefix)))
  onTestFinished(() => rm(directory, {recursive: true, force: true}))
  return directory
}

async function startVite(root: string): Promise<{vite: ViteDevServer; viteBase: string}> {
  const vite = await createServer({
    root,
    configFile: false,
    logLevel: 'silent',
    server: {host: '127.0.0.1', port: 0},
  })
  onTestFinished(() => vite.close())
  await vite.listen()
  const address = vite.httpServer?.address()
  const port = typeof address === 'object' && address ? address.port : 0
  return {vite, viteBase: `http://127.0.0.1:${port}`}
}

async function bootProject(files: Record<string, string>, bridge?: BundlerBridge): Promise<CoreKit> {
  const kit = await bootCoreKit({id: 'fake', plugins: [PACKAGE_DIR], files, ...(bridge ? {bundler: bridge} : {})})
  onTestFinished(() => kit.cleanup())
  return kit
}

function useTool(kit: CoreKit, name: string, input: Record<string, unknown> = {}): Promise<unknown> {
  return kit.callTool(`tanstack_${name}`, input)
}

async function toolFailure(pending: Promise<unknown>): Promise<string> {
  const failure = await pending.then(
    () => new Error('the tool answered instead of failing'),
    (error: unknown) => error,
  )
  if (!(failure instanceof Error)) throw new Error(`the tool failed with a non-error: ${String(failure)}`)
  return ExecuteFailureSchema.parse(JSON.parse(failure.message)).error.message
}

function diagnosticSeen(bridge: BundlerBridge, matches: (diagnostic: BundlerDiagnostic) => boolean): Promise<void> {
  const seen = Promise.withResolvers<void>()
  const stop = bridge.subscribe?.((diagnostic) => {
    if (matches(diagnostic)) seen.resolve()
  })
  return seen.promise.finally(() => stop?.())
}

describe('the tanstack plugin without a bundler', () => {
  it('is active, lists for code mode, loads its skill, reads the route manifest and tells the model why a tool failed', async () => {
    const kit = await bootProject(fixtureFiles('route-manifest-app'))

    const plugin = (await kit.rpc.plugin.list()).data.find((entry) => entry.id === 'tanstack')
    expect(plugin?.state).toEqual({status: 'active'})
    expect(plugin?.features).toMatchObject({server: true})

    const discovered = await makeDiscoverTools(
      kit.base,
      await kit.session(),
    )(['tanstack_build_errors', 'tanstack_route_manifest', 'tanstack_server_fn_trace'])
    expect(discovered.tools.map((tool) => tool.name)).toEqual([
      'external_tanstack_build_errors',
      'external_tanstack_route_manifest',
      'external_tanstack_server_fn_trace',
    ])

    const mcp = await connectMcpClient(`${kit.base}/api/mcp`, {'conciv-session-id': await kit.session()})
    onTestFinished(() => mcp.close())
    const skill = (await mcp.tools()).find((tool) => tool.name === 'skill')
    if (!skill) throw new Error('the skill tool is not on /api/mcp')
    const loaded = JSON.stringify(await skill.execute({id: 'tanstack'}))
    for (const name of ['external_tanstack_build_errors', 'external_tanstack_route_manifest', 'untrusted']) {
      expect(loaded).toContain(name)
    }

    const routes = RoutesSchema.parse(await useTool(kit, 'route_manifest'))
    expect(routes.map((route) => route.path)).toEqual(expect.arrayContaining(['/', '/about', '/form']))
    expect(routes.find((route) => route.kind === 'layout')?.file).toContain('__root')
    const about = routes.find((route) => route.path === '/about')
    expect(about?.kind).toBe('page')
    expect(about?.dynamic).toBe(false)
    expect(about?.file?.endsWith('.tsx')).toBe(true)
    expect(routes.find((route) => route.path === '/form')?.file?.endsWith('routes/form')).toBe(true)

    kit.writeProjectFile(
      'src/routeTree.gen.ts',
      fixtureFiles('double-quoted-manifest-app')['src/routeTree.gen.ts'] ?? 'missing fixture',
    )
    const quoted = RoutesSchema.parse(await useTool(kit, 'route_manifest'))
    expect(quoted.map((route) => route.path)).toEqual(expect.arrayContaining(['/', '/posts/$postId']))
    const dynamic = quoted.find((route) => route.path === '/posts/$postId')
    expect(dynamic?.kind).toBe('page')
    expect(dynamic?.dynamic).toBe(true)

    rmSync(join(kit.stateRoot, 'src', 'routeTree.gen.ts'))
    const unreadable = await toolFailure(useTool(kit, 'route_manifest'))
    expect(unreadable).toContain('ENOENT')
    expect(unreadable).toContain('routeTree.gen.ts')

    expect(await toolFailure(useTool(kit, 'build_errors'))).toBe('bundler bridge unavailable')
  })
})

describe('the tanstack plugin on a real Vite dev server', () => {
  it('reads a real transform error and decodes server-function requests, also under a basepath', async () => {
    const root = await scratchDirectory('conciv-tanstack-vite-')
    copyFileSync(join(FIXTURES, 'serverfn-app', 'index.html'), join(root, 'index.html'))
    writeFileSync(join(root, 'broken.ts'), 'export const broken = = 1\n')
    const {vite, viteBase} = await startVite(root)
    const bridge = makeViteBridge(vite)
    const kit = await bootProject({}, bridge)

    const failed = diagnosticSeen(bridge, (diagnostic) => diagnostic.kind === 'build-error')
    await fetch(`${viteBase}/broken.ts`, {headers: {'sec-fetch-dest': 'script'}}).catch(() => undefined)
    await failed
    const buildError = AppErrorsSchema.parse(await useTool(kit, 'build_errors')).find((error) => error.kind === 'build')
    expect(buildError?.message.length).toBeGreaterThan(0)
    expect(buildError?.source?.file).toContain('broken.ts')

    const traced = diagnosticSeen(
      bridge,
      (diagnostic) => diagnostic.kind === 'request-trace' && diagnostic.url.includes(SERVER_FN_ID),
    )
    await fetch(`${viteBase}/`).catch(() => undefined)
    await fetch(`${viteBase}/_serverFn/${SERVER_FN_ID}`).catch(() => undefined)
    await traced
    const payload = TracePayloadSchema.parse(await useTool(kit, 'server_fn_trace'))
    expect(payload.traces.map((trace) => trace.name)).toEqual([SERVER_FN.export])
    expect(payload.traces[0]?.durationMs).toBeGreaterThanOrEqual(0)
    expect(payload.functions).toEqual([{id: SERVER_FN_ID, name: SERVER_FN.export, route: null, file: SERVER_FN.file}])

    const underBase = diagnosticSeen(
      bridge,
      (diagnostic) => diagnostic.kind === 'request-trace' && diagnostic.url.includes(BASEPATH_FN_ID),
    )
    await fetch(`${viteBase}/app/_serverFn/${BASEPATH_FN_ID}`).catch(() => undefined)
    await underBase
    const based = TracePayloadSchema.parse(await useTool(kit, 'server_fn_trace', {count: 1}))
    expect(based.traces.map((trace) => trace.id)).toEqual([BASEPATH_FN_ID])
    expect(based.functions.find((serverFunction) => serverFunction.name === BASEPATH_FN.export)).toEqual({
      id: BASEPATH_FN_ID,
      name: BASEPATH_FN.export,
      route: null,
      file: BASEPATH_FN.file,
    })
  })
})
