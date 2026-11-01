/// <reference lib="dom" />
import {mkdtempSync} from 'node:fs'
import {createServer, request as httpRequest, type Server} from 'node:http'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {setTimeout as wait} from 'node:timers/promises'
import {fileURLToPath} from 'node:url'
import {build} from 'esbuild'
import {chromium, type Browser, type BrowserContext, type Page} from 'playwright'
import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {getTempAuthCode} from 'devframe/node/auth'
import {createFakeHarness, makeRpcClient} from '@conciv/harness-testkit'
import {start, type Engine} from '../src/start.js'
import {z} from 'zod'
import {Client} from '@modelcontextprotocol/sdk/client/index.js'
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import {defineDevframe, defineRpcFunction} from 'devframe'
import {initHub} from '@devframes/hub/initiate'
import {defineExtension, defineTool, imageResult, toolError} from '@conciv/extension'
import {CONCIV_CLAUDE_SESSION_HEADER, CONCIV_SESSION_HEADER} from '@conciv/protocol/chat-types'
import {ChatEventType, type ChatEvent} from '@conciv/protocol/chat-event-types'
import {currentRouteSessionId} from '../src/devframe-agent-route.js'
import {createRpcClient} from 'devframe/rpc/client'
import {createWsRpcChannel} from 'devframe/rpc/transports/ws-client'
import {createSseRpcChannel} from 'devframe/rpc/transports/sse-client'
import {getDevframeRpcClient, resolveWsUrl} from 'devframe/client'
import {fromWireError, type ConcivServerFunctions} from '../src/devframe-function.js'
import type {} from '@devframes/hub/node'
import type {} from '@devframes/plugin-terminals/rpc'
import type {} from '@devframes/plugin-messages/rpc'
import type {} from '@devframes/service-shiki'
import type {} from '@devframes/service-git'
import type {} from '@devframes/service-open'

const MCP_TOKEN = 'spike-mcp-token'
const root = mkdtempSync(join(tmpdir(), 'conciv-devframe-spike-'))

function boot(at: string = root): Promise<Engine> {
  return start({
    options: {stateRoot: at},
    root: at,
    launchEditor: () => {},
    harness: createFakeHarness({id: 'fake-devframe'}),
    mcpToken: MCP_TOKEN,
  })
}

async function bundle(entry: string): Promise<string> {
  const output = await build({
    entryPoints: [fileURLToPath(new URL(entry, import.meta.url))],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    write: false,
  })
  return output.outputFiles[0]?.text ?? ''
}

