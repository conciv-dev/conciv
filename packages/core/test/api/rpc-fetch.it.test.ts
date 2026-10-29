import {randomUUID} from 'node:crypto'
import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, expect, test} from 'vitest'
import {Hono} from 'hono'
import {z} from 'zod'
import {ORPCError, safe} from '@orpc/client'
import {os} from '@orpc/server'
import {serveHono} from '@conciv/serve'
import {defineExtension, defineTool, makeExtRpcClient, type AnyExtension} from '@conciv/extension'
import {makeRpcClient} from '@conciv/contract'
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
    sessionId: undefined,
    harnessSessionId: undefined,
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

async function messageOf(call: Promise<unknown>): Promise<string> {
  try {
    await call
    return ''
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}

test('an rpc round trip completes over fetch through the token-prefixed mount', async () => {
  const token = randomUUID()
  const served = await boot({token})
  const health = await makeRpcClient(served.base).meta.tools(undefined)
  expect(health.tools.some((tool) => tool.name === 'ws_probe_gated')).toBe(true)
}, 30_000)

test('a per-call session header reaches an approval-gated procedure', async () => {
  const served = await boot()
  const sessionId = 'conciv_rpc_header_probe'
  const message = await messageOf(
    makeRpcClient(served.base, {headers: {[CONCIV_SESSION_HEADER]: sessionId}}).registry.call({
      name: 'ws_probe_gated',
      input: {},
    }),
  )
  expect(message).toContain(`session "${sessionId}" does not exist`)
}, 30_000)

test('a header-less call is refused as unidentified before any tool runs', async () => {
  const served = await boot()
  const {error} = await safe(makeRpcClient(served.base).registry.call({name: 'ws_probe_gated', input: {}}))
  if (!(error instanceof ORPCError)) throw new Error('the header-less call did not fail with an rpc error')
  expect(error.code).toBe('UNAUTHORIZED')
  expect(error.message).toContain(CONCIV_SESSION_HEADER)
}, 30_000)

test('an extension procedure answers under the ext.<slug> fetch url', async () => {
  const served = await boot()
  const overFetch = await makeExtRpcClient<ProbeRouter>(served.base, 'router-probe').ping({value: 'fetch'})
  expect(overFetch).toEqual({pong: 'fetch', origin: served.base, session: ''})
}, 30_000)

test('two extension names that normalize to the same rpc slug are rejected at mount', async () => {
  const first = defineExtension({name: 'Slug Probe'}).server(() => ({context: {}, router: makeProbeRouter()}))
  const second = defineExtension({name: 'slug-probe'}).server(() => ({context: {}, router: makeProbeRouter()}))
  await expect(boot({extensions: [first, second]})).rejects.toThrow(/slug-probe/)
}, 30_000)

test('two router-less extension names that normalize to the same /api/ext slug are rejected at mount', async () => {
  const first = defineExtension({name: 'Http Probe'}).server(() => ({
    context: {},
    app: new Hono().get('/who', (c) => c.json({who: 'first'})),
  }))
  const second = defineExtension({name: 'http-probe'}).server(() => ({
    context: {},
    app: new Hono().get('/who', (c) => c.json({who: 'second'})),
  }))
  await expect(boot({extensions: [first, second]})).rejects.toThrow(
    /slug collision: "http-probe" is claimed by both "Http Probe" and "http-probe"/,
  )
}, 30_000)
