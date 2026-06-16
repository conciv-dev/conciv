// The aidx widget driven in a REAL browser against a REAL local SSE server. A tiny Node
// http server serves an HTML page that embeds the vite-built global bundle, and answers the
// /api/* routes the widget speaks: the chat-availability probe, a scripted AG-UI chat stream
// (encoded with TanStack AI's own toServerSentEventsStream — the exact encoder the dev server
// uses, so the widget's fetchServerSentEvents consumes it natively), a scripted test-runner
// stream, and the page-bus (push a PageQuery, resolve from the widget's reply). Real transport,
// real browser, real bundle, real driver — scripted fixtures, not mocks. The authoritative
// harness→SSE and test-runner→SSE backends are proven by @aidx/core's route ITs.
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {Readable} from 'node:stream'
import {createServer, type IncomingMessage, type Server, type ServerResponse} from 'node:http'
import type {AddressInfo} from 'node:net'
import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {chromium, type Browser} from 'playwright'
import {EventType, type StreamChunk, toServerSentEventsStream} from '@tanstack/ai'
import {aguiCustomFor} from '@aidx/protocol/ui-types'
import {aguiUsageFor, snapshotToTokenUsage} from '@aidx/protocol/usage-types'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const widgetBundle = fs.readFileSync(path.join(dirname, '../dist/aidx-widget.global.js'), 'utf8')

const ASSISTANT_TEXT = 'Hello from aidx'
const SWITCHED_REPLY = 'Reply from the switched session'
const APPROVAL_QUESTION = 'Run a risky command?'
const FAILING_TEST = 'rejects an expired token'
const FAILURE_MESSAGE = 'expected 200 to be 401'
const PAGE_QUERY = {requestId: 'pb1', kind: 'text', selector: '#probe'}
// A react verb aimed at the non-React probe div: proves the verb routes through the driver to
// the bippy bridge and degrades gracefully (no fiber) — the happy path is covered by example e2e.
const LOCATE_QUERY = {requestId: 'pbL', kind: 'locate', selector: '#probe'}

// Default fixture for the modal-focused tests: quick terminal off, so there's exactly one chat
// composer/greeting in the DOM (both layouts render their own ChatPanel when enabled).
function pageHtml(): string {
  return `<!doctype html><html><head>
    <meta name="pw-api-base" content="">
    <meta name="pw-widget" content='{"quickTerminal":false}'>
  </head><body>
    <div id="probe">page-bus-ok</div>
    <script>${widgetBundle}</script>
  </body></html>`
}

// Fixture with a pw-widget meta so we can exercise the configured trigger position + drag-snap.
function widgetConfigPageHtml(widgetJson: string): string {
  return `<!doctype html><html><head>
    <meta name="pw-api-base" content="">
    <meta name="pw-widget" content='${widgetJson}'>
  </head><body>
    <div id="probe">page-bus-ok</div>
    <script>${widgetBundle}</script>
  </body></html>`
}

// Next-style fixture: no usable meta base (dead host), apiBase supplied via window global instead.
function globalBasePageHtml(globalBase: string): string {
  return `<!doctype html><html><head>
    <meta name="pw-api-base" content="http://127.0.0.1:1">
    <meta name="pw-widget" content='{"quickTerminal":false}'>
    <script>window.__AIDX_API_BASE__ = ${JSON.stringify(globalBase)}</script>
  </head><body>
    <script>${widgetBundle}</script>
  </body></html>`
}

// One scripted assistant turn: a text message followed by a risky-command approval card.
async function* chatScript(): AsyncGenerator<StreamChunk> {
  yield {type: EventType.RUN_STARTED, threadId: 't', runId: 'r'}
  // Live usage injected mid-turn (core does this from claude's message_start) — the tracker fills
  // before the turn ends, via the widget's onCustomEvent handler.
  yield aguiUsageFor({modelId: 'claude-opus-4-8[1m]', contextWindow: 1000000, inputTokens: 18151, cacheReadTokens: 15832, cacheWriteTokens: 1912})
  yield {type: EventType.TEXT_MESSAGE_START, messageId: 'm1', role: 'assistant'}
  yield {type: EventType.TEXT_MESSAGE_CONTENT, messageId: 'm1', delta: ASSISTANT_TEXT}
  yield {type: EventType.TEXT_MESSAGE_END, messageId: 'm1'}
  yield aguiCustomFor({
    kind: 'approval',
    renderId: 'a1',
    question: APPROVAL_QUESTION,
    detail: 'rm -rf /tmp/scratch',
  })
  yield {
    type: EventType.RUN_FINISHED,
    threadId: 't',
    runId: 'r',
    finishReason: 'stop',
    usage: snapshotToTokenUsage({
      modelId: 'claude-opus-4-8[1m]',
      contextWindow: 1000000,
      inputTokens: 18151,
      cacheReadTokens: 15832,
      cacheWriteTokens: 1912,
      outputTokens: 19,
      totalCostUsd: 0.118,
      numTurns: 1,
    }),
  }
}


// A compaction turn: native /compact streams no assistant text. Held open ~700ms so the composer's
// out-of-band fetch stays in flight long enough for the test to observe the Send-slot spinner.
async function* compactScript(): AsyncGenerator<StreamChunk> {
  yield {type: EventType.RUN_STARTED, threadId: 't', runId: 'rc'}
  await new Promise((resolve) => setTimeout(resolve, 700))
  yield {type: EventType.RUN_FINISHED, threadId: 't', runId: 'rc', finishReason: 'stop'}
}

const MCP_REPLY = 'MCP reply is visible'