async function hostPage(): Promise<{server: Server; url: string}> {
  const scripts: Record<string, string> = {
    '/client.js': await bundle('./spike/client-entry.ts'),
    '/panel.js': await bundle('./spike/panel-entry.ts'),
  }
  const pages: Record<string, string> = {
    '/panel.html': '<!doctype html><title>panel</title><script type="module" src="/panel.js"></script>',
  }
  const server = createServer((request, response) => {
    const script = scripts[request.url ?? '']
    if (script !== undefined) {
      response.writeHead(200, {'content-type': 'text/javascript'})
      response.end(script)
      return
    }
    response.writeHead(200, {'content-type': 'text/html; charset=utf-8'})
    response.end(
      pages[request.url ?? ''] ??
        '<!doctype html><title>host</title><img src="data:," width="1" height="1"><script type="module" src="/client.js"></script>',
    )
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  return {server, url: `http://127.0.0.1:${port}/`}
}

async function openTab(context: BrowserContext, url: string, base: string): Promise<Page> {
  const page = await context.newPage()
  await page.goto(url, {waitUntil: 'domcontentloaded'})
  await page.waitForFunction(() => 'getDevframeRpcClient' in window)
  await page.evaluate(async (baseURL) => {
    const client = await window.getDevframeRpcClient({baseURL, rpcOptions: window.concivRpcOptions()})
    Object.assign(window, {client})
  }, base)
  return page
}

declare global {
  interface Window {
    getDevframeRpcClient: typeof import('devframe/client').getDevframeRpcClient
    createPageScriptChannel: typeof import('devframe/in-page-channel').createPageScriptChannel
    connectPanelChannel: typeof import('devframe/in-page-channel').connectPanelChannel
    loadA11y: () => Promise<typeof import('@devframes/plugin-a11y/client-script')>
    reconnectingClient: (
      baseURL: string,
      onClient: (client: import('devframe/client').DevframeRpcClient) => void,
    ) => Promise<void>
    client: import('devframe/client').DevframeRpcClient
    concivCall: typeof import('../src/devframe-function.js').concivCall
    concivRpcOptions: typeof import('../src/devframe-function.js').concivRpcOptions
    buildRemoteDevframeUrl: typeof import('@devframes/hub/client').buildRemoteDevframeUrl
    connectRemoteDevframe: typeof import('@devframes/hub/client').connectRemoteDevframe
    restartProbe: {
      pending: Promise<string>
      stream: Promise<string>
      streamId: string
      ticks: number[]
      statuses: string[]
      sessionCounts: number[]
    }
  }
}

describe('devframe plane spike', () => {
  let engine: Engine
  let browser: Browser
  let context: BrowserContext
  let host: {server: Server; url: string}
  let page: Page

  const base = (): string => `http://127.0.0.1:${engine.port}/__conciv/`

  beforeAll(async () => {
    engine = await boot()
    host = await hostPage()
    browser = await chromium.launch({headless: true})
    context = await browser.newContext()
    page = await openTab(context, host.url, base())
  }, 60_000)

  afterAll(async () => {
    await browser.close()
    host.server.close()
    await engine.stop()
  })

  it('refuses a trusted procedure before authorization', async () => {
    const outcome = await page.evaluate(async () => {
      try {
        await window.client.call('conciv:sessions:list')
        return 'served'
      } catch (error) {
        return String(error)
      }
    })
    expect(outcome).not.toBe('served')
  })

  it('trusts the tab after it exchanges the printed code', async () => {
    await page.evaluate(() => window.client.requestAuthCode())
    const code = getTempAuthCode()
    expect(await page.evaluate((otp) => window.client.requestTrustWithCode(otp), code)).toBe(true)
  })

  it('serves a ported procedure from the real database', async () => {
    expect(await page.evaluate(() => window.client.call('conciv:sessions:list'))).toEqual([])
  })

  it('carries a coded diagnostic across the wire', async () => {
    const outcome = await page.evaluate(async () => {
      try {
        await window.concivCall(window.client)('conciv:sessions:rename', {sessionId: 'conciv_missing', title: 'x'})
        return {served: true}
      } catch (error) {
        return {
          served: false,
          name: error instanceof Error ? error.name : '',
          message: String(error),
          code: error instanceof Error && 'code' in error ? error.code : undefined,
        }
      }
    })
    console.log('DIAGNOSTIC OVER WIRE', JSON.stringify(outcome))
    expect(outcome.served).toBe(false)
    expect(outcome).toMatchObject({code: 'CONCIV_NOT_FOUND', message: 'ConcivError: session conciv_missing not found'})
  })

  it('lets the server ask this tab a question and await the answer', async () => {
    const answer = await page.evaluate(async () => {
      window.client.client.register({
        name: 'conciv:page:query',
        type: 'query',
        handler: (question: string) => `answer to ${question} from ${document.title}`,
      })
      await window.client.call('conciv:page:register', {sessionId: 'conciv_tab'})
      return window.client.call('conciv:page:ask', {sessionId: 'conciv_tab', question: 'title?'})
    })
    expect(answer).toBe('answer to title? from host')
  })

  it('keeps the oRPC plane and its websockets working beside it', async () => {
    const rpc = makeRpcClient(`http://127.0.0.1:${engine.port}`)
    expect(await rpc.sessions.list()).toEqual([])
  })

  it('exposes the agent-flagged procedure on the built-in MCP route to a token-holding CLI', async () => {
    const denied = await fetch(`${base()}__mcp`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: '{}',
    })
    expect(denied.status).toBe(401)
    const response = await fetch(`${base()}__mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        authorization: `Bearer ${MCP_TOKEN}`,
      },
      body: JSON.stringify({jsonrpc: '2.0', id: 1, method: 'tools/list', params: {}}),
    })
    const body = await response.text()
    console.log('MCP', response.status, body.slice(0, 400))
    expect(body).toContain('sessions')
  })

  it('syncs the session list to the tab as shared state', async () => {
    const rpc = makeRpcClient(`http://127.0.0.1:${engine.port}`)
    const {sessionId} = await rpc.sessions.create()
    const titles = await page.evaluate(async (id) => {
      const state = await window.client.sharedState.get('conciv:sessions')
      const updated = new Promise<string[]>((resolve) =>
        state.on('updated', (next: {sessions: {title: string | null}[]}) =>
          resolve(next.sessions.map((session) => session.title ?? '')),
        ),
      )
      await window.client.call('conciv:sessions:rename', {sessionId: id, title: 'renamed live'})
      return updated
    }, sessionId)
    expect(titles).toContain('renamed live')
  })

  it('streams chunks and replays them to a late subscriber', async () => {
    const ticks = await page.evaluate(async () => {
      const {streamId} = await window.client.call('conciv:ticks:start', {count: 5})
      const received: number[] = []
      for await (const tick of window.client.streaming.subscribe<number>('conciv:ticks', streamId)) received.push(tick)
      return received
    })
    expect(ticks).toEqual([1, 2, 3, 4, 5])
  })

  it('runs a palette command that posts a toast to the messages feed', async () => {
    const outcome = await page.evaluate(async () => {
      const commands = (await window.client.sharedState.get('devframe:commands')).value() as {id: string}[]
      const result = await window.concivCall(window.client)('hub:commands:execute', 'conciv:new-session')
      const feed = (await window.client.call('devframes:plugin:messages:list')) as {entries: {message: string}[]}
      return {
        commandIds: commands.map((command) => command.id),
        result,
        messages: feed.entries.map((entry) => entry.message),
      }
    })
    expect(outcome.commandIds).toContain('conciv:new-session')
    expect(outcome.result).toEqual({sessionId: 'conciv_new'})
    expect(outcome.messages).toContain('conciv session created')
  })

  it('streams a real PTY session to the tab', async () => {
    const output = await page.evaluate(async () => {
      const info = (await window.client.call('devframes:plugin:terminals:spawn', {presetId: 'echo'})) as {id: string}
      let text = ''
      for await (const chunk of window.client.streaming.subscribe<string>(
        'devframes:plugin:terminals:output',
        info.id,
      )) {
        text += chunk
        if (text.includes('hello-from-pty')) break
      }
      return text
    })
    expect(output).toContain('hello-from-pty')
  })

  it('deep-links into a session through dock activation', async () => {
    const activation = await page.evaluate(async () => {
      const state = await window.client.sharedState.get('devframe:docks:active')
      await window.concivCall(window.client)('hub:docks:activate', {
        dockId: 'conciv',
        params: {sessionId: 'conciv_deep'},
      })
      await new Promise((resolve) => setTimeout(resolve, 100))
      return state.value()
    })
    expect(activation).toMatchObject({activation: {dockId: 'conciv', params: {sessionId: 'conciv_deep'}}})
  })

  it('persists a typed project setting', async () => {
    const scheme = await page.evaluate(async () => {
      const settings = window.client.scope('conciv').settings
      await settings.project.set('scheme', 'dark')
      return settings.project.get('scheme')
    })
    expect(scheme).toBe('dark')
  })

  it('publishes a JSON-render view as shared state', async () => {
    const spec = await page.evaluate(async () => {
      const index = (await window.client.sharedState.get('devframe:json-render:index')).value()
      const entries = Object.values(index as Record<string, {key?: string; stateKey?: string}>).flat()
      const entry = JSON.stringify(index)
      const key = entry.match(/devframe:json-render:[^"]*status/)?.[0]
      if (!key) return {index: entries}
      return (await window.client.sharedState.get(key)).value()
    })
    expect(JSON.stringify(spec)).toContain('conciv status')
  })

  it('serves shiki, git and open-in-editor as wire services', async () => {
    const outcome = await page.evaluate(async () => {
      const highlighted = (await window.client.call('devframes:service:shiki:highlight', {
        code: 'const a = 1',
        lang: 'ts',
      })) as {html: string}
      const status = await window.client.call('devframes:service:git:status').then(
        (value: unknown) => ({ok: true, value}),
        (error: unknown) => ({ok: false, error: String(error)}),
      )
      const outside = await window.client.call('devframes:service:open:open-in-editor', {path: '/etc/hosts'}).then(
        () => 'opened',
        (error: unknown) => String(error),
      )
      return {html: highlighted.html.slice(0, 60), status, outside}
    })
    console.log('SERVICES', JSON.stringify(outcome))
    expect(outcome.html).toContain('<pre')
    expect(outcome.outside).not.toBe('opened')
  })

  it('exposes a page-script tool to the server MCP through the browser agent bridge', async () => {
    await page.evaluate(() => {
      window.createPageScriptChannel({
        name: 'conciv:page',
        functions: {
          title: {type: 'query', agent: {description: 'Read the host page title.'}, handler: () => document.title},
        },
      })
    })
    const mcp = async (method: string, params: object): Promise<string> => {
      const response = await fetch(`${base()}__mcp`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          authorization: `Bearer ${MCP_TOKEN}`,
        },
        body: JSON.stringify({jsonrpc: '2.0', id: 1, method, params}),
      })
      return response.text()
    }
    await new Promise((resolve) => setTimeout(resolve, 300))
    const listed = await mcp('tools/list', {})
    const name = listed.match(/"name":"([^"]*title[^"]*)"/)?.[1]
    console.log('PAGE TOOL', name)
    expect(name).toBeDefined()
    const called = await mcp('tools/call', {name, arguments: {}})
    expect(called).toContain('host')
  })

  it('connects a panel iframe to the page script without the server', async () => {
    await page.evaluate(() => {
      window.createPageScriptChannel({
        name: 'conciv:panel',
        functions: {measure: {type: 'query', handler: () => window.innerWidth}},
      })
      const frame = document.createElement('iframe')
      frame.src = '/panel.html'
      document.body.append(frame)
    })
    const frame = await (await page.waitForSelector('iframe')).contentFrame()
    if (!frame) throw new Error('panel frame did not load')
    await frame.waitForFunction(() => 'connectPanelChannel' in window)
    const width = await frame.evaluate(async () => {
      const channel = window.connectPanelChannel({name: 'conciv:panel', functions: {}})
      return channel.call('measure')
    })
    expect(width).toBeGreaterThan(0)
  })

  it('runs the a11y scanner on the host page and reports into the messages feed', async () => {
    const found = await page.evaluate(async () => {
      const a11y = await window.loadA11y()
      a11y.default({
        messages: {
          add: (input) => window.concivCall(window.client)('hub:messages:add', input),
          remove: (id) => window.concivCall(window.client)('hub:messages:remove', id),
        },
      })
      for (let attempt = 0; attempt < 50; attempt++) {
        const feed = (await window.client.call('devframes:plugin:messages:list')) as {
          entries: {category?: string; message: string}[]
        }
        const a11y = feed.entries.filter((entry) => entry.category === 'a11y')
        if (a11y.length > 1) return a11y.map((entry) => entry.message)
        await new Promise((resolve) => setTimeout(resolve, 200))
      }
      return []
    })
    console.log('A11Y', JSON.stringify(found).slice(0, 300))
    expect(found.length).toBeGreaterThan(1)
  })

  it('registers browser-side agent functions as WebMCP tools', async () => {
    const tab = await context.newPage()
    await tab.addInitScript(() => {
      const tools: {name: string; execute: (args: Record<string, unknown>) => Promise<{content: {text: string}[]}>}[] =
        []
      Object.assign(navigator, {modelContext: {registerTool: (tool: (typeof tools)[number]) => void tools.push(tool)}})
      Object.assign(window, {webMcpTools: tools})
    })
    await tab.goto(host.url, {waitUntil: 'domcontentloaded'})
    await tab.waitForFunction(() => 'getDevframeRpcClient' in window)
    const outcome = await tab.evaluate(async (baseURL) => {
      const client = await window.getDevframeRpcClient({baseURL, rpcOptions: window.concivRpcOptions()})
      client.client.register({
        name: 'conciv:page:selection',
        type: 'query',
        agent: {description: 'Read the text the user selected on the page.'},
        handler: () => 'selected text',
      })
      await new Promise((resolve) => setTimeout(resolve, 100))
      const tools = (
        window as unknown as {
          webMcpTools: {name: string; execute: (args: object) => Promise<{content: {text: string}[]}>}[]
        }
      ).webMcpTools
      const tool = tools.find((candidate) => candidate.name.includes('selection'))
      const result = tool ? await tool.execute({}) : null
      return {names: tools.map((candidate) => candidate.name), text: result?.content[0]?.text}
    }, base())
    console.log('WEBMCP', JSON.stringify(outcome))
    await tab.close()
    expect(outcome.text).toContain('selected text')
  })

  it('recovers a tab when the engine restarts under it, through a small reconnect wrapper', async () => {
    await page.evaluate(async (baseURL) => {
      window.client.close?.()
      await window.reconnectingClient(baseURL, (client) => Object.assign(window, {client}))
    }, base())
    await new Promise((resolve) => setTimeout(resolve, 300))
    await engine.stop()
    engine = await boot()
    const outcome = await page.evaluate(async () => {
      for (let attempt = 0; attempt < 40; attempt++) {
        try {
          if (await window.client.ensureTrusted(250))
            return {recovered: true, sessions: ((await window.client.call('conciv:sessions:list')) as unknown[]).length}
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 150))
        }
      }
      return {recovered: false}
    })
    console.log('RECONNECT', JSON.stringify(outcome))
    expect(outcome).toEqual({recovered: true, sessions: 1})
  })

  it('remembers the tab across an engine restart', async () => {
    await page.close()
    await new Promise((resolve) => setTimeout(resolve, 300))
    await engine.stop()
    engine = await boot()
    page = await openTab(context, host.url, base())
    console.log(
      'RESTART STATE',
      JSON.stringify(
        await page.evaluate(async () => ({
          trusted: window.client.isTrusted,
          token: window.client.connection.authToken,
          stored: Object.keys(localStorage),
          requestTrust: await window.client.requestTrust(),
        })),
      ),
    )
    expect(await page.evaluate(() => window.client.ensureTrusted(5_000))).toBe(true)
    expect(await page.evaluate(() => window.client.call('conciv:sessions:list'))).toHaveLength(1)
  })
})

