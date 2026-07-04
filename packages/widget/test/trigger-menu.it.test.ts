import {createServer, type IncomingMessage, type Server, type ServerResponse} from 'node:http'
import type {AddressInfo} from 'node:net'
import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {chromium, type Browser, type Page} from 'playwright'
import {EventType, type StreamChunk} from '@tanstack/ai'
import {widgetBundle, readBody} from './it-fixture.js'
import {createAttachChat, type ChatPostBody} from './helpers/attach-chat.js'

const COMMANDS_PAYLOAD = {
  commands: [
    {name: 'compact', description: 'Compact the conversation', argumentHint: '[instructions]', source: 'harness'},
    {name: 'usage', description: 'Show token usage', source: 'harness'},
    {name: 'mcp__conciv__snapshot', description: 'Capture the board', source: 'mcp'},
  ],
}
const TOOLS_PAYLOAD = {tools: [{name: 'page.read', description: 'Read the page DOM'}]}

const commandsState = {payload: COMMANDS_PAYLOAD as {commands: unknown[]}}
const posts: string[] = []

async function* replyScript(): AsyncGenerator<StreamChunk> {
  yield {type: EventType.RUN_STARTED, threadId: 'thread-trigger', runId: 'aidx-run'}
  yield {type: EventType.TEXT_MESSAGE_START, messageId: 'm1', role: 'assistant'}
  yield {type: EventType.TEXT_MESSAGE_CONTENT, messageId: 'm1', delta: 'ack'}
  yield {type: EventType.TEXT_MESSAGE_END, messageId: 'm1'}
  yield {type: EventType.RUN_FINISHED, threadId: 'thread-trigger', runId: 'aidx-run', finishReason: 'stop'}
}

const chat = createAttachChat({runFor: () => replyScript})

function writeJson(res: ServerResponse, body: unknown): void {
  res.writeHead(200, {'content-type': 'application/json', 'access-control-allow-origin': '*'})
  res.end(JSON.stringify(body))
}

function writeSse(res: ServerResponse): void {
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    'access-control-allow-origin': '*',
  })
}

function pageHtml(): string {
  return `<!doctype html><html><head>
    <meta name="pw-api-base" content="">
    <meta name="pw-widget" content='{"quickTerminal":false}'>
  </head><body>
    <div id="probe">page-bus-ok</div>
    <script>${widgetBundle}</script>
  </body></html>`
}

function handle(req: IncomingMessage, res: ServerResponse): void {
  const url = req.url ?? ''
  if (url.startsWith('/api/chat/session/resolve') && req.method === 'POST') {
    void readBody(req).then(() => writeJson(res, {sessionId: 'conciv_trigger_menu'}))
    return
  }
  if (url.startsWith('/api/chat/sessions')) return writeJson(res, {sessions: []})
  if (url.startsWith('/api/chat/session')) {
    return writeJson(res, {
      sessionId: 'conciv_trigger_menu',
      harnessSessionId: null,
      name: null,
      origin: 'chat',
      cwd: '/app',
      lock: {held: false, role: null},
      usage: null,
      harness: {id: 'claude', name: 'Claude', canLaunch: false},
    })
  }
  if (url.startsWith('/api/chat/models')) {
    return writeJson(res, {
      models: [{id: 'sonnet', name: 'Claude Sonnet 4.6', description: 'Balanced', group: 'Claude'}],
      defaultModel: 'sonnet',
      harness: {id: 'claude', name: 'Claude', canLaunch: false},
    })
  }
  if (url.startsWith('/api/chat/commands')) return writeJson(res, commandsState.payload)
  if (url.startsWith('/api/chat/tools')) return writeJson(res, TOOLS_PAYLOAD)
  if (url.startsWith('/api/chat/history')) return writeJson(res, [])
  if (url === '/api/chat' && req.method === 'POST') {
    void readBody(req).then((body) => {
      posts.push(body)
      const parsed = (() => {
        try {
          return JSON.parse(body) as ChatPostBody
        } catch {
          return {}
        }
      })()
      chat.postChat('conciv_trigger_menu', parsed)
      writeJson(res, {ok: true})
    })
    return
  }
  if (url === '/api/chat/attach') {
    writeSse(res)
    chat.openAttach('conciv_trigger_menu', res)
    return
  }
  if (url === '/api/chat/permission-decision') return writeJson(res, {ok: true})
  if (url === '/api/page/reply') return writeJson(res, {ok: true})
  if (url === '/api/page/stream') {
    writeSse(res)
    return
  }
  res.writeHead(200, {'content-type': 'text/html'})
  res.end(pageHtml())
}

