import {type IncomingMessage, type Server, type ServerResponse} from 'node:http'
import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {chromium, type Browser, type Page} from 'playwright'
import {EventType, type StreamChunk, type UIMessage} from '@tanstack/ai'
import {aguiSnapshotFor} from '@conciv/protocol/ui-types'
import {widgetBundle, readBody} from './it-fixture.js'
import {createAttachChat, parseBody} from './helpers/attach-chat.js'
import {makeChatFixtureServer, writeJson, writeSse} from './helpers/chat-fixture-server.js'

const USER_TEXT = 'run something'
const BEFORE = 'streamed-before-reload '
const AFTER = 'streamed-after-reload'

const fixtureGates = {reload: () => {}}

async function* reloadScript(): AsyncGenerator<StreamChunk> {
  yield {type: EventType.RUN_STARTED, threadId: 't', runId: 'r'}
  yield {type: EventType.TEXT_MESSAGE_START, messageId: 'm1', role: 'assistant'}
  yield {type: EventType.TEXT_MESSAGE_CONTENT, messageId: 'm1', delta: BEFORE}
  await new Promise<void>((resolve) => {
    fixtureGates.reload = resolve
  })
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

  const routes = (req: IncomingMessage, res: ServerResponse, url: string): boolean => {
    const sessionId = (req.headers['conciv-session-id'] as string | undefined) ?? 'conciv_reload'
    if (url === '/api/chat' && req.method === 'POST') {
      void readBody(req).then((body) => {
        chat.postChat(sessionId, parseBody(body))
        writeJson(res, {ok: true})
      })
      return true
    }
    if (url === '/api/chat/attach') {
      writeSse(res)
      chat.openAttach(sessionId, res)
      return true
    }
    return false
  }

  beforeAll(async () => {
    const started = await makeChatFixtureServer({sessionId: 'conciv_reload', pageHtml, routes})
    server = started.server
    state.base = started.base
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
    fixtureGates.reload()
    await page.getByText(USER_TEXT).waitFor({state: 'visible'})
    await page.getByText('streamed-before-reload').waitFor({state: 'visible'})
    await page.getByText(/streamed-after-reload/).waitFor({state: 'visible'})
    expect(await page.getByText(/streamed-after-reload/).count()).toBeGreaterThan(0)
    await page.close()
  })

  it('the panel reopens itself after reload with the same active session', async () => {
    const page = await newPage()
    await page.goto(state.base)
    await page.getByRole('button', {name: 'Open conciv chat'}).click()
    await page.getByRole('dialog', {name: 'conciv chat agent'}).waitFor({state: 'visible'})
    await page.reload({waitUntil: 'domcontentloaded'})
    await page.getByRole('dialog', {name: 'conciv chat agent'}).waitFor({state: 'visible'})
    await page.close()
  })

  it('draft text, cursor position, and focus survive reload invisibly', async () => {
    const page = await newPage()
    await page.goto(state.base)
    await page.getByRole('button', {name: 'Open conciv chat'}).click()
    const input = page.getByRole('textbox', {name: 'Message the conciv agent'})
    await input.fill('fix the header layout')
    await input.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(7, 7))
    await page.reload({waitUntil: 'domcontentloaded'})
    const restored = page.getByRole('textbox', {name: 'Message the conciv agent'})
    await expect
      .poll(() =>
        restored.evaluate((el: HTMLTextAreaElement) => ({
          value: el.value,
          focused: (el.getRootNode() as ShadowRoot).activeElement === el,
          selection: [el.selectionStart, el.selectionEnd],
        })),
      )
      .toEqual({value: 'fix the header layout', focused: true, selection: [7, 7]})
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

  const routes = (_req: IncomingMessage, res: ServerResponse, url: string): boolean => {
    if (url !== '/api/chat/attach') return false
    if (attach.mode === 'fail') {
      res.writeHead(500, {'access-control-allow-origin': '*'})
      res.end()
      return true
    }
    writeSse(res)
    res.end()
    return true
  }

  beforeAll(async () => {
    const started = await makeChatFixtureServer({sessionId: 'conciv_reconnect', pageHtml, routes})
    server = started.server
    state.base = started.base
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

const FIRST = 'first-half-streamed '
const REST = 'second-half-settled'
const SECOND_REPLY = 'second-reply-visible'

describe('aidx widget disconnect-settle reconcile (it) — a turn that settles during a dropped attach unblocks the composer', () => {
  let browser: Browser
  let server: Server
  const state = {base: ''}
  const run = {posts: 0, dropped: false, userText: '', subscribers: new Set<ServerResponse>()}

  const writeChunk = (res: ServerResponse, chunk: StreamChunk): void => {
    res.write(`data: ${JSON.stringify(chunk)}\n\n`)
  }
  const userMessage = () => ({id: 'u', role: 'user', parts: [{type: 'text', content: run.userText}]})
  const assistantFull = () => ({id: 'm1', role: 'assistant', parts: [{type: 'text', content: `${FIRST}${REST}`}]})

  const newPage = async (): Promise<Page> => {
    const page = await browser.newPage()
    page.setDefaultTimeout(15_000)
    page.setDefaultNavigationTimeout(15_000)
    return page
  }

  const routes = (req: IncomingMessage, res: ServerResponse, url: string): boolean => {
    if (url === '/api/chat' && req.method === 'POST') {
      void readBody(req).then((body) => {
        run.posts += 1
        const parsed = parseBody(body)
        const last = (parsed.messages ?? []).filter((m) => m.role === 'user').at(-1)
        run.userText = last?.parts?.map((p) => p.content).join('') ?? run.userText
        writeJson(res, {ok: true})
        const subscribers = [...run.subscribers]
        if (run.posts === 1) {
          for (const sub of subscribers) {
            writeChunk(sub, {type: EventType.RUN_STARTED, threadId: 't', runId: 'r1'})
            writeChunk(sub, {type: EventType.TEXT_MESSAGE_START, messageId: 'm1', role: 'assistant'})
            writeChunk(sub, {type: EventType.TEXT_MESSAGE_CONTENT, messageId: 'm1', delta: FIRST})
          }
          setTimeout(() => {
            for (const sub of subscribers) {
              run.subscribers.delete(sub)
              sub.end()
            }
            run.dropped = true
          }, 250)
          return
        }
        for (const sub of subscribers) {
          writeChunk(sub, {type: EventType.RUN_STARTED, threadId: 't', runId: 'r2'})
          writeChunk(sub, {type: EventType.TEXT_MESSAGE_START, messageId: 'm2', role: 'assistant'})
          writeChunk(sub, {type: EventType.TEXT_MESSAGE_CONTENT, messageId: 'm2', delta: SECOND_REPLY})
          writeChunk(sub, {type: EventType.TEXT_MESSAGE_END, messageId: 'm2'})
          writeChunk(sub, {type: EventType.RUN_FINISHED, threadId: 't', runId: 'r2', finishReason: 'stop'})
        }
      })
      return true
    }
    if (url === '/api/chat/attach') {
      writeSse(res)
      const messages = run.dropped ? [userMessage(), assistantFull()] : run.userText ? [userMessage()] : []
      writeChunk(res, aguiSnapshotFor({generating: false, messages: messages as unknown as UIMessage[]}))
      run.subscribers.add(res)
      res.on('close', () => run.subscribers.delete(res))
      return true
    }
    return false
  }

  beforeAll(async () => {
    const started = await makeChatFixtureServer({sessionId: 'conciv_settle', pageHtml, routes})
    server = started.server
    state.base = started.base
    browser = await chromium.launch()
  }, 90_000)

  afterAll(async () => {
    await browser?.close()
    server?.close()
  })

  it('re-attaching to an idle snapshot after a mid-turn drop clears isLoading so the next send is not blocked', async () => {
    const page = await newPage()
    await page.goto(state.base)
    await page.getByRole('button', {name: 'Open conciv chat'}).click()
    await page.getByRole('textbox', {name: 'Message the conciv agent'}).fill(USER_TEXT)
    await page.keyboard.press('Enter')
    await page.getByText(FIRST.trim()).waitFor({state: 'visible'})
    await page.getByText(REST).waitFor({state: 'visible'})

    const secondPost = page.waitForRequest((r) => r.url().endsWith('/api/chat') && r.method() === 'POST')
    await page.getByRole('textbox', {name: 'Message the conciv agent'}).fill('second message')
    await page.keyboard.press('Enter')
    await secondPost
    await page.getByText(SECOND_REPLY).waitFor({state: 'visible'})
    await page.close()
  })
})