const MetaSchema = z.object({
  websocket: z.union([z.string(), z.object({path: z.string().optional()})]).optional(),
  sse: z.object({path: z.string()}).optional(),
})

describe('devframe rpc questions', () => {
  const questionsRoot = mkdtempSync(join(tmpdir(), 'conciv-devframe-questions-'))
  let engine: Engine
  let browser: Browser
  let host: {server: Server; url: string}
  let page: Page

  const origin = (): string => `http://127.0.0.1:${engine.port}`
  const base = (): string => `${origin()}/__conciv/`

  async function trustedTab(): Promise<Page> {
    const tab = await browser.newPage()
    await tab.goto(host.url, {waitUntil: 'domcontentloaded'})
    await tab.waitForFunction(() => 'getDevframeRpcClient' in window)
    await tab.evaluate(async (baseURL) => {
      const client = await window.getDevframeRpcClient({baseURL, rpcOptions: window.concivRpcOptions()})
      Object.assign(window, {client})
      await client.requestAuthCode()
    }, base())
    expect(await tab.evaluate((otp) => window.client.requestTrustWithCode(otp), getTempAuthCode())).toBe(true)
    return tab
  }

  async function nodeClient(transport: 'websocket' | 'sse', authToken?: string) {
    const metaUrl = `${base()}__connection.json`
    const meta = MetaSchema.parse(await (await fetch(metaUrl)).json())
    const channel =
      transport === 'websocket'
        ? createWsRpcChannel({url: resolveWsUrl(meta.websocket, metaUrl, new URL(base())), authToken})
        : createSseRpcChannel({url: new URL(meta.sse?.path ?? '__sse', base()).href, authToken})
    const rpc = createRpcClient<ConcivServerFunctions, object>({}, {channel})
    return {rpc, close: channel.close}
  }

  beforeAll(async () => {
    engine = await boot(questionsRoot)
    host = await hostPage()
    browser = await chromium.launch({headless: true})
    page = await trustedTab()
  }, 60_000)

  afterAll(async () => {
    await browser.close()
    host.server.close()
    await engine.stop()
  })

  describe('1. node client', () => {
    it('cannot run the high-level browser client in node', async () => {
      const outcome = await getDevframeRpcClient({baseURL: base()}).then(
        () => 'connected',
        (error: unknown) => String(error),
      )
      expect(outcome).toBe('ReferenceError: location is not defined')
    })

    it('refuses an untrusted node websocket, then serves one holding the engine bearer', async () => {
      const anonymous = await nodeClient('websocket')
      const refused = await anonymous.rpc.$call('conciv:sessions:list').then(
        () => 'served',
        (error: unknown) => String(error),
      )
      anonymous.close()
      expect(refused).not.toBe('served')
      const trusted = await nodeClient('websocket', MCP_TOKEN)
      expect(await trusted.rpc.$call('conciv:sessions:list')).toEqual([])
      expect(await trusted.rpc.$call('hub:docks:activate', {dockId: 'conciv'})).toBeUndefined()
      trusted.close()
    })

    it('serves a node client over the fetch-based SSE transport with the same bearer', async () => {
      const sse = await nodeClient('sse', MCP_TOKEN)
      expect(await sse.rpc.$call('conciv:sessions:list')).toEqual([])
      const anonymous = await nodeClient('sse')
      const refused = await anonymous.rpc.$call('conciv:sessions:list').then(
        () => 'served',
        (error: unknown) => String(error),
      )
      expect(refused).not.toBe('served')
      sse.close()
      anonymous.close()
    })
  })

  describe('2. errors', () => {
    it('drops code and data from a thrown error on the wire, keeping only the message', async () => {
      const outcome = await page.evaluate(async () => {
        const describeError = (error: unknown) => ({
          text: String(error),
          name: error instanceof Error ? error.name : typeof error,
          code: error instanceof Error && 'code' in error ? error.code : undefined,
          data: error instanceof Error && 'data' in error ? error.data : undefined,
        })
        const variants: Array<'coded' | 'diagnostic'> = ['coded', 'diagnostic']
        const raw = await Promise.all(
          variants.map((variant) => window.client.call('conciv:errors:raw', variant).then(() => null, describeError)),
        )
        const wrapped = await Promise.all(
          variants.map((variant) =>
            window
              .concivCall(window.client)('conciv:errors:wrapped', variant)
              .then(() => null, describeError),
          ),
        )
        return {raw, wrapped}
      })
      console.log('ERRORS', JSON.stringify(outcome))
      expect(outcome.raw).toEqual([
        {text: 'Error: probe failure', name: 'Error', code: undefined, data: undefined},
        {text: 'Error: session conciv_probe not found', name: 'Error', code: undefined, data: undefined},
      ])
      expect(outcome.wrapped).toEqual([
        {
          text: 'ConcivError: probe failure',
          name: 'ConcivError',
          code: 'CONCIV_PROBE',
          data: {attempt: 3, ids: ['a', 'b']},
        },
        {
          text: 'ConcivError: session conciv_probe not found',
          name: 'ConcivError',
          code: 'CONCIV_NOT_FOUND',
          data: null,
        },
      ])
    })

    it('carries the wrapped error to a node client too', async () => {
      const client = await nodeClient('websocket', MCP_TOKEN)
      const error = await client.rpc.$call('conciv:errors:wrapped', 'coded').then(() => null, fromWireError)
      client.close()
      expect(error).toMatchObject({code: 'CONCIV_PROBE', data: {attempt: 3, ids: ['a', 'b']}})
    })
  })

  describe('3. defineConcivFunction', () => {
    it('applies zod defaults and transforms before the handler runs', async () => {
      const rpc = makeRpcClient(origin())
      const {sessionId} = await rpc.sessions.create()
      const outcome = await page.evaluate(async (id) => {
        const call = window.concivCall(window.client)
        const ticks = await call('conciv:ticks:start', {count: 1})
        const renamed = await call('conciv:sessions:rename', {sessionId: id, title: '  padded  '})
        return {held: ticks.held, title: renamed.title}
      }, sessionId)
      expect(outcome).toEqual({held: false, title: 'padded'})
    })

    it('rejects input that fails the schema before the handler runs', async () => {
      const outcome = await page.evaluate(() =>
        window
          .concivCall(window.client)('conciv:ticks:start', {count: 0})
          .then(
            () => 'served',
            (error: unknown) => String(error),
          ),
      )
      expect(outcome).toBe(
        'Error: RPC function "conciv:ticks:start" received an invalid argument at position 0: count: Too small: expected number to be >=1',
      )
    })
  })

  describe('5. iframe login on another origin', () => {
    it('hands the tab login to a cross-origin plugin iframe through the remote connection URL', async () => {
      const frameUrl = `${host.url.replace('127.0.0.1', 'localhost')}panel.html`
      const loaded = page.waitForEvent('framenavigated', (frame) => frame.url().startsWith('http://localhost'))
      await page.evaluate((url) => {
        const frame = document.createElement('iframe')
        frame.src = window.buildRemoteDevframeUrl(url, window.client.connection)
        document.body.append(frame)
      }, frameUrl)
      const frame = await loaded
      await frame.waitForFunction(() => 'connectRemoteDevframe' in window)
      const outcome = await frame.evaluate(async () => {
        const storedBefore = Object.keys(localStorage).length
        const client = await window.connectRemoteDevframe()
        const trusted = await client.ensureTrusted(3_000)
        const sessions = trusted ? await client.call('conciv:sessions:list') : null
        return {origin: location.origin, storedBefore, trusted, sessions: Array.isArray(sessions)}
      })
      expect(outcome).toEqual({
        origin: expect.stringMatching(/^http:\/\/localhost:/),
        storedBefore: 0,
        trusted: true,
        sessions: true,
      })
    })
  })

  describe('6. speed against oRPC on the same engine', () => {
    it('times 200 sequential small calls and a 1 MB draft round trip', async () => {
      const rpc = makeRpcClient(origin())
      const devframe = await nodeClient('websocket', MCP_TOKEN)
      const {sessionId} = await rpc.sessions.create()
      const text = 'x'.repeat(1_000_000)
      const draft = {sessionId, text, selectionStart: 0, selectionEnd: 0, attachments: []}
      await devframe.rpc.$call('conciv:sessions:list')
      await rpc.sessions.list()
      const time = async (run: () => Promise<unknown>): Promise<number> => {
        const started = performance.now()
        await run()
        return Math.round(performance.now() - started)
      }
      const sequential = async (call: () => Promise<unknown>): Promise<void> => {
        for (let index = 0; index < 200; index++) await call()
      }
      const timings = {
        devframeSmall: await time(() => sequential(() => devframe.rpc.$call('conciv:sessions:list'))),
        orpcSmall: await time(() => sequential(() => rpc.sessions.list())),
        devframeMegabyte: await time(async () => {
          await devframe.rpc.$call('conciv:drafts:set', draft)
          expect((await devframe.rpc.$call('conciv:drafts:get', {sessionId}))?.text.length).toBe(1_000_000)
        }),
        orpcMegabyte: await time(async () => {
          await rpc.drafts.set(draft)
          expect((await rpc.drafts.get({sessionId}))?.text.length).toBe(1_000_000)
        }),
      }
      devframe.close()
      console.log('TIMINGS ms', JSON.stringify(timings))
      expect(Object.values(timings).every((ms) => ms > 0)).toBe(true)
    })
  })

  describe('4. engine restart', () => {
    it('reports what a live client keeps across an engine restart', async () => {
      await new Promise((resolve) => setTimeout(resolve, 300))
      await page.evaluate(async () => {
        const call = window.concivCall(window.client)
        window.client.client.register({
          name: 'conciv:page:query',
          type: 'query',
          handler: () => new Promise<string>(() => {}),
        })
        await call('conciv:page:register', {sessionId: 'conciv_hang'})
        const {streamId} = await call('conciv:ticks:start', {count: 3, hold: true})
        const ticks: number[] = []
        const statuses: string[] = []
        const sessionCounts: number[] = []
        window.client.events.on('connection:status', (status) => statuses.push(status))
        const state = await window.client.sharedState.get('conciv:sessions')
        state.on('updated', (next: {sessions: unknown[]}) => sessionCounts.push(next.sessions.length))
        const reader = window.client.streaming.subscribe<number>('conciv:ticks', streamId)
        const stream = (async () => {
          try {
            for await (const tick of reader) ticks.push(tick)
            return 'ended'
          } catch (error) {
            return `errored: ${String(error)}`
          }
        })()
        const pending = call('conciv:page:ask', {sessionId: 'conciv_hang', question: 'q'}).then(
          () => 'resolved',
          (error: unknown) => `rejected: ${String(error)}`,
        )
        Object.assign(window, {restartProbe: {pending, stream, streamId, ticks, statuses, sessionCounts}})
      })
      await page.waitForFunction(() => window.restartProbe.ticks.length === 3)
      await engine.stop()
      engine = await boot(questionsRoot)
      const stale = await page.evaluate(async () => {
        const probe = window.restartProbe
        const settleIn = <T>(promise: Promise<T>) =>
          Promise.race([promise, new Promise<string>((resolve) => setTimeout(() => resolve('still pending'), 1_500))])
        return {
          pending: await settleIn(probe.pending),
          stream: await settleIn(probe.stream),
          ticks: probe.ticks,
          statuses: probe.statuses,
          status: window.client.status,
          sessionCountsAfterRestart: probe.sessionCounts,
        }
      })
      console.log('RESTART OLD CLIENT', JSON.stringify(stale))
      const fresh = await page.evaluate(async (baseURL) => {
        const client = await window.getDevframeRpcClient({baseURL, rpcOptions: window.concivRpcOptions()})
        const trusted = await client.ensureTrusted(3_000)
        const replay: number[] = []
        const reader = client.streaming.subscribe<number>('conciv:ticks', window.restartProbe.streamId)
        const drained = (async () => {
          for await (const tick of reader) replay.push(tick)
          return 'ended'
        })()
        const replayOutcome = await Promise.race([
          drained,
          new Promise<string>((resolve) => setTimeout(() => resolve('still pending'), 1_000)),
        ])
        const sessions = (await client.sharedState.get('conciv:sessions')).value().sessions
        return {trusted, replay, replayOutcome, sessions: sessions.length}
      }, base())
      console.log('RESTART NEW CLIENT', JSON.stringify(fresh))
      expect(stale.status).not.toBe('connected')
      expect(fresh.trusted).toBe(true)
    })

    it('loses a trust granted less than 100ms before the engine stops', async () => {
      const tab = await trustedTab()
      await engine.stop()
      engine = await boot(questionsRoot)
      const trusted = await tab.evaluate(async (baseURL) => {
        const client = await window.getDevframeRpcClient({baseURL, rpcOptions: window.concivRpcOptions()})
        return client.ensureTrusted(1_500).then(String, String)
      }, base())
      await tab.close()
      console.log('FAST RESTART TRUST', trusted)
      expect(trusted).toBe('Error: [devframe] Timeout waiting for rpc to be trusted')
    })
  })
})

