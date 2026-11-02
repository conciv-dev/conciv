/// <reference lib="dom" />
import {mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {concivError, defineConcivFunction} from '@conciv/extension/devframe-function'
import {defineConcivPlugin} from '@conciv/extension/devframe-plugin'
import {createFakeHarness, type Kit} from '@conciv/harness-testkit'
import {
  loginTab,
  pluginFrame,
  probeScript,
  probeTab,
  serveProbeHost,
  trustedTab,
  type ProbeHost,
} from '@conciv/harness-testkit/devframe-probe'
import {SessionId} from '@conciv/protocol/chat-types'
import type {HarnessCommandsContext} from '@conciv/protocol/harness-types'
import {makeRpcClient} from '@conciv/contract'
import {defineHarness} from '@conciv/harness'
import {nodeClient} from '@conciv/extension/devframe-connection'
import {defineDevframe} from 'devframe'
import {chromium, type Browser} from 'playwright'
import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {z} from 'zod'
import {isBrowserCaller} from '../src/devframe-trust.js'
import {start} from '../src/start.js'
import {bootKit} from './helpers.js'

const TICKS_CHANNEL = 'hub-probe:ticks'
const SHARED_STATE = 'hub-probe:shared'
const SESSIONS_STATE = 'conciv:sessions'
const PLUGIN_FRAME = 'devframes_plugin_terminals/'

const hubProbe = defineConcivPlugin({id: 'hub-probe', title: 'Hub probe'}).server(async (ctx) => {
  const ticks = ctx.rpc.streaming.create<number>(TICKS_CHANNEL, {replayWindow: 256})
  const shared = await ctx.rpc.sharedState.get<{count: number}>(SHARED_STATE, {initialValue: {count: 0}})
  ctx.rpc.register(
    defineConcivFunction({
      name: 'hub-probe:defaults',
      type: 'query',
      agent: {description: 'marks this hub as having an agent surface', safety: 'read'},
      input: z.object({count: z.number().default(3)}),
      output: z.object({count: z.number()}),
      handler: (input) => input,
    }),
  )
  ctx.rpc.register(
    defineConcivFunction({
      name: 'hub-probe:fail',
      type: 'query',
      input: z.object({}),
      output: z.null(),
      handler: () => {
        throw concivError('NOT_FOUND', 'nothing here', {id: 7})
      },
    }),
  )
  ctx.rpc.register(
    defineConcivFunction({
      name: 'hub-probe:bump',
      type: 'action',
      input: z.object({}),
      output: z.object({ok: z.boolean()}),
      handler: () => {
        shared.mutate((value) => ({count: value.count + 1}))
        return {ok: true}
      },
    }),
  )
  ctx.rpc.register(
    defineConcivFunction({
      name: 'hub-probe:ticks',
      type: 'action',
      input: z.object({count: z.number(), hold: z.boolean().default(false)}),
      output: z.object({streamId: z.string()}),
      handler: (input) => {
        const stream = ticks.start()
        Array.from({length: input.count}, (_value, index) => index + 1).forEach((tick) => stream.write(tick))
        if (!input.hold) stream.close()
        return {streamId: stream.id}
      },
    }),
  )
  ctx.rpc.register(
    defineConcivFunction({
      name: 'hub-probe:caller',
      type: 'query',
      input: z.object({}),
      output: z.object({browser: z.boolean()}),
      handler: (_input, {ctx: context}) => ({browser: isBrowserCaller(context)}),
    }),
  )
  ctx.rpc.register(
    defineConcivFunction({
      name: 'hub-probe:session',
      type: 'query',
      session: true,
      input: z.object({}),
      output: z.object({sessionId: z.string()}),
      handler: (_input, {sessionId}) => ({sessionId}),
    }),
  )
})

declare module 'devframe' {
  interface DevframeRpcServerFunctions {
    'hub-probe:defaults': (input: {count?: number}) => Promise<{count: number}>
    'hub-probe:fail': (input: Record<string, never>) => Promise<null>
    'hub-probe:bump': (input: Record<string, never>) => Promise<{ok: boolean}>
    'hub-probe:ticks': (input: {count: number; hold?: boolean}) => Promise<{streamId: string}>
    'hub-probe:caller': (input: Record<string, never>) => Promise<{browser: boolean}>
    'hub-probe:session': (input: {sessionId?: string}) => Promise<{sessionId: string}>
    'added:ping': () => Promise<string>
  }
}

const addedDevframe = defineDevframe({
  id: 'added',
  name: 'added',
  version: '0.0.0',
  packageName: 'added',
  homepage: 'https://conciv.dev',
  description: 'a user devframe added through config',
  setup(ctx) {
    ctx.rpc.register({name: 'added:ping', type: 'query', handler: () => 'pong'})
  },
})

describe('conciv hub', () => {
  let kit: Kit
  let browser: Browser
  let host: ProbeHost

  beforeAll(async () => {
    kit = await bootKit({plugins: [hubProbe], devframes: [addedDevframe]}, createFakeHarness({id: 'fake-hub'}))
    host = await serveProbeHost()
    browser = await chromium.launch({headless: true})
  }, 60_000)

  afterAll(async () => {
    await browser.close()
    await host.close()
    await kit.cleanup()
  })

  it('refuses an untrusted tab, then serves it after the one-time code', async () => {
    const tab = await probeTab(browser, host.url, kit.hubUrl)
    const attempt = (): Promise<string> =>
      tab.evaluate(async () => {
        const client = await window.concivConnection.ready()
        return window.concivProbe
          .concivCall(client)('hub-probe:defaults', {})
          .then(
            () => 'served',
            () => 'refused',
          )
      })
    expect(await attempt()).toBe('refused')
    await loginTab(tab)
    expect(await attempt()).toBe('served')
    await tab.close()
  }, 15_000)

  it('rebuilds a coded error in the browser client', async () => {
    const tab = await trustedTab(browser, host.url, kit.hubUrl)
    const outcome = await tab.evaluate(async () => {
      const client = await window.concivConnection.ready()
      return window.concivProbe
        .concivCall(client)('hub-probe:fail', {})
        .catch((error: {name: string; code: string; data: unknown}) => ({
          name: error.name,
          code: error.code,
          data: error.data,
        }))
    })
    expect(outcome).toEqual({name: 'ConcivError', code: 'NOT_FOUND', data: {id: 7}})
    await tab.close()
  }, 15_000)

  it('applies zod defaults for a browser caller', async () => {
    const tab = await trustedTab(browser, host.url, kit.hubUrl)
    const result = await tab.evaluate(async () => {
      const client = await window.concivConnection.ready()
      return window.concivProbe.concivCall(client)('hub-probe:defaults', {})
    })
    expect(result).toEqual({count: 3})
    await tab.close()
  }, 15_000)

  it('syncs shared state to two tabs', async () => {
    const tabs = [await trustedTab(browser, host.url, kit.hubUrl), await trustedTab(browser, host.url, kit.hubUrl)]
    const seen = tabs.map((tab) =>
      tab.evaluate(
        (key) =>
          new Promise<number>((resolve) => {
            window.concivProbe.readSharedState<{count: number}>(window.concivConnection, key, (value) => {
              if (value.count > 0) resolve(value.count)
            })
          }),
        SHARED_STATE,
      ),
    )
    await kit.hub.call('hub-probe:bump', {})
    expect(await Promise.all(seen)).toEqual([1, 1])
    await Promise.all(tabs.map((tab) => tab.close()))
  }, 15_000)

  it('publishes the session list to shared state when a session changes', async () => {
    const tab = await trustedTab(browser, host.url, kit.hubUrl)
    const seen = tab.evaluate(
      ({key, title}) =>
        new Promise<string>((resolve) => {
          window.concivProbe.readSharedState<{id: string; title: string}[]>(window.concivConnection, key, (value) => {
            const match = value.find((meta) => meta.title === title)
            if (match) resolve(match.id)
          })
        }),
      {key: SESSIONS_STATE, title: 'published title'},
    )
    const renamed = async (): Promise<string> => {
      const {sessionId} = await kit.hub.call('conciv:sessions:create', {})
      await kit.hub.call('conciv:sessions:rename', {sessionId, title: 'published title'})
      return sessionId
    }
    const [seenId, sessionId] = await Promise.all([seen, renamed()])
    expect(seenId).toBe(sessionId)
    await tab.close()
  }, 15_000)

  it('leaves the latest session list in shared state after concurrent changes', async () => {
    const {sessionId} = await kit.hub.call('conciv:sessions:create', {})
    const titles = Array.from({length: 16}, (_, index) => `concurrent ${index}`)
    await Promise.all(titles.map((title) => kit.hub.call('conciv:sessions:rename', {sessionId, title})))
    const context = await kit.hubInstance.context
    const state = await context.rpc.sharedState.get(SESSIONS_STATE)
    expect(state.value()).toEqual(await kit.hub.call('conciv:sessions:list', {}))
  })

  it('stops writing shared state once the reader is released', async () => {
    const tab = await trustedTab(browser, host.url, kit.hubUrl)
    const outcome = tab.evaluate(
      (key) =>
        new Promise<{released: number[]; live: number}>((resolve) => {
          const released: number[] = []
          const stop = window.concivProbe.readSharedState<{count: number}>(window.concivConnection, key, (value) => {
            released.push(value.count)
            if (released.length !== 1) return
            stop()
            window.concivProbe.readSharedState<{count: number}>(window.concivConnection, key, (latest) => {
              if (latest.count === value.count) Object.assign(window, {readyForBump: true})
              if (latest.count > value.count) resolve({released, live: latest.count})
            })
          })
        }),
      SHARED_STATE,
    )
    await tab.waitForFunction(() => Reflect.get(window, 'readyForBump') === true)
    await kit.hub.call('hub-probe:bump', {})
    const {released, live} = await outcome
    expect(released).toHaveLength(1)
    expect(live).toBe((released[0] ?? 0) + 1)
    await tab.close()
  }, 15_000)

  it('replays a stream to a late subscriber', async () => {
    const tab = await trustedTab(browser, host.url, kit.hubUrl)
    const ticks = await tab.evaluate(async (channel) => {
      const client = await window.concivConnection.ready()
      const {streamId} = await window.concivProbe.concivCall(client)('hub-probe:ticks', {count: 5})
      const received: number[] = []
      for await (const tick of client.streaming.subscribe<number>(channel, streamId)) received.push(tick)
      return received
    }, TICKS_CHANNEL)
    expect(ticks).toEqual([1, 2, 3, 4, 5])
    await tab.close()
  }, 15_000)

  it('trusts a same-origin plugin iframe from the stored login and refuses a stranger', async () => {
    const frameUrl = `${kit.hubUrl}${PLUGIN_FRAME}`
    const script = await probeScript()
    const home = await browser.newPage()
    await home.goto(frameUrl, {waitUntil: 'domcontentloaded'})
    await home.addScriptTag({content: script, type: 'module'})
    await home.waitForFunction(() => 'concivProbe' in window)
    await home.evaluate(async (baseURL) => {
      window.concivConnection = window.concivProbe.browserClient({baseURL})
      await window.concivConnection.ready()
    }, kit.hubUrl)
    await loginTab(home)
    const frame = await pluginFrame(home, frameUrl, script)
    const framed = await frame.evaluate(async (baseURL) => {
      const client = await window.concivProbe.browserClient({baseURL}).ready()
      return client.ensureTrusted(5_000)
    }, kit.hubUrl)
    expect(framed).toBe(true)
    await home.close()
    const stranger = await probeTab(browser, host.url, kit.hubUrl)
    const refused = await stranger.evaluate(async () => {
      const client = await window.concivConnection.ready()
      return client.ensureTrusted(300).catch(() => false)
    })
    expect(refused).toBe(false)
    await stranger.close()
  }, 20_000)

  it('tells a logged-in tab from the engine token', async () => {
    const tab = await trustedTab(browser, host.url, kit.hubUrl)
    const fromTab = await tab.evaluate(async () => {
      const client = await window.concivConnection.ready()
      return window.concivProbe.concivCall(client)('hub-probe:caller', {})
    })
    expect(fromTab).toEqual({browser: true})
    expect(await kit.hub.call('hub-probe:caller', {})).toEqual({browser: false})
    await tab.close()
  }, 15_000)

  it('runs a session function under its session and refuses one with no session', async () => {
    const sessionId = SessionId.parse(await kit.session())
    expect(await kit.hub.call('hub-probe:session', {sessionId})).toEqual({sessionId})
    await expect(kit.hub.call('hub-probe:session', {})).rejects.toMatchObject({code: 'NO_SESSION'})
  }, 10_000)

  it('mounts a devframe added through config', async () => {
    expect(await kit.hub.call('added:ping')).toBe('pong')
  }, 10_000)

  it('answers on no MCP route', async () => {
    expect((await fetch(`${kit.hubUrl}__connection.json`)).status).toBe(200)
    const route = await fetch(`${kit.hubUrl}__mcp`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({jsonrpc: '2.0', id: 1, method: 'tools/list'}),
    })
    expect(route.status).toBe(404)
    expect(kit.hubInstance.connectionMeta().mcp).toBeUndefined()
  }, 10_000)

  it('registers no WebMCP tool from a page client', async () => {
    const page = await browser.newPage()
    await page.addInitScript(() => {
      const registered: string[] = []
      Object.assign(window, {webMcpTools: registered})
      Object.assign(document, {
        modelContext: {
          registerTool: (tool: {name: string}) => {
            registered.push(tool.name)
          },
        },
      })
    })
    await page.goto(host.url, {waitUntil: 'domcontentloaded'})
    await page.waitForFunction(() => 'concivProbe' in window)
    const registered = await page.evaluate(async (baseURL) => {
      const client = await window.concivProbe.browserClient({baseURL}).ready()
      client.client.register({
        name: 'page:agent-tool',
        type: 'query',
        agent: {description: 'must never reach the page model context'},
        handler: () => 'never',
      })
      return Reflect.get(window, 'webMcpTools')
    }, kit.hubUrl)
    expect(registered).toEqual([])
    await page.close()
  }, 15_000)

  it('ends an open stream with DISCONNECTED on a restart and re-reads shared state after it', async () => {
    const tab = await trustedTab(browser, host.url, kit.hubUrl)
    await tab.evaluate(
      async ({channel, key}) => {
        const connection = window.concivConnection
        const client = await connection.ready()
        const {streamId} = await window.concivProbe.concivCall(client)('hub-probe:ticks', {count: 1, hold: true})
        const stream = connection.stream((live) => live.streaming.subscribe<number>(channel, streamId))
        const iterator = stream[Symbol.asyncIterator]()
        await iterator.next()
        const reads: number[] = []
        window.concivProbe.readSharedState<{count: number}>(connection, key, (value) => reads.push(value.count))
        Object.assign(window, {
          ended: iterator.next().then(
            () => 'finished',
            (error: {code: string}) => error.code,
          ),
          reads,
        })
      },
      {channel: TICKS_CHANNEL, key: SHARED_STATE},
    )
    await kit.restartServer()
    expect(await tab.evaluate(() => Reflect.get(window, 'ended'))).toBe('DISCONNECTED')
    await tab.waitForFunction(() => {
      const reads: unknown = Reflect.get(window, 'reads')
      return Array.isArray(reads) && reads.length >= 2
    })
    await tab.close()
  }, 20_000)
})

