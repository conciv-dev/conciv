import {randomUUID} from 'node:crypto'
import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, expect, test} from 'vitest'
import {Hono} from 'hono'
import WebSocket from 'ws'
import {z} from 'zod'
import {createORPCClient, type NestedClient} from '@orpc/client'
import {RPCLink} from '@orpc/client/websocket'
import {os, type RouterClient} from '@orpc/server'
import {serveHono} from '@conciv/serve'
import {defineExtension, defineTool, makeExtRpcClient, type AnyExtension} from '@conciv/extension'
import {makeRpcClient, type RpcClient} from '@conciv/contract'
import {CONCIV_SESSION_HEADER} from '@conciv/protocol/chat-types'
import type {RpcContext} from '@conciv/protocol/rpc-types'
import {makeApp} from '../../src/app.js'
import type {ResolvedConcivConfig} from '../../src/config.js'
import {requireClaude} from '../helpers/adapters.js'

const probeOs = os.$context<RpcContext>()

function makeProbeRouter() {
  return probeOs.router({
    ping: probeOs
      .input(z.object({value: z.string()}))
      .output(z.object({pong: z.string(), origin: z.string(), session: z.string()}))
      .handler(({input, context}) => ({
        pong: input.value,
        origin: context.origin,
        session: String(context.headers[CONCIV_SESSION_HEADER] ?? ''),
      })),
  })
}

type ProbeRouter = ReturnType<typeof makeProbeRouter>

const probeExtension = defineExtension({name: 'Router Probe'}).server(() => ({
  context: {},
  router: makeProbeRouter(),
}))

const gatedTool = defineTool({
  name: 'ws_probe_gated',
  description: 'A tool that always needs approval.',
  inputSchema: z.object({}),
  outputSchema: z.object({done: z.boolean()}),
  approval: 'ask',
  meta: {summary: 'always asks', category: 'fixture', mutating: true},
}).server(async () => ({done: true}))

const gatedExtension = defineExtension({name: 'Gate Probe', tools: [gatedTool]})

type Booted = {
  base: string
  wsBase: string
  close: () => Promise<void>
}

const cleanups: (() => Promise<void>)[] = []

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).toReversed()) await cleanup()
})

async function boot(opts: {token?: string; extensions?: AnyExtension[]} = {}): Promise<Booted> {
  const stateRoot = mkdtempSync(join(tmpdir(), 'conciv-ws-'))
  const cfg: ResolvedConcivConfig = {
    enabled: true,
    widgetUrl: undefined,
    stateRoot,
    harness: requireClaude().id,
    harnessBin: undefined,
    sessionId: '',
    systemPrompt: '',
    extensions: undefined,
  }
  const prefix = opts.token ? `/t/${opts.token}` : ''
  const {app, dispose} = await makeApp({
    cfg,
    cwd: stateRoot,
    basePath: prefix,
    openInEditor: () => {},
    harness: requireClaude(),
    extensions: opts.extensions ?? [probeExtension, gatedExtension],
  })
  const served = opts.token ? new Hono().mount(prefix, app.fetch) : app
  const {port, close} = await serveHono({fetch: served.fetch})
  const base = `http://127.0.0.1:${port}${prefix}`
  const shutdown = {done: null as Promise<void> | null}
  const booted: Booted = {
    base,
    wsBase: base.replace('http:', 'ws:'),
    close: () => {
      shutdown.done ??= close()
        .then(() => dispose())
        .then(() => rmSync(stateRoot, {recursive: true, force: true}))
      return shutdown.done
    },
  }
  cleanups.push(booted.close)
  return booted
}

type WsRpc<TClient> = {client: TClient; socket: WebSocket; closed: Promise<void>}

function openWsRpc<TClient extends NestedClient<Record<never, never>>>(
  wsBase: string,
  opts: {headers?: Record<string, string>; path?: string[]} = {},
) {
  const socket = new WebSocket(`${wsBase}/rpc-ws`)
  const link = new RPCLink({websocket: socket, ...(opts.headers ? {headers: opts.headers} : {})})
  const closed = new Promise<void>((resolve) => socket.on('close', () => resolve()))
  const client = createORPCClient<TClient>(link, ...(opts.path ? [{path: opts.path}] : []))
  cleanups.push(async () => {
    socket.close()
    await closed
  })
  return {client, socket, closed} satisfies WsRpc<TClient>
}

function whenOpen(socket: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.once('open', () => resolve())
    socket.once('error', reject)
  })
}