declare module 'devframe' {
  interface DevframeRpcServerFunctions {
    'spikeplain:echo': (input: PlainInput) => Promise<PlainOutput>
  }
}

const ROUTE_TOKEN = 'spike-route-token'
const ROUTE_PORT = 3571
const ASK_ID = 'conciv:tool:spike_ask'

const PlainInputSchema = z.object({text: z.string(), sessionId: z.string()})
const PlainOutputSchema = PlainInputSchema.extend({rpcSession: z.boolean(), routeSession: z.string().nullable()})
type PlainInput = z.infer<typeof PlainInputSchema>
type PlainOutput = z.infer<typeof PlainOutputSchema>
const WhereSchema = z.object({session: z.string()})
const ScriptReplySchema = z.object({result: z.unknown()}).loose()
const TextBlockSchema = z.object({type: z.literal('text'), text: z.string()})
const ToolReplySchema = z.object({
  content: z.array(z.object({type: z.string()}).loose()),
  isError: z.boolean().optional(),
})
const ResultFrameSchema = z.object({result: z.object({tools: z.array(z.object({name: z.string()}))})})

function replyText(reply: unknown): string {
  return ToolReplySchema.parse(reply)
    .content.flatMap((block) => {
      const text = TextBlockSchema.safeParse(block)
      return text.success ? [text.data.text] : []
    })
    .join('\n')
}

