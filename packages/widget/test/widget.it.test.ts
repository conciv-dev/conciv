// The devgent widget driven in a REAL browser against a REAL local SSE server. A tiny Node
// http server serves an HTML page that embeds the vite-built global bundle, and answers the
// /api/* routes the widget speaks: the chat-availability probe, a scripted AG-UI chat stream
// (encoded with TanStack AI's own toServerSentEventsStream — the exact encoder the dev server
// uses, so the widget's fetchServerSentEvents consumes it natively), a scripted test-runner
// stream, and the page-bus (push a PageQuery, resolve from the widget's reply). Real transport,
// real browser, real bundle, real driver — scripted fixtures, not mocks. The authoritative
// harness→SSE and test-runner→SSE backends are proven by @devgent/core's route ITs.
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {Readable} from 'node:stream'
import {createServer, type IncomingMessage, type Server, type ServerResponse} from 'node:http'
import type {AddressInfo} from 'node:net'
import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {chromium, type Browser} from 'playwright'
import {EventType, type StreamChunk, toServerSentEventsStream} from '@tanstack/ai'
import {aguiCustomFor} from '@devgent/protocol/ui-types'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const widgetBundle = fs.readFileSync(path.join(dirname, '../dist/devgent-widget.global.js'), 'utf8')

const ASSISTANT_TEXT = 'Hello from devgent'
const APPROVAL_QUESTION = 'Run a risky command?'
const FAILING_TEST = 'rejects an expired token'
const FAILURE_MESSAGE = 'expected 200 to be 401'
const PAGE_QUERY = {requestId: 'pb1', kind: 'text', selector: '#probe'}

function pageHtml(): string {
  return `<!doctype html><html><head>
    <meta name="pw-api-base" content="">
  </head><body>
    <div id="probe">page-bus-ok</div>
    <script>${widgetBundle}</script>
  </body></html>`
}

// One scripted assistant turn: a text message followed by a risky-command approval card.
async function* chatScript(): AsyncGenerator<StreamChunk> {
  yield {type: EventType.RUN_STARTED, threadId: 't', runId: 'r'}
  yield {type: EventType.TEXT_MESSAGE_START, messageId: 'm1', role: 'assistant'}
  yield {type: EventType.TEXT_MESSAGE_CONTENT, messageId: 'm1', delta: ASSISTANT_TEXT}
  yield {type: EventType.TEXT_MESSAGE_END, messageId: 'm1'}
  yield aguiCustomFor({
    kind: 'approval',
    renderId: 'a1',
    question: APPROVAL_QUESTION,
    detail: 'rm -rf /tmp/scratch',
  })
  yield {type: EventType.RUN_FINISHED, threadId: 't', runId: 'r', finishReason: 'stop'}
}

function writeChatStream(res: ServerResponse): void {
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    'access-control-allow-origin': '*',
  })
  const sse = toServerSentEventsStream(chatScript(), new AbortController())
  Readable.fromWeb(sse as Parameters<typeof Readable.fromWeb>[0]).pipe(res)
}

// Scripted vitest stream: one passing test, one failing test (with an error), then run-end.
function writeVitestStream(res: ServerResponse): void {
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    'access-control-allow-origin': '*',
  })
  const send = (event: unknown) => res.write(`data: ${JSON.stringify(event)}\n\n`)
  const file = '/app/src/auth.test.ts'
  const error = {file, name: FAILING_TEST, message: FAILURE_MESSAGE, stack: FAILURE_MESSAGE, line: 42}
  const tests = [
    {file, name: 'signs in a valid user', state: 'pass', durationMs: 5},
    {file, name: FAILING_TEST, state: 'fail', durationMs: 9, error},
  ]
  send({type: 'snapshot', files: [], summary: {passed: 0, failed: 0, skipped: 0, durationMs: 0}, watching: true})
  send({type: 'run-start', runId: 'r1', files: [file]})
  send(tests[0])
  send(tests[1])
  // The real backend's run-end carries the full tests array (and failures); the card renders
  // its tree from it.
  send({
    type: 'run-end',
    runId: 'r1',
    summary: {passed: 1, failed: 1, skipped: 0, durationMs: 14},
    failures: [error],
    tests,
  })
}

function writeJson(res: ServerResponse, body: unknown): void {
  res.writeHead(200, {'content-type': 'application/json', 'access-control-allow-origin': '*'})
  res.end(JSON.stringify(body))
}