describe('start wires the hub beside oRPC', () => {
  it('answers on the engine port, still serves health, and tears down', async () => {
    const root = mkdtempSync(join(tmpdir(), 'conciv-hub-start-'))
    const engine = await start({
      options: {stateRoot: root},
      root,
      launchEditor: () => {},
      harness: createFakeHarness({id: 'fake-hub-start'}),
    })
    expect((await fetch(`${engine.apiBase}${engine.hub.base}__connection.json`)).status).toBe(200)
    expect((await fetch(`${engine.apiBase}/health`)).status).toBe(200)
    await engine.stop()
    await expect(fetch(`${engine.apiBase}/health`)).rejects.toThrow()
  }, 15_000)

  it('keeps the hub outside the access token prefix', async () => {
    const root = mkdtempSync(join(tmpdir(), 'conciv-hub-token-'))
    const accessToken = crypto.randomUUID()
    const engine = await start({
      options: {stateRoot: root},
      root,
      accessToken,
      launchEditor: () => {},
      harness: createFakeHarness({id: 'fake-hub-token'}),
    })
    expect((await fetch(`${engine.apiBase}${engine.hub.base}__connection.json`)).status).toBe(200)
    expect((await fetch(`${engine.apiBase}/t/${accessToken}/health`)).status).toBe(200)
    await engine.stop()
  }, 15_000)

  it('lists harness commands over the hub with the engine mcp url oRPC hands the harness', async () => {
    const root = mkdtempSync(join(tmpdir(), 'conciv-hub-commands-'))
    const accessToken = crypto.randomUUID()
    const fake = createFakeHarness({id: 'fake-hub-commands'})
    const harness = defineHarness({
      id: fake.id,
      binName: fake.binName,
      chatConfig: fake.chatConfig,
      capabilities: {
        resume: false,
        permissionGate: 'none',
        compaction: false,
        systemPrompt: 'none',
        mcp: 'http',
        imageInput: false,
        init: 'none',
        transcriptHistory: false,
        slashCommands: 'live',
      },
      commands: (context: HarnessCommandsContext) =>
        Promise.resolve([{name: 'mcp-url', description: context.mcpUrl ?? 'no mcp url'}]),
    })
    const engine = await start({options: {stateRoot: root}, root, accessToken, launchEditor: () => {}, harness})
    const hub = nodeClient({url: `${engine.apiBase}${engine.hub.base}`, transport: 'ws', token: accessToken})
    try {
      const {sessionId} = await hub.call('conciv:sessions:create', {})
      const overHub = await hub.call('conciv:meta:commands', {sessionId})
      const overRpc = await makeRpcClient(`${engine.apiBase}/t/${accessToken}`).meta.commands({sessionId})
      expect(overHub.commands[0]?.description).toBe(`${engine.apiBase}/t/${accessToken}/api/mcp`)
      expect(overHub).toEqual(overRpc)
    } finally {
      hub.close()
      await engine.stop()
    }
  }, 15_000)
})