async function messageOf(call: Promise<unknown>): Promise<string> {
  try {
    await call
    return ''
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}

test('an rpc round trip completes over ws through the token-prefixed mount', async () => {
  const token = randomUUID()
  const served = await boot({token})
  const {client, socket} = openWsRpc<RpcClient>(served.wsBase)
  await whenOpen(socket)
  const health = await client.meta.tools(undefined)
  expect(health.tools.some((tool) => tool.name === 'ws_probe_gated')).toBe(true)
}, 30_000)

test('a wrong token prefix never upgrades the rpc socket', async () => {
  const served = await boot({token: randomUUID()})
  const wrongBase = served.wsBase.replace(/\/t\/[^/]+$/, `/t/${randomUUID()}`)
  const socket = new WebSocket(`${wrongBase}/rpc-ws`)
  const outcome = await new Promise<'open' | 'rejected'>((resolve) => {
    socket.once('open', () => resolve('open'))
    socket.once('error', () => resolve('rejected'))
  })
  socket.close()
  expect(outcome).toBe('rejected')
}, 30_000)

test('a non-loopback origin is rejected on the rpc-ws upgrade while a loopback origin upgrades', async () => {
  const served = await boot()
  const rejected = await new Promise<'open' | 'rejected'>((resolve) => {
    const socket = new WebSocket(`${served.wsBase}/rpc-ws`, {headers: {origin: 'http://evil.com'}})
    socket.once('open', () => {
      socket.close()
      resolve('open')
    })
    socket.once('error', () => resolve('rejected'))
  })
  expect(rejected).toBe('rejected')
  const allowed = new WebSocket(`${served.wsBase}/rpc-ws`, {headers: {origin: served.base}})
  await whenOpen(allowed)
  expect(allowed.readyState).toBe(WebSocket.OPEN)
  allowed.close()
}, 30_000)

test('a per-call session header reaches an approval-gated procedure over both fetch and ws', async () => {
  const served = await boot()
  const sessionId = 'conciv_ws_header_probe'
  const fetchMessage = await messageOf(
    makeRpcClient(served.base, {headers: {[CONCIV_SESSION_HEADER]: sessionId}}).registry.call({
      name: 'ws_probe_gated',
      input: {},
    }),
  )
  const {client, socket} = openWsRpc<RpcClient>(served.wsBase, {headers: {[CONCIV_SESSION_HEADER]: sessionId}})
  await whenOpen(socket)
  const wsMessage = await messageOf(client.registry.call({name: 'ws_probe_gated', input: {}}))
  expect(fetchMessage).toContain(`session "${sessionId}" does not exist`)
  expect(wsMessage).toContain(`session "${sessionId}" does not exist`)
}, 30_000)

test('a header-less ws call is refused for the missing session header, not silently accepted', async () => {
  const served = await boot()
  const {client, socket} = openWsRpc<RpcClient>(served.wsBase)
  await whenOpen(socket)
  const message = await messageOf(client.registry.call({name: 'ws_probe_gated', input: {}}))
  expect(message).toContain('no session is attached to ask through')
}, 30_000)

test('an extension procedure answers over ws under ext.<slug> and over the unchanged fetch url', async () => {
  const served = await boot()
  const sessionId = 'conciv_ws_ext_probe'
  const overFetch = await makeExtRpcClient<ProbeRouter>(served.base, 'router-probe').ping({value: 'fetch'})
  const {client, socket} = openWsRpc<RouterClient<ProbeRouter>>(served.wsBase, {
    headers: {[CONCIV_SESSION_HEADER]: sessionId},
    path: ['ext', 'router-probe'],
  })
  await whenOpen(socket)
  const overWs = await client.ping({value: 'socket'})
  expect(overFetch).toEqual({pong: 'fetch', origin: served.base, session: ''})
  expect(overWs).toEqual({pong: 'socket', origin: served.base, session: sessionId})
}, 30_000)

test('the first rpc frame sent immediately at open is answered, never dropped', async () => {
  const served = await boot()
  const {client, socket} = openWsRpc<RpcClient>(served.wsBase)
  const answered = client.meta.tools(undefined)
  expect(socket.readyState).toBe(WebSocket.CONNECTING)
  const payload = await answered
  expect(payload.tools.some((tool) => tool.name === 'ws_probe_gated')).toBe(true)
}, 30_000)

test('closing the server closes a live rpc socket gracefully and resolves', async () => {
  const served = await boot()
  const {client, socket, closed} = openWsRpc<RpcClient>(served.wsBase)
  await whenOpen(socket)
  await client.meta.tools(undefined)
  const code = new Promise<number>((resolve) => socket.once('close', (value) => resolve(value)))
  await served.close()
  await closed
  expect(await code).toBe(1001)
}, 30_000)

test('rejected upgrades never poison the upgrade path for a later good client', async () => {
  const served = await boot()
  for (const attempt of Array.from({length: 20}, (_value, index) => index)) {
    await new Promise<void>((resolve) => {
      const rejectedSocket = new WebSocket(`${served.wsBase}/rpc-ws`, {
        headers: {origin: `http://evil-${attempt}.com`},
      })
      rejectedSocket.once('open', () => {
        rejectedSocket.close()
        resolve()
      })
      rejectedSocket.once('error', () => resolve())
    })
  }
  const {client, socket} = openWsRpc<RpcClient>(served.wsBase)
  await whenOpen(socket)
  const payload = await client.meta.tools(undefined)
  expect(payload.tools.some((tool) => tool.name === 'ws_probe_gated')).toBe(true)
}, 30_000)

test('a malformed rpc frame closes that socket without crashing the server', async () => {
  const served = await boot()
  const rejections: unknown[] = []
  const onRejection = (reason: unknown) => rejections.push(reason)
  process.on('unhandledRejection', onRejection)
  try {
    const bad = new WebSocket(`${served.wsBase}/rpc-ws`)
    await whenOpen(bad)
    const badClosed = new Promise<void>((resolve) => bad.once('close', () => resolve()))
    bad.send('this is not an orpc frame')
    await badClosed
    const {client, socket} = openWsRpc<RpcClient>(served.wsBase)
    await whenOpen(socket)
    const payload = await client.meta.tools(undefined)
    expect(payload.tools.some((tool) => tool.name === 'ws_probe_gated')).toBe(true)
    expect(rejections).toEqual([])
  } finally {
    process.off('unhandledRejection', onRejection)
  }
}, 30_000)

test('two extension names that normalize to the same rpc slug are rejected at mount', async () => {
  const first = defineExtension({name: 'Slug Probe'}).server(() => ({context: {}, router: makeProbeRouter()}))
  const second = defineExtension({name: 'slug-probe'}).server(() => ({context: {}, router: makeProbeRouter()}))
  await expect(boot({extensions: [first, second]})).rejects.toThrow(/slug-probe/)
}, 30_000)