describe('devgent widget (it) — real browser, real SSE', () => {
  let browser: Browser
  let server: Server
  const state = {base: ''}

  beforeAll(async () => {
    server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const url = req.url ?? ''
      // Probe → present, so the widget mounts the chat FAB + page-bus (production boot path).
      if (url.startsWith('/api/chat/session')) {
        return writeJson(res, {sessionId: null, source: 'new', cwd: '/app', lock: {held: false, role: null}})
      }
      if (url.startsWith('/api/chat/history')) return writeJson(res, [])
      if (url === '/api/chat' && req.method === 'POST') return writeChatStream(res)
      if (url === '/api/chat/permission-decision') return writeJson(res, {ok: true})
      if (url === '/api/test-runner/stream') return writeVitestStream(res)
      if (url === '/api/editor/open') return writeJson(res, {ok: true})
      if (url === '/api/page/reply') return writeJson(res, {ok: true})
      // Page-bus: as soon as the widget subscribes, push one query and keep the stream open.
      if (url === '/api/page/stream') {
        res.writeHead(200, {
          'content-type': 'text/event-stream',
          'cache-control': 'no-cache',
          'access-control-allow-origin': '*',
        })
        res.write(`data: ${JSON.stringify(PAGE_QUERY)}\n\n`)
        return
      }
      res.writeHead(200, {'content-type': 'text/html'})
      res.end(pageHtml())
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const addr = server.address() as AddressInfo
    state.base = `http://127.0.0.1:${addr.port}`
    browser = await chromium.launch()
  }, 90_000)

  afterAll(async () => {
    await browser?.close()
    server?.close()
  })

  it('mounts the FAB, streams an assistant reply, and renders the approval gate → decision', async () => {
    const page = await browser.newContext().then((c) => c.newPage())
    await page.goto(state.base)

    // The FAB mounts only after the chat-availability probe resolves (production boot path).
    const fab = page.getByRole('button', {name: 'Open devgent chat'})
    await fab.waitFor({state: 'visible'})
    await fab.click()

    // Empty thread → greeting + starters.
    await page.getByText('How can I help you today?').waitFor({state: 'visible'})

    // Send a message; the scripted AG-UI stream renders the assistant text.
    const composer = page.getByLabel('Message the devgent agent')
    await composer.fill('do something')
    await composer.press('Enter')
    await page.getByText(ASSISTANT_TEXT).waitFor({state: 'visible'})

    // The same turn emits a CUSTOM devgent-ui approval spec → the gate card renders.
    await page.getByText(APPROVAL_QUESTION).waitFor({state: 'visible'})

    // Approving posts the blocking allow/deny decision back to the dev server.
    const decision = page.waitForRequest((r) => r.url().includes('/api/chat/permission-decision'))
    await page.getByRole('button', {name: 'Approve'}).click()
    const body = (await decision).postDataJSON() as {renderId: string; approved: boolean}
    expect(body.renderId).toBe('a1')
    expect(body.approved).toBe(true)
    await page.close()
  })

  it('renders the live vitest card: pass/fail tree, expands the failure with actions', async () => {
    const page = await browser.newContext().then((c) => c.newPage())
    await page.goto(state.base)
    // The test-only seam mounts a standalone live card (result=null → subscribes to the stream).
    await page.waitForFunction(() => '__DEVGENT_RENDER_TEST_CARD__' in window)
    await page.evaluate(() => {
      const w = window as unknown as {__DEVGENT_RENDER_TEST_CARD__?: () => void}
      w.__DEVGENT_RENDER_TEST_CARD__?.()
    })

    await page.getByText('1 failed').waitFor({state: 'visible'})
    await page.getByText(FAILING_TEST).click()
    await page.getByText(FAILURE_MESSAGE).waitFor({state: 'visible'})
    await page.getByRole('button', {name: /Fix this/}).waitFor({state: 'visible'})
    await page.getByRole('button', {name: /auth\.test\.ts:42/}).waitFor({state: 'visible'})
    await page.close()
  })

  it('answers a page-bus query against the live DOM and posts the reply', async () => {
    const page = await browser.newContext().then((c) => c.newPage())
    const reply = page.waitForRequest((r) => r.url().includes('/api/page/reply'))
    await page.goto(state.base)
    const body = (await reply).postDataJSON() as {requestId: string; data: {text?: string}}
    expect(body.requestId).toBe('pb1')
    expect(body.data.text).toBe('page-bus-ok')
    await page.close()
  })
})
