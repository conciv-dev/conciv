import {createServer, type IncomingMessage, type Server, type ServerResponse} from 'node:http'
import type {AddressInfo} from 'node:net'
import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {chromium, type Browser, type Page} from 'playwright'
import {EventType, type StreamChunk} from '@tanstack/ai'
import {widgetBundle, readBody} from './it-fixture.js'
import {createAttachChat, parseBody} from './helpers/attach-chat.js'

const USER_TEXT = 'run something'
const BEFORE = 'streamed-before-reload '
const AFTER = 'streamed-after-reload'

async function* reloadScript(): AsyncGenerator<StreamChunk> {
  yield {type: EventType.RUN_STARTED, threadId: 't', runId: 'r'}
  yield {type: EventType.TEXT_MESSAGE_START, messageId: 'm1', role: 'assistant'}
  yield {type: EventType.TEXT_MESSAGE_CONTENT, messageId: 'm1', delta: BEFORE}
  await new Promise((resolve) => setTimeout(resolve, 800))
  yield {type: EventType.TEXT_MESSAGE_CONTENT, messageId: 'm1', delta: AFTER}
  yield {type: EventType.TEXT_MESSAGE_END, messageId: 'm1'}
  yield {type: EventType.RUN_FINISHED, threadId: 't', runId: 'r', finishReason: 'stop'}
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

describe('aidx widget reload continuity (it) — real browser, snapshot restore', () => {
  let browser: Browser
  let server: Server
  const state = {base: ''}
  const chat = createAttachChat({runFor: () => reloadScript})

  const newPage = async (): Promise<Page> => {
    const page = await browser.newPage()
    page.setDefaultTimeout(15_000)
    page.setDefaultNavigationTimeout(15_000)
    return page
  }

  beforeAll(async () => {
    server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const url = req.url ?? ''
      const sessionId = (req.headers['conciv-session-id'] as string | undefined) ?? 'conciv_reload'

      if (url.startsWith('/api/chat/session/resolve') && req.method === 'POST') {
        return writeJson(res, {sessionId: 'conciv_reload'})
      }
      if (url.startsWith('/api/chat/session') && !url.startsWith('/api/chat/sessions')) {
        return writeJson(res, {
          sessionId: 'conciv_reload',
          harnessSessionId: null,
          name: null,
          origin: 'chat',
          cwd: '/app',
          lock: {held: false, role: null},
          usage: null,
          harness: {id: 'claude', name: 'Claude', canLaunch: false},
        })
      }
      if (url.startsWith('/api/chat/sessions')) return writeJson(res, {sessions: []})
      if (url.startsWith('/api/chat/models')) {
        return writeJson(res, {
          models: [{id: 'sonnet', name: 'Claude Sonnet 4.6', description: 'Balanced', group: 'Claude'}],
          defaultModel: 'sonnet',
          harness: {id: 'claude', name: 'Claude', canLaunch: false},
        })
      }
      if (url.startsWith('/api/chat/commands')) return writeJson(res, {commands: []})
      if (url.startsWith('/api/chat/tools')) return writeJson(res, {tools: []})
      if (url === '/api/chat' && req.method === 'POST') {
        void readBody(req).then((body) => {
          chat.postChat(sessionId, parseBody(body))
          writeJson(res, {ok: true})
        })
        return
      }
      if (url === '/api/chat/attach') {
        writeSse(res)
        chat.openAttach(sessionId, res)
        return
      }
      if (url === '/api/page/stream') {
        writeSse(res)
        return
      }
      res.writeHead(200, {'content-type': 'text/html; charset=utf-8'})
      res.end(pageHtml())
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    state.base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    browser = await chromium.launch()
  }, 90_000)

  afterAll(async () => {
    await browser?.close()
    server?.close()
  })

  it('a page reload mid-stream loses nothing', async () => {
    const page = await newPage()
    await page.goto(state.base)
    await page.getByRole('button', {name: 'Open conciv chat'}).click()
    await page.getByRole('textbox', {name: 'Message the conciv agent'}).fill(USER_TEXT)
    await page.keyboard.press('Enter')
    await page.getByText('streamed-before-reload').waitFor({state: 'visible'})
    await page.reload({waitUntil: 'domcontentloaded'})
    await page.getByRole('button', {name: 'Open conciv chat'}).click()
    await page.getByText(USER_TEXT).waitFor({state: 'visible'})
    await page.getByText('streamed-before-reload').waitFor({state: 'visible'})
    await page.getByText(/streamed-after-reload/).waitFor({state: 'visible'})
    expect(await page.getByText(/streamed-after-reload/).count()).toBeGreaterThan(0)
    await page.close()
  })
})

describe('aidx widget reconnect feedback (it) — attach failure surfaces a reconnecting notice', () => {
  let browser: Browser
  let server: Server
  const state = {base: ''}
  const attach = {mode: 'ok' as 'ok' | 'fail'}

  const newPage = async (): Promise<Page> => {
    const page = await browser.newPage()
    page.setDefaultTimeout(15_000)
    page.setDefaultNavigationTimeout(15_000)
    return page
  }

  beforeAll(async () => {
    server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const url = req.url ?? ''
      if (url.startsWith('/api/chat/session/resolve') && req.method === 'POST') {
        return writeJson(res, {sessionId: 'conciv_reconnect'})
      }
      if (url.startsWith('/api/chat/session') && !url.startsWith('/api/chat/sessions')) {
        return writeJson(res, {
          sessionId: 'conciv_reconnect',
          harnessSessionId: null,
          name: null,
          origin: 'chat',
          cwd: '/app',
          lock: {held: false, role: null},
          usage: null,
          harness: {id: 'claude', name: 'Claude', canLaunch: false},
        })
      }
      if (url.startsWith('/api/chat/sessions')) return writeJson(res, {sessions: []})
      if (url.startsWith('/api/chat/models')) {
        return writeJson(res, {
          models: [{id: 'sonnet', name: 'Claude Sonnet 4.6', description: 'Balanced', group: 'Claude'}],
          defaultModel: 'sonnet',
          harness: {id: 'claude', name: 'Claude', canLaunch: false},
        })
      }
      if (url.startsWith('/api/chat/commands')) return writeJson(res, {commands: []})
      if (url.startsWith('/api/chat/tools')) return writeJson(res, {tools: []})
      if (url === '/api/chat/attach') {
        if (attach.mode === 'fail') {
          res.writeHead(500, {'access-control-allow-origin': '*'})
          res.end()
          return
        }
        writeSse(res)
        res.end()
        return
      }
      if (url === '/api/page/stream') {
        writeSse(res)
        return
      }
      res.writeHead(200, {'content-type': 'text/html; charset=utf-8'})
      res.end(pageHtml())
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    state.base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    browser = await chromium.launch()
  }, 90_000)

  afterAll(async () => {
    await browser?.close()
    server?.close()
  })

  it('shows a reconnecting notice while attach fails and clears it on recovery', async () => {
    attach.mode = 'ok'
    const page = await newPage()
    await page.goto(state.base)
    await page.getByRole('button', {name: 'Open conciv chat'}).click()
    await page.getByRole('textbox', {name: 'Message the conciv agent'}).waitFor({state: 'visible'})
    attach.mode = 'fail'
    await page.getByText('Reconnecting…').waitFor({state: 'visible'})
    attach.mode = 'ok'
    await page.getByText('Reconnecting…').waitFor({state: 'detached'})
    await page.close()
  })
})
