/// <reference lib="dom" />
import {mkdtempSync} from 'node:fs'
import {createServer, type Server} from 'node:http'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {build} from 'esbuild'
import {chromium, type Browser, type BrowserContext, type Page} from 'playwright'
import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {getTempAuthCode} from 'devframe/node/auth'
import {createFakeHarness, makeRpcClient} from '@conciv/harness-testkit'
import {start, type Engine} from '../src/start.js'
import type {} from '@devframes/hub/node'
import type {} from '@devframes/plugin-terminals/rpc'
import type {} from '@devframes/plugin-messages/rpc'
import type {} from '@devframes/service-shiki'
import type {} from '@devframes/service-git'
import type {} from '@devframes/service-open'

const MCP_TOKEN = 'spike-mcp-token'
const root = mkdtempSync(join(tmpdir(), 'conciv-devframe-spike-'))

function boot(): Promise<Engine> {
  return start({
    options: {stateRoot: root},
    root,
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
    const client = await window.getDevframeRpcClient({baseURL})
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
        await window.client.call('conciv:sessions:rename', {sessionId: 'conciv_missing', title: 'x'})
        return {served: true}
      } catch (error) {
        return {
          served: false,
          name: error instanceof Error ? error.name : '',
          message: String(error),
          keys: Object.getOwnPropertyNames(error ?? {}),
          cause: error instanceof Error ? error.cause : undefined,
        }
      }
    })
    console.log('DIAGNOSTIC OVER WIRE', JSON.stringify(outcome))
    expect(outcome.served).toBe(false)
    expect(outcome.message).toMatch(/^Error: CONCIV_NOT_FOUND: /)
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
      const result = await window.client.call('hub:commands:execute', 'conciv:new-session')
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
      await window.client.call('hub:docks:activate', {dockId: 'conciv', params: {sessionId: 'conciv_deep'}})
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
          add: (input) => window.client.call('hub:messages:add', input),
          remove: (id) => window.client.call('hub:messages:remove', id),
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
      const client = await window.getDevframeRpcClient({baseURL})
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
