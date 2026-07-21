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

async function makeStateRoot(): Promise<string> {
  return realpath(await mkdtemp(join(await realpath(tmpdir()), 'conciv-ts-serverfn-')))
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

describe('tanstack server_fn_trace (IT, real vite dev server + real HTTP request)', () => {
  const state = {engine: undefined as Engine | undefined, vite: undefined as ViteDevServer | undefined}
  afterEach(async () => {
    await state.engine?.stop()
    await state.vite?.close()
    state.engine = undefined
    state.vite = undefined
  })

  it('captures a real /_serverFn/ request through the generic request-trace stream and decodes it', async () => {
    const vite = await createServer({
      root: SERVERFN_APP,
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
    const {engine, callTool} = await bootEngine(SERVERFN_APP, bridge)
    state.engine = engine

    await fetch(`${viteBase}/`).catch(() => undefined)
    await fetch(`${viteBase}/_serverFn/${SERVER_FN_ID}`).catch(() => undefined)

    await expect
      .poll(
        async () => {
          const payload = PayloadSchema.parse(await callTool('tanstack_server_fn_trace', {}))
          return payload.traces.length
        },
        {timeout: 10_000},
      )
      .toBeGreaterThan(0)

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
})