function scriptResult(reply: unknown): unknown {
  return ScriptReplySchema.parse(JSON.parse(replyText(reply))).result
}

async function chunksUntilResult(events: AsyncIterable<ChatEvent>): Promise<ChatEvent[]> {
  const chunks: ChatEvent[] = []
  for await (const chunk of events) {
    chunks.push(chunk)
    if (chunk.type === ChatEventType.TOOL_CALL_RESULT) return chunks
  }
  return chunks
}

async function hubProbe(mcp: Parameters<typeof initHub>[0]['mcp']) {
  const hub = initHub({
    base: '/__probe/',
    auth: false,
    ws: false,
    mcp,
    configure(ctx) {
      ctx.agent.registerTool({
        id: 'probe',
        description: 'Report what a handler can see.',
        inputSchema: {type: 'object', properties: {sessionId: {type: 'string'}}},
        handler: (...received: unknown[]) => ({received}),
      })
    },
  })
  await hub.ready
  const post = (path: string, headers: Record<string, string>, args: Record<string, unknown> = {}) =>
    hub.handler(
      new Request(`http://127.0.0.1${path}`, {
        method: 'POST',
        headers: {'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers},
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {name: 'probe', arguments: args},
        }),
      }),
    )
  return {hub, post}
}

describe('devframe agent route', () => {
  const routeRoot = mkdtempSync(join(tmpdir(), 'conciv-devframe-route-'))
  const toolRuns = {ask: 0}
  let engine: Engine
  const origin = `http://127.0.0.1:${ROUTE_PORT}`
  const rpc = makeRpcClient(origin)
  const sessionRpc = (sessionId: string) => makeRpcClient(origin, {headers: {[CONCIV_SESSION_HEADER]: sessionId}})
  const routes = [
    {route: 'hub route', path: '/__conciv/__mcp'},
    {route: 'their handler on our path', path: '/api/devframe-mcp'},
  ]

  const where = defineTool({
    name: 'spike_where',
    description: 'Report the session this tool runs in.',
    inputSchema: z.object({}),
    outputSchema: WhereSchema,
    meta: {summary: 'report the session', category: 'fixture', mutating: false},
  }).server(async (_input, _context, request) => {
    await wait(15)
    return {session: request.sessionId}
  })

  const plain = defineTool({
    name: 'spike_plain',
    description: 'Call a plain devframe function.',
    inputSchema: z.object({text: z.string()}),
    outputSchema: PlainOutputSchema,
    meta: {summary: 'call a plain function', category: 'fixture', mutating: false},
  }).server(async (input, _context, request) =>
    (await engine.devframe.context).rpc.invokeLocal('spikeplain:echo', {...input, sessionId: request.sessionId}),
  )

  const ask = defineTool({
    name: 'spike_ask',
    description: 'A risky fixture action.',
    inputSchema: z.object({target: z.string()}),
    outputSchema: z.object({done: z.string()}),
    approval: 'ask',
    meta: {summary: 'a risky fixture action', category: 'fixture', mutating: false},
  }).server((input) => {
    toolRuns.ask += 1
    return {done: input.target}
  })

  const fail = defineTool({
    name: 'spike_fail',
    description: 'Fail with a declared error.',
    inputSchema: z.object({}),
    outputSchema: z.object({}),
    errors: {PROBE_BROKE: {message: 'the probe broke'}},
    meta: {summary: 'fail with a declared error', category: 'fixture', mutating: false},
  }).server(() => {
    throw toolError('PROBE_BROKE', {message: 'the probe broke'})
  })

  const image = defineTool({
    name: 'spike_image',
    description: 'Return an image.',
    inputSchema: z.object({}),
    outputSchema: z.unknown(),
    meta: {summary: 'return an image', category: 'fixture', mutating: false},
  }).server(() => imageResult('image/png', 'iVBORw0KGgo=', {width: 1}))

  const plainPlugin = defineDevframe({
    id: 'spikeplain',
    name: 'spikeplain',
    version: '0.0.0',
    packageName: 'spikeplain',
    homepage: 'https://conciv.dev',
    description: 'plain function fixture',
    importMetaUrl: import.meta.url,
    setup(ctx) {
      ctx.rpc.register(
        defineRpcFunction({
          name: 'spikeplain:echo',
          type: 'query',
          jsonSerializable: true,
          args: [PlainInputSchema],
          returns: PlainOutputSchema,
          setup: (context) => ({
            handler: (input) => ({
              ...input,
              rpcSession: context.rpc.getCurrentRpcSession() !== undefined,
              routeSession: currentRouteSessionId(),
            }),
          }),
        }),
      )
    },
  })

  const thirdParty = defineDevframe({
    id: 'spikeother',
    name: 'spikeother',
    version: '0.0.0',
    packageName: 'spikeother',
    homepage: 'https://conciv.dev',
    description: 'a plugin that marks its own function',
    importMetaUrl: import.meta.url,
    setup(ctx) {
      ctx.rpc.register(
        defineRpcFunction({
          name: 'spikeother:delete_everything',
          type: 'action',
          jsonSerializable: true,
          agent: {description: 'A marked plugin function no conciv gate sees.'},
          handler: () => ({ran: true}),
        }),
      )
    },
  })

  async function connect(path: string, sessionId?: string, token: string = ROUTE_TOKEN) {
    const client = new Client({name: 'conciv-spike', version: '0.0.0'})
    const headers = {
      authorization: `Bearer ${token}`,
      ...(sessionId === undefined ? {} : {[CONCIV_SESSION_HEADER]: sessionId}),
    }
    await client.connect(new StreamableHTTPClientTransport(new URL(`${origin}${path}`), {requestInit: {headers}}))
    return client
  }

  async function newSession(): Promise<string> {
    return (await rpc.sessions.create()).sessionId
  }

  beforeAll(async () => {
    engine = await start({
      options: {stateRoot: routeRoot},
      root: routeRoot,
      launchEditor: () => {},
      harness: createFakeHarness({id: 'fake-agent-route'}),
      mcpToken: ROUTE_TOKEN,
      agentRoute: true,
      port: {exact: ROUTE_PORT},
      extensions: [defineExtension({name: 'Spike Route', tools: [where, plain, ask, fail, image]})],
      devframes: [plainPlugin, thirdParty],
    })
  }, 60_000)

  afterAll(async () => {
    await engine.stop()
  })

  describe('1. session', () => {
    it('gives a handler only its arguments, never the request headers', async () => {
      const {hub, post} = await hubProbe({authorization: 't', allowedOrigins: false, exposeSharedState: false})
      const response = await post('/__probe/__mcp', {
        authorization: 'Bearer t',
        [CONCIV_SESSION_HEADER]: 'conciv_header',
      })
      const body = await response.text()
      expect(body).toContain('\\"received\\": [\\n    {}\\n  ]')
      expect(body).not.toContain('conciv_header')
      await hub.close()
    })

    it('reaches the route with a session in the query, but no handler can read it', async () => {
      const {hub, post} = await hubProbe({authorization: 't', allowedOrigins: false, exposeSharedState: false})
      const body = await (await post('/__probe/__mcp?session=conciv_query', {authorization: 'Bearer t'})).text()
      expect(body).toContain('\\"received\\": [\\n    {}\\n  ]')
      expect(body).not.toContain('conciv_query')
      await hub.close()
    })

    it('delivers a session in a tool argument, chosen by the caller and unchecked', async () => {
      const {hub, post} = await hubProbe({authorization: 't', allowedOrigins: false, exposeSharedState: false})
      const body = await (
        await post('/__probe/__mcp', {authorization: 'Bearer t'}, {sessionId: 'conciv_forged'})
      ).text()
      expect(body).toContain('conciv_forged')
      await hub.close()
    })

    describe.each(routes)('wrapper on the $route', ({path}) => {
      it('carries the header to the handler through async context', async () => {
        const sessionId = await newSession()
        const client = await connect(path, sessionId)
        const reply = await client.callTool({
          name: 'execute_typescript',
          arguments: {typescriptCode: 'return await external_spike_where({})'},
        })
        expect(scriptResult(reply)).toEqual({session: sessionId})
        await client.close()
      })

      it('keeps two sessions apart under concurrent calls', async () => {
        const sessions = [await newSession(), await newSession()]
        const clients = await Promise.all(sessions.map((sessionId) => connect(path, sessionId)))
        const calls = Array.from({length: 24}, (_, index) => index % 2).map(async (slot) => {
          const client = clients[slot]
          if (client === undefined) throw new Error('no client')
          const reply = await client.callTool({
            name: 'execute_typescript',
            arguments: {typescriptCode: 'return await external_spike_where({})'},
          })
          return {expected: sessions[slot], seen: WhereSchema.parse(scriptResult(reply)).session}
        })
        const results = await Promise.all(calls)
        expect(results.filter((entry) => entry.expected !== entry.seen)).toEqual([])
        await Promise.all(clients.map((client) => client.close()))
      })
    })

    it('resolves the session in the wrapper only after the token matched', async () => {
      const before = (await rpc.sessions.list()).length
      const denied = await fetch(`${origin}/__conciv/__mcp`, {
        method: 'POST',
        headers: {'content-type': 'application/json', accept: 'application/json, text/event-stream'},
        body: JSON.stringify({jsonrpc: '2.0', id: 1, method: 'tools/list', params: {}}),
      })
      expect(denied.status).toBe(401)
      expect((await rpc.sessions.list()).length).toBe(before)
    })
  })

  describe('2. listing', () => {
    const intended = [
      'discover_tools',
      'execute_typescript',
      'page_eval',
      'server_reload',
      'server_restart',
      'spike_ask',
    ]

    it('lists a marked plugin function next to ours on the hub route, and it runs past every gate', async () => {
      const client = await connect('/__conciv/__mcp', await newSession())
      const names = (await client.listTools()).tools.map((tool) => tool.name)
      expect(names).toEqual(
        expect.arrayContaining([
          ...intended,
          'spikeother_delete_everything',
          'devframes_plugin_terminals_spawn',
          'devframes_plugin_messages_list',
        ]),
      )
      const reply = await client.callTool({name: 'spikeother_delete_everything', arguments: {}})
      expect(replyText(reply)).toContain('ran')
      const spawned = await client.callTool({
        name: 'devframes_plugin_terminals_spawn',
        arguments: {arg0: {presetId: 'echo'}},
      })
      expect(spawned.isError).toBeFalsy()
      expect(replyText(spawned)).toContain('/bin/echo')
      await client.close()
    })

    it('lists exactly the intended tools on their handler over a private context', async () => {
      const client = await connect('/api/devframe-mcp', await newSession())
      const {tools} = await client.listTools()
      expect(tools.map((tool) => tool.name).toSorted()).toEqual(intended)
      expect(tools.find((tool) => tool.name === 'spike_ask')?.inputSchema.properties).toHaveProperty('target')
      const hidden = await client.callTool({name: 'spikeplain_echo', arguments: {}})
      expect(hidden.isError).toBe(true)
      const denied = await client.callTool({name: 'spikeother_delete_everything', arguments: {}})
      expect(denied.isError).toBe(true)
      await client.close()
    })

    it('matches the tool names and input fields of /api/mcp', async () => {
      const sessionId = await newSession()
      const ours = new Client({name: 'conciv-spike', version: '0.0.0'})
      await ours.connect(
        new StreamableHTTPClientTransport(new URL(`${origin}/api/mcp`), {
          requestInit: {headers: {[CONCIV_SESSION_HEADER]: sessionId}},
        }),
      )
      const theirs = await connect('/api/devframe-mcp', sessionId)
      const shape = async (client: Client) =>
        (await client.listTools()).tools
          .map((tool) => ({name: tool.name, fields: Object.keys(tool.inputSchema.properties ?? {})}))
          .toSorted((left, right) => left.name.localeCompare(right.name))
      expect(await shape(theirs)).toEqual(await shape(ours))
      await theirs.close()
      await ours.close()
    })

    it('freezes instructions on the hub route, and serves per-session ones through their handler', async () => {
      const sessionId = await newSession()
      const ours = new Client({name: 'conciv-spike', version: '0.0.0'})
      await ours.connect(
        new StreamableHTTPClientTransport(new URL(`${origin}/api/mcp`), {
          requestInit: {headers: {[CONCIV_SESSION_HEADER]: sessionId}},
        }),
      )
      const hub = await connect('/__conciv/__mcp', sessionId)
      const handler = await connect('/api/devframe-mcp', sessionId)
      expect(ours.getInstructions()).toContain('spike_where')
      expect(hub.getInstructions()).toBeUndefined()
      expect(handler.getInstructions()).toBe(ours.getInstructions())
      await Promise.all([ours.close(), hub.close(), handler.close()])
    })
  })

  describe('3. token', () => {
    it.each(routes)('refuses no and wrong tokens, accepts the right one, on the $route', async ({path}) => {
      const post = (headers: Record<string, string>) =>
        fetch(`${origin}${path}`, {
          method: 'POST',
          headers: {'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers},
          body: JSON.stringify({jsonrpc: '2.0', id: 1, method: 'tools/list', params: {}}),
        })
      const missing = await post({})
      expect(missing.status).toBe(401)
      expect(missing.headers.get('www-authenticate')).toBe('Bearer')
      expect((await post({authorization: 'Bearer wrong'})).status).toBe(401)
      const allowed = await post({
        authorization: `Bearer ${ROUTE_TOKEN}`,
        [CONCIV_SESSION_HEADER]: await newSession(),
      })
      expect(allowed.status).toBe(200)
    })

    it('keeps the Host guard, which the engine middleware applies in front of every route', async () => {
      const status = (path: string) =>
        new Promise<number | undefined>((resolve, reject) => {
          const outgoing = httpRequest(
            {
              host: '127.0.0.1',
              port: ROUTE_PORT,
              path,
              method: 'POST',
              headers: {
                host: 'evil.example',
                'content-type': 'application/json',
                accept: 'application/json, text/event-stream',
                authorization: `Bearer ${ROUTE_TOKEN}`,
              },
            },
            (response) => {
              response.resume()
              resolve(response.statusCode)
            },
          )
          outgoing.on('error', reject)
          outgoing.end(JSON.stringify({jsonrpc: '2.0', id: 1, method: 'tools/list', params: {}}))
        })
      expect(await status('/api/mcp')).toBe(403)
      expect(await status('/__conciv/__mcp')).toBe(403)
      expect(await status('/api/devframe-mcp')).toBe(403)
    })

    it('rejects an Origin-less caller unless allowedOrigins is false', async () => {
      const gated = await hubProbe({authorization: 't', exposeSharedState: false})
      expect((await gated.post('/__probe/__mcp', {authorization: 'Bearer t'})).status).toBe(403)
      await gated.hub.close()
      const open = await hubProbe({authorization: 't', allowedOrigins: false, exposeSharedState: false})
      expect((await open.post('/__probe/__mcp', {authorization: 'Bearer t'})).status).toBe(200)
      await open.hub.close()
    })

    it('stays open to anyone when allowedOrigins is false and no authorization is set', async () => {
      const {hub, post} = await hubProbe({allowedOrigins: false, exposeSharedState: false})
      expect((await post('/__probe/__mcp', {origin: 'https://evil.example'})).status).toBe(200)
      await hub.close()
    })
  })

  describe.each(routes)('on the $route', ({path}) => {
    it('4. runs a script that calls a plain devframe function', async () => {
      const sessionId = await newSession()
      const client = await connect(path, sessionId)
      const reply = await client.callTool({
        name: 'execute_typescript',
        arguments: {typescriptCode: 'console.log("noted"); return await external_spike_plain({text: "hi"})'},
      })
      expect(scriptResult(reply)).toEqual({text: 'hi', sessionId, rpcSession: false, routeSession: null})
      expect(replyText(reply)).toContain('noted')
      await client.close()
    })

    it('4. caps an oversized result from a plain devframe function', async () => {
      const client = await connect(path, await newSession())
      const reply = await client.callTool({
        name: 'execute_typescript',
        arguments: {typescriptCode: 'return await external_spike_plain({text: "x".repeat(120000)})'},
      })
      const text = replyText(reply)
      expect(text).toContain('conciv:truncated')
      expect(text.length).toBeLessThan(60_000)
      await client.close()
    })

    it('4. surfaces a declared error, with the route adding its prefix', async () => {
      const client = await connect(path, await newSession())
      const reply = await client.callTool({
        name: 'execute_typescript',
        arguments: {typescriptCode: 'return await external_spike_fail({})'},
      })
      expect(reply.isError).toBe(true)
      expect(replyText(reply)).toContain('Error invoking "execute_typescript": Error: {"error"')
      expect(replyText(reply)).toContain('"code":"PROBE_BROKE"')
      await client.close()
    })

    it('4. keeps image blocks from a script result', async () => {
      const client = await connect(path, await newSession())
      const reply = await client.callTool({
        name: 'execute_typescript',
        arguments: {typescriptCode: 'return await external_spike_image({})'},
      })
      expect(ToolReplySchema.parse(reply).content).toContainEqual({
        type: 'image',
        data: 'iVBORw0KGgo=',
        mimeType: 'image/png',
      })
      await client.close()
    })

    it('5. refuses an ask tool until approved, once, and stays refused when denied', async () => {
      const sessionId = await newSession()
      const client = await connect(path, sessionId)
      const call = () => client.callTool({name: 'spike_ask', arguments: {target: 'x'}})
      const ran = toolRuns.ask
      const refused = await call()
      expect(refused.isError).toBe(true)
      expect(replyText(refused)).toMatch(/needs the user/)
      const {pendingApprovals} = await rpc.chat.hydrate({sessionId})
      expect(pendingApprovals.map((pending) => pending.approvalId)).toEqual([ASK_ID])
      expect(toolRuns.ask).toBe(ran)
      await sessionRpc(sessionId).chat.permissionDecision({approvalId: ASK_ID, approved: false})
      expect((await call()).isError).toBe(true)
      expect(toolRuns.ask).toBe(ran)
      await sessionRpc(sessionId).chat.permissionDecision({approvalId: ASK_ID, approved: true})
      const admitted = await call()
      expect(admitted.isError).toBeFalsy()
      expect(replyText(admitted)).toContain('"done":"x"')
      expect(toolRuns.ask).toBe(ran + 1)
      expect((await call()).isError).toBe(true)
      await client.close()
    })

    it('5. rejects bad input before the gate', async () => {
      const client = await connect(path, await newSession())
      const reply = await client.callTool({name: 'spike_ask', arguments: {target: 3}})
      expect(reply.isError).toBe(true)
      await client.close()
    })

    it('6. mirrors a call into its chat session only', async () => {
      const [sessionId, bystander] = [await newSession(), await newSession()]
      const client = await connect(path, sessionId)
      const abort = new AbortController()
      const events = await rpc.chat.events({sessionId}, {signal: abort.signal})
      const quiet = await rpc.chat.events({sessionId: bystander}, {signal: abort.signal})
      const stray = quiet.next().then(
        () => 'event',
        () => 'closed',
      )
      const mirrored = chunksUntilResult(events)
      await client.callTool({name: 'execute_typescript', arguments: {typescriptCode: 'return 1'}})
      const chunks = await mirrored
      expect(chunks[0]).toMatchObject({type: 'TOOL_CALL_START', toolCallName: 'execute_typescript'})
      expect(chunks.at(-1)).toMatchObject({type: 'TOOL_CALL_RESULT'})
      expect(await Promise.race([stray, Promise.resolve('silent')])).toBe('silent')
      abort.abort()
      await client.close()
    })

    it('7. answers a raw bridge POST with no initialize and the native session header', async () => {
      const response = await fetch(`${origin}${path}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          authorization: `Bearer ${ROUTE_TOKEN}`,
          [CONCIV_CLAUDE_SESSION_HEADER]: '11111111-1111-4111-8111-111111111111',
        },
        body: JSON.stringify({jsonrpc: '2.0', id: 7, method: 'tools/list', params: {}}),
      })
      expect(response.status).toBe(200)
      const contentType = response.headers.get('content-type') ?? ''
      expect(contentType).toContain('text/event-stream')
      const body = await response.text()
      const json = contentType.includes('event-stream') ? (/^data: (.+)$/m.exec(body)?.[1] ?? '') : body
      const names = ResultFrameSchema.parse(JSON.parse(json)).result.tools.map((tool) => tool.name)
      expect(names).toContain('execute_typescript')
    })
  })
})