describe('composer trigger menus (it) — real browser, real HTTP', () => {
  let browser: Browser
  let server: Server
  const state = {base: ''}

  const openChat = async (): Promise<Page> => {
    const page = await browser.newPage()
    page.setDefaultTimeout(15_000)
    page.setDefaultNavigationTimeout(15_000)
    await page.goto(state.base, {waitUntil: 'domcontentloaded'})
    await page.getByRole('button', {name: 'Open conciv chat'}).click()
    await page.getByLabel('Message the conciv agent').waitFor({state: 'visible'})
    return page
  }

  beforeAll(async () => {
    server = createServer(handle)
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const addr = server.address() as AddressInfo
    state.base = `http://127.0.0.1:${addr.port}`
    browser = await chromium.launch()
  }, 90_000)

  afterAll(async () => {
    await browser?.close()
    server?.close()
  })

  it('slash menu lists grouped commands, filters, inserts on selection, and submits as prompt text', async () => {
    commandsState.payload = COMMANDS_PAYLOAD
    const page = await openChat()
    const input = page.getByLabel('Message the conciv agent')
    await input.click()
    await input.pressSequentially('/comp')
    const option = page.getByRole('option', {name: /\/compact/})
    await option.waitFor({state: 'visible'})
    await expect.poll(() => page.getByRole('option').count()).toBe(1)
    await option.click()
    await expect.poll(() => input.inputValue()).toBe('/compact ')
    await input.click()
    await input.press('End')
    await input.pressSequentially('focus on auth')
    await expect.poll(() => input.inputValue()).toBe('/compact focus on auth')
    await input.press('Enter')
    await expect.poll(() => posts.some((body) => body.includes('/compact focus on auth'))).toBe(true)
    await page.close()
  })

  it('groups mcp commands under their own header', async () => {
    commandsState.payload = COMMANDS_PAYLOAD
    const page = await openChat()
    const input = page.getByLabel('Message the conciv agent')
    await input.click()
    await input.pressSequentially('/')
    await page.getByRole('option', {name: /mcp__conciv__snapshot/}).waitFor({state: 'visible'})
    await page.getByText('MCP', {exact: true}).waitFor({state: 'visible'})
    await page.getByText('Commands', {exact: true}).waitFor({state: 'visible'})
    await page.close()
  })

  it('mention menu inserts a tool reference via keyboard', async () => {
    commandsState.payload = COMMANDS_PAYLOAD
    const page = await openChat()
    const input = page.getByLabel('Message the conciv agent')
    await input.click()
    await input.pressSequentially('@page')
    await page.getByRole('option', {name: /@page\.read/}).waitFor({state: 'visible'})
    await input.press('Enter')
    await expect.poll(() => input.inputValue()).toBe('@page.read ')
    await page.close()
  })

  it('escape closes the menu; an empty command list never opens one', async () => {
    commandsState.payload = COMMANDS_PAYLOAD
    const page = await openChat()
    const input = page.getByLabel('Message the conciv agent')
    await input.click()
    await input.pressSequentially('/co')
    await page.getByRole('listbox').waitFor({state: 'visible'})
    await input.press('Escape')
    await expect.poll(() => page.getByRole('listbox').count()).toBe(0)
    await page.close()

    commandsState.payload = {commands: []}
    const emptyPage = await openChat()
    const emptyInput = emptyPage.getByLabel('Message the conciv agent')
    await emptyInput.click()
    await emptyInput.pressSequentially('/co')
    await emptyPage.waitForTimeout(300)
    expect(await emptyPage.getByRole('listbox').count()).toBe(0)
    await emptyPage.close()
  })
})