// The exact shape @tanstack/ai's chat() now streams: a generated threadId, an empty reasoning
// block (START/END, no content — the empty-delta guard), text, MCP tool calls + results, then a
// second text message. Reproduces "the bot replied but the chat shows nothing".
async function* mcpAccessScript(): AsyncGenerator<StreamChunk> {
  const threadId = 'thread-1781448888530-xl65usg'
  yield {type: EventType.RUN_STARTED, threadId, runId: 'aidx-run'}
  yield {type: EventType.REASONING_MESSAGE_START, messageId: 't1', role: 'reasoning'}
  yield {type: EventType.REASONING_MESSAGE_END, messageId: 't1'}
  yield {type: EventType.TEXT_MESSAGE_START, messageId: 'm2', role: 'assistant'}
  yield {type: EventType.TEXT_MESSAGE_CONTENT, messageId: 'm2', delta: 'Proving it. Loading schema + test call.'}
  yield {type: EventType.TEXT_MESSAGE_END, messageId: 'm2'}
  yield {type: EventType.TOOL_CALL_START, toolCallId: 'tc1', toolCallName: 'aidx_page', toolName: 'aidx_page'}
  yield {type: EventType.TOOL_CALL_ARGS, toolCallId: 'tc1', delta: '{"verb":"route"}'}
  yield {type: EventType.TOOL_CALL_END, toolCallId: 'tc1'}
  yield {
    type: EventType.TOOL_CALL_RESULT,
    messageId: 'r4',
    toolCallId: 'tc1',
    content: '[{"type":"text","text":"{\\"pathname\\":\\"/\\"}"}]',
  }
  yield {type: EventType.TEXT_MESSAGE_START, messageId: 'm5', role: 'assistant'}
  yield {type: EventType.TEXT_MESSAGE_CONTENT, messageId: 'm5', delta: MCP_REPLY}
  yield {type: EventType.TEXT_MESSAGE_END, messageId: 'm5'}
  yield {type: EventType.RUN_FINISHED, threadId, runId: 'aidx-run', finishReason: 'stop'}
}

// Two turns that REUSE the same message ids (t1/m2) across turns — exactly what runAgui's
// per-turn id counter produces. The second turn's text must still appear as its own reply.
const collisionState = {n: 0}
async function* collisionScript(): AsyncGenerator<StreamChunk> {
  collisionState.n += 1
  const text = `Reply turn ${collisionState.n}`
  // What chat() produces post-fix: a fresh threadId per turn AND message ids scoped to it (runAgui
  // prefixes minted ids with the threadId), so turn 2 never reuses turn 1's id and the widget
  // appends a new message instead of overwriting the earlier one.
  const threadId = `thread-${collisionState.n}-generated`
  yield {type: EventType.RUN_STARTED, threadId, runId: 'aidx-run'}
  yield {type: EventType.REASONING_MESSAGE_START, messageId: `${threadId}-t1`, role: 'reasoning'}
  yield {type: EventType.REASONING_MESSAGE_END, messageId: `${threadId}-t1`}
  yield {type: EventType.TEXT_MESSAGE_START, messageId: `${threadId}-m2`, role: 'assistant'}
  yield {type: EventType.TEXT_MESSAGE_CONTENT, messageId: `${threadId}-m2`, delta: text}
  yield {type: EventType.TEXT_MESSAGE_END, messageId: `${threadId}-m2`}
  yield {type: EventType.RUN_FINISHED, threadId, runId: 'aidx-run', finishReason: 'stop'}
}

// Which script the next POST /api/chat serves; tests set it before sending.
const chatState = {script: chatScript as () => AsyncGenerator<StreamChunk>}
// HTTP status the next compaction turn returns; tests set it (e.g. 409) to simulate a busy session.
const compactState = {status: 200}

function writeChatStream(res: ServerResponse): void {
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    'access-control-allow-origin': '*',
  })
  const sse = toServerSentEventsStream(chatState.script(), new AbortController())
  Readable.fromWeb(sse as Parameters<typeof Readable.fromWeb>[0]).pipe(res)
}

// Stream a compaction turn (held open ~700ms by compactScript) so the widget's spinner is observable.
function writeCompactStream(res: ServerResponse): void {
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    'access-control-allow-origin': '*',
  })
  const sse = toServerSentEventsStream(compactScript(), new AbortController())
  Readable.fromWeb(sse as Parameters<typeof Readable.fromWeb>[0]).pipe(res)
}

// Read a request body to a string.
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => resolve(body))
  })
}

// Read the POST body and report whether it's a compaction turn (intent rides forwardedProps/data).
function readChatIntent(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      try {
        const j = JSON.parse(body) as {intent?: string; forwardedProps?: {intent?: string}; data?: {intent?: string}}
        resolve(j.forwardedProps?.intent ?? j.data?.intent ?? j.intent ?? 'chat')
      } catch {
        resolve('chat')
      }
    })
  })
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

describe('aidx widget (it) — real browser, real SSE', () => {
  let browser: Browser
  let server: Server
  const state = {base: '', mint: 0}

  beforeAll(async () => {
    server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const url = req.url ?? ''
      // The one id-normalization seam: no id → mint a fresh aidx_ id; an aidx_ id → echo; a raw
      // harness id (an unwrapped external row) → a deterministic aidx_ wrapper (adoption). Stateful in
      // this closure, exactly like core's resolve.
      if (url.startsWith('/api/chat/session/resolve') && req.method === 'POST') {
        void readBody(req).then((body) => {
          const id = (() => {
            try {
              return (JSON.parse(body) as {id?: string}).id
            } catch {
              return undefined
            }
          })()
          if (!id) return writeJson(res, {sessionId: `aidx_new_${++state.mint}`})
          if (id.startsWith('aidx_')) return writeJson(res, {sessionId: id})
          return writeJson(res, {sessionId: `aidx_ext_${id}`})
        })
        return
      }
      // Probe → present, so the widget mounts the chat FAB + page-bus (production boot path).
      // The adopted 'Made in aidx' row resolves to aidx_ext_tok-aidx, which reports a resumable
      // session (a harness token) so ChatPanel hydrates its history. NB: exclude /sessions.
      if (url.startsWith('/api/chat/session') && !url.startsWith('/api/chat/sessions')) {
        const sid = req.headers['aidx-session-id']
        const resumable = sid === 'aidx_ext_tok-aidx'
        return writeJson(res, {
          sessionId: typeof sid === 'string' ? sid : 'aidx_unknown',
          harnessSessionId: resumable ? 'tok-aidx' : null,
          name: resumable ? 'Made in aidx' : null,
          origin: resumable ? 'external' : 'chat',
          cwd: '/app',
          lock: {held: false, role: null},
          usage: null,
          harness: {id: 'claude', name: 'Claude', canLaunch: false},
        })
      }
      if (url.startsWith('/api/chat/models')) {
        return writeJson(res, {
          models: [
            {id: 'opus', name: 'Claude Opus 4.8', description: 'Most capable', group: 'Claude'},
            {id: 'sonnet', name: 'Claude Sonnet 4.6', description: 'Balanced', group: 'Claude'},
            {id: 'haiku', name: 'Claude Haiku 4.5', description: 'Fastest', group: 'Claude'},
            {id: 'claude-fable-5', name: 'Fable 5', description: 'Disabled', group: 'Claude', disabled: true},
          ],
          defaultModel: 'sonnet',
          harness: {id: 'claude', name: 'Claude', canLaunch: false},
        })
      }
      if (url.startsWith('/api/chat/sessions/title') && req.method === 'POST') {
        void readBody(req).then((body) => {
          const title = (() => {
            try {
              return (JSON.parse(body) as {title?: string}).title ?? ''
            } catch {
              return ''
            }
          })()
          writeJson(res, {ok: true, title})
        })
        return
      }
      if (url.startsWith('/api/chat/sessions')) {
        const nowMs = Date.now()
        return writeJson(res, {
          sessions: [
            {id: 'tok-aidx', title: 'Made in aidx', updatedAt: nowMs, messageCount: 3, running: false, origin: 'aidx', usage: null},
            {id: 'tok-ext', title: 'Made externally', updatedAt: nowMs, messageCount: 2, running: false, origin: 'external', usage: null},
          ],
        })
      }
      // Per-session history keyed by our id: the adopted 'Made in aidx' session loads a thread.
      if (url.startsWith('/api/chat/history')) {
        const sid = req.headers['aidx-session-id']
        if (sid === 'aidx_ext_tok-aidx') {
          return writeJson(res, [{id: 'h1', role: 'assistant', parts: [{type: 'text', content: SWITCHED_REPLY}]}])
        }
        return writeJson(res, [])
      }
      if (url === '/api/chat' && req.method === 'POST') {
        void readChatIntent(req).then((intent) => {
          if (intent !== 'compact') return writeChatStream(res)
          if (compactState.status !== 200) {
            res.writeHead(compactState.status)
            res.end('{}')
            return
          }
          return writeCompactStream(res)
        })
        return
      }
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
        res.write(`data: ${JSON.stringify(LOCATE_QUERY)}\n\n`)
        return
      }
      if (url === '/__global-base') {
        res.writeHead(200, {'content-type': 'text/html'})
        return res.end(globalBasePageHtml(state.base))
      }
      if (url === '/__position') {
        res.writeHead(200, {'content-type': 'text/html'})
        return res.end(widgetConfigPageHtml('{"modal":{"position":"top-left"},"quickTerminal":false}'))
      }
      if (url === '/__quick-terminal') {
        res.writeHead(200, {'content-type': 'text/html'})
        return res.end(widgetConfigPageHtml('{"modal":false,"quickTerminal":{"hotkey":"Control+k"}}'))
      }
      if (url === '/__both') {
        res.writeHead(200, {'content-type': 'text/html'})
        return res.end(widgetConfigPageHtml('{"quickTerminal":{"hotkey":"Control+k"}}'))
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
    const page = await browser.newPage()
    await page.goto(state.base)

    // The FAB mounts only after the chat-availability probe resolves (production boot path).
    const fab = page.getByRole('button', {name: 'Open aidx chat'})
    await fab.waitFor({state: 'visible'})
    await fab.click()

    // Empty thread → greeting + starters.
    await page.getByText('How can I help you today?').waitFor({state: 'visible'})

    // Send a message; the scripted AG-UI stream renders the assistant text.
    const composer = page.getByLabel('Message the aidx agent')
    await composer.fill('do something')
    await composer.press('Enter')
    await page.getByText(ASSISTANT_TEXT).waitFor({state: 'visible'})

    // The same turn emits a CUSTOM aidx-ui approval spec → the gate card renders.
    await page.getByText(APPROVAL_QUESTION).waitFor({state: 'visible'})

    // Approving posts the blocking allow/deny decision back to the dev server.
    const decision = page.waitForRequest((r) => r.url().includes('/api/chat/permission-decision'))
    await page.getByRole('button', {name: 'Approve'}).click()
    const body = (await decision).postDataJSON() as {renderId: string; approved: boolean}
    expect(body.renderId).toBe('a1')
    expect(body.approved).toBe(true)
    await page.close()
  })

  it('New session: opens a fresh empty session (resolve); the prior session is preserved in a hidden pane', async () => {
    const page = await browser.newPage()
    await page.goto(state.base)
    const fab = page.getByRole('button', {name: 'Open aidx chat'})
    await fab.waitFor({state: 'visible'})
    await fab.click()
    const composer = page.getByLabel('Message the aidx agent')
    await composer.fill('do something')
    await composer.press('Enter')
    await page.getByText(ASSISTANT_TEXT).waitFor({state: 'visible'})

    // Clicking New session resolves a fresh aidx_ session and opens it as a new pane.
    const reset = page.waitForRequest((r) => r.url().endsWith('/api/chat/session/resolve') && r.method() === 'POST')
    await page.getByRole('button', {name: 'Start a new session'}).click()
    await reset

    // The fresh pane shows the greeting; the prior reply is preserved but in the now-hidden pane.
    await page.getByText('How can I help you today?').waitFor({state: 'visible'})
    expect(await page.getByText(ASSISTANT_TEXT).isVisible()).toBe(false)
    await page.close()
  })

  it('Compress: marks a boundary and sends a compaction turn (intent rides the AG-UI envelope)', async () => {
    const page = await browser.newPage()
    await page.goto(state.base)
    const fab = page.getByRole('button', {name: 'Open aidx chat'})
    await fab.waitFor({state: 'visible'})
    await fab.click()
    const composer = page.getByLabel('Message the aidx agent')
    await composer.fill('do something')
    await composer.press('Enter')
    await page.getByText(ASSISTANT_TEXT).waitFor({state: 'visible'})

    // The compaction turn carries intent:'compact' — nested on forwardedProps/data like model, the
    // exact spot @aidx/core's turn route reads. The predicate skips the first (plain) send.
    const compactReq = page.waitForRequest((r) => {
      if (!r.url().endsWith('/api/chat') || r.method() !== 'POST') return false
      const b = r.postDataJSON() as {forwardedProps?: {intent?: string}; data?: {intent?: string}}
      return (b.forwardedProps?.intent ?? b.data?.intent) === 'compact'
    })
    await page.getByRole('button', {name: 'Compress the conversation'}).click()
    await compactReq

    // While the turn is in flight (server holds the stream ~700ms): the Send button is replaced by the
    // Ark progress spinner AND the divider reads "Compacting…" (NOT a premature "Context compacted").
    await page.locator('.pw-compact').waitFor({state: 'visible'})
    expect(await page.locator('.pw-compact-range').count()).toBe(1)
    await page.locator('.pw-chat-divider', {hasText: 'Compacting'}).waitFor({state: 'visible'})

    // Once it completes: the spinner goes away and the same divider flips to "Context compacted".
    await page.locator('.pw-compact').waitFor({state: 'hidden'})
    await page.locator('.pw-chat-divider', {hasText: 'Context compacted'}).waitFor({state: 'visible'})

    // Claude-Code parity: the compaction turn runs out of band, so the thread shows ONLY the divider —
    // no '/compact' command bubble and no streamed summary (the assistant reply count stays at 1, from
    // the first turn; the compact stream is drained and discarded).
    expect(await page.getByText('/compact').count()).toBe(0)
    expect(await page.getByText(ASSISTANT_TEXT).count()).toBe(1)
    await page.close()
  })

  it('Compress on a busy session (409) removes the boundary instead of claiming success', async () => {
    compactState.status = 409
    try {
      const page = await browser.newPage()
      await page.goto(state.base)
      const fab = page.getByRole('button', {name: 'Open aidx chat'})
      await fab.waitFor({state: 'visible'})
      await fab.click()
      const composer = page.getByLabel('Message the aidx agent')
      await composer.fill('do something')
      await composer.press('Enter')
      await page.getByText(ASSISTANT_TEXT).waitFor({state: 'visible'})

      const compactReq = page.waitForResponse((r) => r.url().endsWith('/api/chat') && r.status() === 409)
      await page.getByRole('button', {name: 'Compress the conversation'}).click()
      await compactReq

      // The 409 settles: the optimistic boundary is REMOVED, never flipping to "Context compacted".
      // (The fast-fail path adds then removes the divider in ms, so the transient "Compacting" state is
      // not asserted — the regression is that the false "Context compacted" must never appear.)
      await page.locator('.pw-chat-divider', {hasText: 'Compacting'}).waitFor({state: 'hidden'})
      expect(await page.locator('.pw-chat-divider', {hasText: 'Context compacted'}).count()).toBe(0)
      // Scrollback intact: the prior assistant reply is still present.
      expect(await page.getByText(ASSISTANT_TEXT).count()).toBe(1)
      await page.close()
    } finally {
      compactState.status = 200
    }
  })

  it('renders the context tracker from a streamed aidx-usage event and shows the breakdown on hover', async () => {
    const page = await browser.newPage()
    await page.goto(state.base)
    const fab = page.getByRole('button', {name: 'Open aidx chat'})
    await fab.waitFor({state: 'visible'})
    await fab.click()
    const composer = page.getByLabel('Message the aidx agent')
    await composer.fill('do something')
    await composer.press('Enter')
    await page.getByText(ASSISTANT_TEXT).waitFor({state: 'visible'})

    // The streamed usage snapshot drives the ring: 35,895 / 1,000,000 ≈ 3.6%.
    const trigger = page.locator('.pw-ctx-trigger')
    await trigger.waitFor({state: 'visible'})
    await page.getByText('3.6%').first().waitFor({state: 'visible'})

    // Hovering opens the top-layer popover with the cost footer.
    await trigger.hover()
    await page.getByText('Total cost').waitFor({state: 'visible'})
    const footText = await page.locator('.pw-ctx-foot').textContent()
    expect(footText).toContain('$0.12')
    await page.close()
  })

  it('places the FAB by config and snaps to the nearest preset after a drag', async () => {
    const page = await browser.newPage()
    await page.setViewportSize({width: 1000, height: 800})
    await page.goto(`${state.base}/__position`)

    const fab = page.getByRole('button', {name: 'Open aidx chat'})
    await fab.waitFor({state: 'visible'})
    // The configured position is applied via the preset class.
    expect(await fab.getAttribute('class')).toContain('pw-fab-pos-top-left')

    // Drag the FAB from the top-left toward the bottom-right corner.
    const box = await fab.boundingBox()
    if (!box) throw new Error('no FAB box')
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(960, 770, {steps: 10})
    await page.mouse.up()

    // After the snap animation it commits the nearest preset and persists it.
    await page.waitForFunction(
      () => localStorage.getItem('aidx-fab-position') === 'bottom-right',
      undefined,
      {timeout: 2000},
    )
    expect(await fab.getAttribute('class')).toContain('pw-fab-pos-bottom-right')
    await page.close()
  })

  it('resizes the modal panel by edge drag, persists the height, and collapses below threshold', async () => {
    const page = await browser.newPage()
    await page.setViewportSize({width: 1000, height: 800})
    await page.goto(state.base)
    const fab = page.getByRole('button', {name: 'Open aidx chat'})
    await fab.waitFor({state: 'visible'})
    await fab.click()
    // Let the open animation settle so the handle's box is stable before we grab it.
    await page.getByText('How can I help you today?').waitFor({state: 'visible'})
    await page.waitForTimeout(300)

    const panel = page.locator('#pw-chat-panel')
    const before = (await panel.boundingBox())!.height
    // Bottom-anchored panel → the resize handle sits on its top edge; dragging up grows it.
    const handle = page.locator('.pw-chat-resize-top')
    const hb = (await handle.boundingBox())!
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2)
    await page.mouse.down()
    await page.mouse.move(hb.x + hb.width / 2, hb.y - 120, {steps: 8})
    await page.mouse.up()
    const after = (await panel.boundingBox())!.height
    expect(after).toBeGreaterThan(before + 80)
    expect(Number(await page.evaluate(() => localStorage.getItem('aidx-modal-height')))).toBeGreaterThan(before)

    // Dragging the edge far past the collapse threshold closes the panel (Devtools behavior).
    const hb2 = (await page.locator('.pw-chat-resize-top').boundingBox())!
    await page.mouse.move(hb2.x + hb2.width / 2, hb2.y + hb2.height / 2)
    await page.mouse.down()
    await page.mouse.move(hb2.x + hb2.width / 2, hb2.y + 700, {steps: 10})
    await page.mouse.up()
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-aidx-root]')
          ?.shadowRoot?.querySelector('#pw-chat-panel')
          ?.getAttribute('aria-hidden') === 'true',
      undefined,
      {timeout: 2000},
    )
    await page.close()
  })

  it('resizes the modal panel horizontally by dragging the side edge, and persists the width', async () => {
    const page = await browser.newPage()
    await page.setViewportSize({width: 1000, height: 800})
    await page.goto(state.base)
    const fab = page.getByRole('button', {name: 'Open aidx chat'})
    await fab.waitFor({state: 'visible'})
    await fab.click()
    await page.getByText('How can I help you today?').waitFor({state: 'visible'})
    await page.waitForTimeout(300)

    const panel = page.locator('#pw-chat-panel')
    const before = (await panel.boundingBox())!.width
    // Bottom-right anchored panel → the width handle is on its left edge; dragging left grows it.
    const handle = page.locator('.pw-chat-resize-left')
    const hb = (await handle.boundingBox())!
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2)
    await page.mouse.down()
    await page.mouse.move(hb.x - 140, hb.y + hb.height / 2, {steps: 8})
    await page.mouse.up()
    const after = (await panel.boundingBox())!.width
    expect(after).toBeGreaterThan(before + 80)
    expect(Number(await page.evaluate(() => localStorage.getItem('aidx-modal-width')))).toBeGreaterThan(before)
    await page.close()
  })

  it('resizes the modal panel from the keyboard via the resize separator', async () => {
    const page = await browser.newPage()
    await page.setViewportSize({width: 1000, height: 800})
    await page.goto(state.base)
    const fab = page.getByRole('button', {name: 'Open aidx chat'})
    await fab.waitFor({state: 'visible'})
    await fab.click()
    await page.getByText('How can I help you today?').waitFor({state: 'visible'})
    await page.waitForTimeout(300)

    const panel = page.locator('#pw-chat-panel')
    const before = (await panel.boundingBox())!.height
    // The height separator is keyboard-operable; bottom-anchored panel grows 'up' on ArrowUp (24px/step).
    const sep = page.getByRole('separator', {name: 'Resize chat height'})
    await sep.focus()
    await sep.press('ArrowUp')
    await sep.press('ArrowUp')
    await sep.press('ArrowUp')
    const after = (await panel.boundingBox())!.height
    expect(after).toBeGreaterThan(before + 60)
    await page.close()
  })

  // Reads aria-hidden of a shadow-DOM element by selector (the widget lives in an open shadow root).
  const ariaHiddenOf = (sel: string) => `(() => document.querySelector('[data-aidx-root]')?.shadowRoot?.querySelector('${sel}')?.getAttribute('aria-hidden'))()`

  it('drops the quick terminal on its hotkey and closes on Escape', async () => {
    const page = await browser.newPage()
    await page.goto(`${state.base}/__quick-terminal`)

    const sheet = page.locator('.pw-qt')
    await sheet.waitFor({state: 'attached'})
    expect(await sheet.getAttribute('aria-hidden')).toBe('true')

    // The configured hotkey drops the sheet.
    await page.keyboard.press('Control+k')
    await page.waitForFunction(`${ariaHiddenOf('.pw-qt')} === 'false'`, undefined, {timeout: 2000})
    await page.getByText('How can I help you today?').waitFor({state: 'visible'})

    // Opening focuses the pane's composer.
    await page.waitForFunction(
      () => {
        const ae = document.querySelector('[data-aidx-root]')?.shadowRoot?.activeElement
        return ae?.tagName === 'TEXTAREA' && ae.classList.contains('pw-chat-input')
      },
      undefined,
      {timeout: 2000},
    )

    // Escape raises it again.
    await page.keyboard.press('Escape')
    await page.waitForFunction(`${ariaHiddenOf('.pw-qt')} === 'true'`, undefined, {timeout: 2000})

    // Closed, the off-screen sheet is inert so its composer/buttons leave the tab order
    // (and don't trip the aria-hidden-focus rule).
    const closedInert = await page.evaluate(
      () => (document.querySelector('[data-aidx-root]')?.shadowRoot?.querySelector('.pw-qt') as HTMLElement)?.inert,
    )
    expect(closedInert).toBe(true)
    await page.close()
  })

  it('restores focus to the last-active pane on reopen (persisted)', async () => {
    const page = await browser.newPage()
    await page.goto(`${state.base}/__quick-terminal`)
    await page.locator('.pw-qt').waitFor({state: 'attached'})
    await page.keyboard.press('Control+k')
    await page.waitForFunction(`${ariaHiddenOf('.pw-qt')} === 'false'`, undefined, {timeout: 2000})

    // Split into two panes, then focus the FIRST pane (the second is focused right after split).
    await page.getByRole('button', {name: 'Split pane'}).click()
    await page.waitForFunction(`${countOf('.pw-qt-pane')} === 2`, undefined, {timeout: 2000})
    await page.locator('.pw-qt-pane').first().dispatchEvent('pointerdown')
    await page.waitForFunction(
      () => document.querySelector('[data-aidx-root]')?.shadowRoot?.querySelector('.pw-qt-pane')?.classList.contains('focused') === true,
      undefined,
      {timeout: 2000},
    )

    // Close and reopen — focus returns to the first pane (index 0 persisted).
    await page.keyboard.press('Escape')
    await page.waitForFunction(`${ariaHiddenOf('.pw-qt')} === 'true'`, undefined, {timeout: 2000})
    await page.keyboard.press('Control+k')
    await page.waitForFunction(`${ariaHiddenOf('.pw-qt')} === 'false'`, undefined, {timeout: 2000})
    await page.waitForFunction(
      () => document.querySelector('[data-aidx-root]')?.shadowRoot?.querySelector('.pw-qt-pane')?.classList.contains('focused') === true,
      undefined,
      {timeout: 2000},
    )
    await page.close()
  })

  it('opening the quick terminal closes the modal (one layer at a time)', async () => {
    const page = await browser.newPage()
    await page.goto(`${state.base}/__both`)

    const fab = page.getByRole('button', {name: 'Open aidx chat'})
    await fab.waitFor({state: 'visible'})
    await fab.click()
    await page.waitForFunction(`${ariaHiddenOf('#pw-chat-panel')} === 'false'`, undefined, {timeout: 2000})

    // The hotkey opens the quick terminal and closes the modal.
    await page.keyboard.press('Control+k')
    await page.waitForFunction(`${ariaHiddenOf('.pw-qt')} === 'false'`, undefined, {timeout: 2000})
    await page.waitForFunction(`${ariaHiddenOf('#pw-chat-panel')} === 'true'`, undefined, {timeout: 2000})
    await page.close()
  })

  // Count of shadow-DOM elements matching a selector (the widget lives in an open shadow root).
  const countOf = (sel: string) =>
    `(() => document.querySelector('[data-aidx-root]')?.shadowRoot?.querySelectorAll('${sel}').length)()`

  it('pops the quick terminal into a PiP window (styles travel) and re-docks on close', async () => {
    const page = await browser.newPage()
    await page.goto(`${state.base}/__quick-terminal`)
    await page.locator('.pw-qt').waitFor({state: 'attached'})
    await page.keyboard.press('Control+k')
    await page.waitForFunction(`${ariaHiddenOf('.pw-qt')} === 'false'`, undefined, {timeout: 2000})

    // Clicking PiP opens a separate window and moves the live sheet into it.
    const [popup] = await Promise.all([
      page.waitForEvent('popup'),
      page.getByRole('button', {name: 'Pop out to a window'}).click(),
    ])
    await popup.waitForLoadState()
    // The sheet now lives in the PiP window's shadow root, and its styles came along (system-ui,
    // not the serif initial) — proving the shadow style text travelled.
    const inPip = await popup.evaluate(() => {
      const qt = document.querySelector('.pw-pip-host')?.shadowRoot?.querySelector('.pw-qt')
      return {present: !!qt, font: qt ? getComputedStyle(qt as Element).fontFamily : ''}
    })
    expect(inPip.present).toBe(true)
    expect(inPip.font).toContain('system-ui')
    // It left a placeholder in the page (no .pw-qt there while popped).
    expect(await page.evaluate(countOf('.pw-qt'))).toBe(0)

    // Closing the PiP window re-docks the sheet into the page.
    await popup.close()
    await page.waitForFunction(`${countOf('.pw-qt')} === 1`, undefined, {timeout: 2000})
    await page.close()
  })

  it('splits the quick terminal into independent-session panes and reflows on close', async () => {
    const page = await browser.newPage()
    await page.goto(`${state.base}/__quick-terminal`)
    await page.locator('.pw-qt').waitFor({state: 'attached'})
    await page.keyboard.press('Control+k')
    await page.waitForFunction(`${ariaHiddenOf('.pw-qt')} === 'false'`, undefined, {timeout: 2000})

    // One pane on open.
    await page.waitForFunction(`${countOf('.pw-qt-pane')} === 1`, undefined, {timeout: 2000})

    // Split adds a second pane, each with its own composer (its own session).
    await page.getByRole('button', {name: 'Split pane'}).click()
    await page.waitForFunction(`${countOf('.pw-qt-pane')} === 2`, undefined, {timeout: 2000})
    expect(await page.locator('.pw-qt-pane .pw-chat-input').count()).toBe(2)

    // Each pane bar hosts its own session selector (bar variant).
    expect(await page.locator('.pw-qt-pane .pw-session-bar').count()).toBe(2)

    // Closing one pane leaves the other (reflowed).
    await page.locator('.pw-qt-pane-x').first().click()
    await page.waitForFunction(`${countOf('.pw-qt-pane')} === 1`, undefined, {timeout: 2000})

    // Closing the last pane closes the terminal.
    await page.locator('.pw-qt-pane-x').first().click()
    await page.waitForFunction(`${ariaHiddenOf('.pw-qt')} === 'true'`, undefined, {timeout: 2000})
    await page.close()
  })

  it('renders the assistant reply for a chat() stream (generated threadId, empty reasoning, MCP tools)', async () => {
    chatState.script = mcpAccessScript
    try {
      const page = await browser.newPage()
      await page.goto(state.base)
      const fab = page.getByRole('button', {name: 'Open aidx chat'})
      await fab.waitFor({state: 'visible'})
      await fab.click()
      await page.getByText('How can I help you today?').waitFor({state: 'visible'})
      const composer = page.getByLabel('Message the aidx agent')
      await composer.fill('do you have access to aidx mcp?')
      await composer.press('Enter')
      await page.getByText(MCP_REPLY).waitFor({state: 'visible', timeout: 10_000})
      await page.close()
    } finally {
      chatState.script = chatScript
    }
  })

  it('renders a SECOND turn whose message ids collide with the first turn (runAgui resets ids)', async () => {
    chatState.script = collisionScript
    collisionState.n = 0
    try {
      const page = await browser.newPage()
      await page.goto(state.base)
      const fab = page.getByRole('button', {name: 'Open aidx chat'})
      await fab.waitFor({state: 'visible'})
      await fab.click()
      await page.getByText('How can I help you today?').waitFor({state: 'visible'})
      const composer = page.getByLabel('Message the aidx agent')
      await composer.fill('first question')
      await composer.press('Enter')
      await page.getByText('Reply turn 1').waitFor({state: 'visible', timeout: 10_000})
      await composer.fill('second question')
      await composer.press('Enter')
      await page.getByText('Reply turn 2').waitFor({state: 'visible', timeout: 10_000})
      // Turn 2 must NOT overwrite turn 1: both replies coexist as distinct messages.
      expect(await page.getByText('Reply turn 1').count()).toBe(1)
      expect(await page.getByText('Reply turn 2').count()).toBe(1)
      await page.close()
    } finally {
      chatState.script = chatScript
    }
  })


  it('model selector: picking a model closes the popover and never collapses the list to the chosen one', async () => {
    const page = await browser.newPage()
    await page.goto(state.base)
    const fab = page.getByRole('button', {name: 'Open aidx chat'})
    await fab.waitFor({state: 'visible'})
    await fab.click()
    await page.getByText('How can I help you today?').waitFor({state: 'visible'})

    // The pill shows the default model (sonnet) from /api/chat/models.
    const trigger = page.getByRole('button', {name: 'Select model'})
    await trigger.waitFor({state: 'visible'})
    expect(await trigger.textContent()).toContain('Claude Sonnet 4.6')

    // Open it → all four models listed (Fable disabled but present).
    await trigger.click()
    const content = page.locator('.pw-model-content')
    await content.waitFor({state: 'visible'})
    expect(await content.locator('.pw-model-item').count()).toBe(4)

    // Pick Opus.
    await content.getByText('Claude Opus 4.8', {exact: true}).click()

    // The pill reflects the pick.
    await page.waitForFunction(
      () => {
        const t = document
          .querySelector('[data-aidx-root]')
          ?.shadowRoot?.querySelector('.pw-model-trigger')
        return (t?.textContent ?? '').includes('Claude Opus 4.8')
      },
      undefined,
      {timeout: 3000},
    )

    // THE BUG: selecting echoed the model name into the search box, filtering the open list down to
    // just the picked row. Correct behavior is the popover CLOSES on select. This fails on the bug.
    await content.waitFor({state: 'hidden', timeout: 3000})

    // Send NOW, right after the popover closed on select — a clean state with focus free. (Dismissing
    // a REOPENED popover via Escape/outside-click is unreliable in this shadow-DOM Ark setup and left
    // the combobox holding focus, so the send must not depend on it.) The chosen model rides the next
    // turn's POST body; TanStack AI nests connection-body fields on the AG-UI envelope (forwardedProps
    // /data) — the exact spot @aidx/core's chat route reads.
    const composer = page.getByLabel('Message the aidx agent')
    const chatReq = page.waitForRequest((r) => r.url().endsWith('/api/chat') && r.method() === 'POST')
    await composer.fill('hi')
    await composer.press('Enter')
    const sent = (await chatReq).postDataJSON() as {forwardedProps?: {model?: string}; data?: {model?: string}}
    expect(sent.forwardedProps?.model ?? sent.data?.model).toBe('opus')

    // Reopen → the full list is back (filter reset on close, nothing removed). Done last because it
    // leaves the popover open; the page is closed right after.
    await trigger.click()
    await content.waitFor({state: 'visible'})
    expect(await content.locator('.pw-model-item').count()).toBe(4)
    await page.close()
  })

  it('session selector: lists rows, marks aidx origin, switches by header, renames optimistically', async () => {
    const page = await browser.newPage()
    await page.goto(state.base)
    const fab = page.getByRole('button', {name: 'Open aidx chat'})
    await fab.waitFor({state: 'visible'})
    await fab.click()
    await page.getByText('How can I help you today?').waitFor({state: 'visible'})

    // Open the selector pill in the modal header.
    const trigger = page.locator('#pw-chat-panel .pw-session-trigger')
    await trigger.click()
    const content = page.locator('.pw-session-content')
    await content.waitFor({state: 'visible'})

    // Both scripted rows render; the aidx row shows the origin marker, the external one does not.
    const aidxItem = content.locator('.pw-session-item', {hasText: 'Made in aidx'})
    const extItem = content.locator('.pw-session-item', {hasText: 'Made externally'})
    await aidxItem.waitFor({state: 'visible'})
    await extItem.waitFor({state: 'visible'})
    expect(await aidxItem.locator('.pw-session-origin').count()).toBe(1)
    expect(await extItem.locator('.pw-session-origin').count()).toBe(0)

    // Selecting tok-aidx fires a /history fetch carrying the new header; the thread swaps in.
    const historyReq = page.waitForRequest(
      (r) => r.url().includes('/api/chat/history') && r.headers()['aidx-session-id'] === 'aidx_ext_tok-aidx',
    )
    await aidxItem.click()
    await historyReq
    await page.getByText(SWITCHED_REPLY).waitFor({state: 'visible'})

    // Reopen, rename the now-active session — the optimistic title shows on the trigger immediately.
    await trigger.click()
    await content.waitFor({state: 'visible'})
    await content.getByRole('button', {name: 'Rename current session'}).click()
    const rename = page.locator('.pw-session-rename')
    await rename.waitFor({state: 'visible'})
    await rename.fill('Renamed thread')
    await rename.press('Enter')
    await page.waitForFunction(
      () => {
        const t = document.querySelector('[data-aidx-root]')?.shadowRoot?.querySelector('#pw-chat-panel .pw-session-current')
        return (t?.textContent ?? '').includes('Renamed thread')
      },
      undefined,
      {timeout: 3000},
    )
    await page.close()
  })

  it('session selector: restores the active session across a page reload', async () => {
    const page = await browser.newPage()
    await page.goto(state.base)
    const fab = page.getByRole('button', {name: 'Open aidx chat'})
    await fab.waitFor({state: 'visible'})
    await fab.click()
    await page.getByText('How can I help you today?').waitFor({state: 'visible'})

    // Switch to the aidx session — this is the choice that must survive a refresh.
    const trigger = page.locator('#pw-chat-panel .pw-session-trigger')
    await trigger.click()
    const content = page.locator('.pw-session-content')
    await content.waitFor({state: 'visible'})
    const historyReq = page.waitForRequest(
      (r) => r.url().includes('/api/chat/history') && r.headers()['aidx-session-id'] === 'aidx_ext_tok-aidx',
    )
    await content.locator('.pw-session-item', {hasText: 'Made in aidx'}).click()
    await historyReq
    await page.getByText(SWITCHED_REPLY).waitFor({state: 'visible'})

    // Reload: the modal must reopen to the SAME session, not fall back to "New session".
    await page.reload()
    await fab.waitFor({state: 'visible'})
    await fab.click()
    await page.waitForFunction(
      () => {
        const t = document.querySelector('[data-aidx-root]')?.shadowRoot?.querySelector('#pw-chat-panel .pw-session-current')
        return (t?.textContent ?? '').includes('Made in aidx')
      },
      undefined,
      {timeout: 4000},
    )
    // The restored session also re-hydrates its own thread.
    await page.getByText(SWITCHED_REPLY).waitFor({state: 'visible'})
    await page.close()
  })

  it('renders the live vitest card: pass/fail tree, expands the failure with actions', async () => {
    const page = await browser.newPage()
    await page.goto(state.base)
    // The test-only seam mounts a standalone live card (result=null → subscribes to the stream).
    await page.waitForFunction(() => '__AIDX_RENDER_TEST_CARD__' in window)
    await page.evaluate(() => {
      const w = window as unknown as {__AIDX_RENDER_TEST_CARD__?: () => void}
      w.__AIDX_RENDER_TEST_CARD__?.()
    })

    await page.getByText('1 failed').waitFor({state: 'visible'})
    await page.getByText(FAILING_TEST).click()
    await page.getByText(FAILURE_MESSAGE).waitFor({state: 'visible'})
    await page.getByRole('button', {name: /Fix this/}).waitFor({state: 'visible'})
    await page.getByRole('button', {name: /auth\.test\.ts:42/}).waitFor({state: 'visible'})
    await page.close()
  })

  it('uses window.__AIDX_API_BASE__ over the meta tag (Next.js injection path)', async () => {
    const page = await browser.newPage()
    await page.goto(`${state.base}/__global-base`)
    // The meta base is a dead host; the FAB only mounts if the probe used the window global.
    await page.getByRole('button', {name: 'Open aidx chat'}).waitFor({state: 'visible'})
    await page.close()
  })

  const replyFor = (id: string) => (r: {url(): string; postData(): string | null}) => {
    if (!r.url().includes('/api/page/reply')) return false
    try {
      return (JSON.parse(r.postData() ?? '{}') as {requestId?: string}).requestId === id
    } catch {
      return false
    }
  }

  it('answers a page-bus query against the live DOM and posts the reply', async () => {
    const page = await browser.newPage()
    const reply = page.waitForRequest(replyFor('pb1'))
    await page.goto(state.base)
    const body = (await reply).postDataJSON() as {requestId: string; data: {text?: string}}
    expect(body.data.text).toBe('page-bus-ok')
    await page.close()
  })

  it('routes a locate verb to the bippy bridge and degrades gracefully on a non-React node', async () => {
    const page = await browser.newPage()
    const reply = page.waitForRequest(replyFor('pbL'))
    await page.goto(state.base)
    const body = (await reply).postDataJSON() as {requestId: string; data: {error?: string}}
    expect(body.data.error).toContain('no React fiber')
    await page.close()
  })
})
