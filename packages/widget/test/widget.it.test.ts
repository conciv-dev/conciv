// /api/* routes the widget speaks: the chat-availability probe, a scripted AG-UI chat stream

import {createServer, type IncomingMessage, type Server, type ServerResponse} from 'node:http'
import type {AddressInfo} from 'node:net'
import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {chromium, type Browser, type Page} from 'playwright'
import {EventType, type StreamChunk} from '@tanstack/ai'
import {aguiApprovalRequestedFor} from '@conciv/protocol/ui-types'
import {aguiUsageFor, snapshotToTokenUsage} from '@conciv/protocol/usage-types'
import {widgetBundle, readBody} from './it-fixture.js'
import {createAttachChat, type ChatPostBody} from './helpers/attach-chat.js'

const ASSISTANT_TEXT = 'Hello from aidx'
const SWITCHED_REPLY = 'Reply from the switched session'
const RISKY_COMMAND = 'rm -rf /tmp/scratch'
const APPROVAL_ID = 'a1'
const APPROVE_CALL_ID = 'tc-approve'
const PAGE_QUERY = {requestId: 'pb1', kind: 'text', selector: '#probe'}

const LOCATE_QUERY = {requestId: 'pbL', kind: 'locate', selector: '#probe'}

function pageHtml(): string {
  return `<!doctype html><html><head>
    <meta name="pw-api-base" content="">
    <meta name="pw-widget" content='{"quickTerminal":false}'>
    <style>
      /* Host reset zeroing heading margins: a leaky capture would skip these and let our shadow DOM's UA sheet repaint them. */
      *, ::before, ::after { box-sizing: border-box; }
      h1, h2, h3, h4, h5, h6 { margin: 0; }
      #grab-target { width: 220px; padding: 16px; border-radius: 12px; color: rgb(255, 255, 255);
        background: rgb(91, 58, 166); box-shadow: 0 10px 20px rgba(0,0,0,.4); font-weight: 700;
        font-size: 16px; }
      #grab-target::before { content: "PRO"; display: block; font-size: 11px; opacity: .7; }
      /* font-size deliberately equals the card's, so a diff-against-default capture would skip it. */
      #grab-target h3 { font-size: 16px; }
      #grab-target p { font-size: 13px; margin: 0; }
    </style>
  </head><body>
    <div id="probe">page-bus-ok</div>
    <div id="grab-target"><h3>Upgrade plan</h3><p>Unlock every feature today.</p></div>
    <script>${widgetBundle}</script>
  </body></html>`
}

function widgetConfigPageHtml(widgetJson: string): string {
  return `<!doctype html><html><head>
    <meta name="pw-api-base" content="">
    <meta name="pw-widget" content='${widgetJson}'>
  </head><body>
    <div id="probe">page-bus-ok</div>
    <script>${widgetBundle}</script>
  </body></html>`
}

function globalBasePageHtml(globalBase: string): string {
  return `<!doctype html><html><head>
    <meta name="pw-api-base" content="http://127.0.0.1:1">
    <meta name="pw-widget" content='{"quickTerminal":false}'>
    <script>window.__CONCIV_API_BASE__ = ${JSON.stringify(globalBase)}</script>
  </head><body>
    <script>${widgetBundle}</script>
  </body></html>`
}

async function* chatScript(): AsyncGenerator<StreamChunk> {
  yield {type: EventType.RUN_STARTED, threadId: 't', runId: 'r'}

  yield aguiUsageFor({
    modelId: 'claude-opus-4-8[1m]',
    contextWindow: 1000000,
    inputTokens: 18151,
    cacheReadTokens: 15832,
    cacheWriteTokens: 1912,
  })
  yield {type: EventType.TEXT_MESSAGE_START, messageId: 'm1', role: 'assistant'}
  yield {type: EventType.TEXT_MESSAGE_CONTENT, messageId: 'm1', delta: ASSISTANT_TEXT}
  yield {type: EventType.TEXT_MESSAGE_END, messageId: 'm1'}
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

async function* approvalScript(): AsyncGenerator<StreamChunk> {
  yield {type: EventType.RUN_STARTED, threadId: 't', runId: 'r'}
  yield {type: EventType.TEXT_MESSAGE_START, messageId: 'm1', role: 'assistant'}
  yield {type: EventType.TEXT_MESSAGE_CONTENT, messageId: 'm1', delta: ASSISTANT_TEXT}
  yield {type: EventType.TEXT_MESSAGE_END, messageId: 'm1'}
  yield {type: EventType.TOOL_CALL_START, toolCallId: APPROVE_CALL_ID, toolCallName: 'Bash', toolName: 'Bash'}
  yield {type: EventType.TOOL_CALL_ARGS, toolCallId: APPROVE_CALL_ID, delta: JSON.stringify({command: RISKY_COMMAND})}
  yield {type: EventType.TOOL_CALL_END, toolCallId: APPROVE_CALL_ID}
  yield aguiApprovalRequestedFor({
    toolCallId: APPROVE_CALL_ID,
    toolName: 'Bash',
    input: {command: RISKY_COMMAND},
    approvalId: APPROVAL_ID,
  })
  await new Promise((resolve) => setTimeout(resolve, 900))
  yield {type: EventType.RUN_FINISHED, threadId: 't', runId: 'r', finishReason: 'stop'}
}

async function* compactScript(): AsyncGenerator<StreamChunk> {
  yield {type: EventType.RUN_STARTED, threadId: 't', runId: 'rc'}
  await new Promise((resolve) => setTimeout(resolve, 700))
  yield {type: EventType.RUN_FINISHED, threadId: 't', runId: 'rc', finishReason: 'stop'}
}

const MCP_REPLY = 'MCP reply is visible'

async function* mcpAccessScript(): AsyncGenerator<StreamChunk> {
  const threadId = 'thread-1781448888530-xl65usg'
  yield {type: EventType.RUN_STARTED, threadId, runId: 'aidx-run'}
  yield {type: EventType.REASONING_MESSAGE_START, messageId: 't1', role: 'reasoning'}
  yield {type: EventType.REASONING_MESSAGE_END, messageId: 't1'}
  yield {type: EventType.TEXT_MESSAGE_START, messageId: 'm2', role: 'assistant'}
  yield {type: EventType.TEXT_MESSAGE_CONTENT, messageId: 'm2', delta: 'Proving it. Loading schema + test call.'}
  yield {type: EventType.TEXT_MESSAGE_END, messageId: 'm2'}
  yield {type: EventType.TOOL_CALL_START, toolCallId: 'tc1', toolCallName: 'conciv_page', toolName: 'conciv_page'}
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

const collisionState = {n: 0}
async function* collisionScript(): AsyncGenerator<StreamChunk> {
  collisionState.n += 1
  const text = `Reply turn ${collisionState.n}`

  const threadId = `thread-${collisionState.n}-generated`
  yield {type: EventType.RUN_STARTED, threadId, runId: 'aidx-run'}
  yield {type: EventType.REASONING_MESSAGE_START, messageId: `${threadId}-t1`, role: 'reasoning'}
  yield {type: EventType.REASONING_MESSAGE_END, messageId: `${threadId}-t1`}
  yield {type: EventType.TEXT_MESSAGE_START, messageId: `${threadId}-m2`, role: 'assistant'}
  yield {type: EventType.TEXT_MESSAGE_CONTENT, messageId: `${threadId}-m2`, delta: text}
  yield {type: EventType.TEXT_MESSAGE_END, messageId: `${threadId}-m2`}
  yield {type: EventType.RUN_FINISHED, threadId, runId: 'aidx-run', finishReason: 'stop'}
}

const chatState = {script: chatScript as () => AsyncGenerator<StreamChunk>}

const compactState = {status: 200}

const SWITCHED_MESSAGE = {id: 'h1', role: 'assistant', parts: [{type: 'text', content: SWITCHED_REPLY}]}

const chat = createAttachChat({
  runFor: (_sessionId, body) => (chatIntent(body) === 'compact' ? compactScript : chatState.script),
  seed: (sessionId) => (sessionId === 'conciv_ext_tok-aidx' ? [SWITCHED_MESSAGE] : []),
})

function chatIntent(body: ChatPostBody): unknown {
  return body.forwardedProps?.intent ?? body.data?.intent
}

function parseBody(body: string): ChatPostBody {
  try {
    return JSON.parse(body) as ChatPostBody
  } catch {
    return {}
  }
}

function sessionIdOf(req: IncomingMessage): string {
  const header = req.headers['conciv-session-id']
  return typeof header === 'string' ? header : 'conciv_unknown'
}

function writeSse(res: ServerResponse): void {
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    'access-control-allow-origin': '*',
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
        void readBody(req).then((body) => {
          const id = (() => {
            try {
              return (JSON.parse(body) as {id?: string}).id
            } catch {
              return undefined
            }
          })()
          if (!id) return writeJson(res, {sessionId: `conciv_new_${++state.mint}`})
          if (id.startsWith('conciv_')) return writeJson(res, {sessionId: id})
          return writeJson(res, {sessionId: `conciv_ext_${id}`})
        })
        return
      }

      if (url.startsWith('/api/chat/session') && !url.startsWith('/api/chat/sessions')) {
        const sid = req.headers['conciv-session-id']
        const resumable = sid === 'conciv_ext_tok-aidx'
        return writeJson(res, {
          sessionId: typeof sid === 'string' ? sid : 'conciv_unknown',
          harnessSessionId: resumable ? 'tok-aidx' : null,
          name: resumable ? 'Made in conciv' : null,
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
            {
              id: 'tok-aidx',
              title: 'Made in conciv',
              updatedAt: nowMs,
              messageCount: 3,
              running: false,
              origin: 'conciv',
              usage: null,
            },
            {
              id: 'tok-ext',
              title: 'Made externally',
              updatedAt: nowMs,
              messageCount: 2,
              running: false,
              origin: 'external',
              usage: null,
            },
          ],
        })
      }

      if (url.startsWith('/api/chat/history')) {
        const sid = req.headers['conciv-session-id']
        if (sid === 'conciv_ext_tok-aidx') {
          return writeJson(res, [{id: 'h1', role: 'assistant', parts: [{type: 'text', content: SWITCHED_REPLY}]}])
        }
        return writeJson(res, [])
      }
      if (url === '/api/chat' && req.method === 'POST') {
        void readBody(req).then((raw) => {
          const body = parseBody(raw)
          if (chatIntent(body) === 'compact' && compactState.status !== 200) {
            res.writeHead(compactState.status)
            res.end('{}')
            return
          }
          chat.postChat(sessionIdOf(req), body)
          writeJson(res, {ok: true})
        })
        return
      }
      if (url === '/api/chat/attach') {
        writeSse(res)
        chat.openAttach(sessionIdOf(req), res)
        return
      }
      if (url === '/api/chat/permission-decision') return writeJson(res, {ok: true})
      if (url === '/api/editor/open') return writeJson(res, {ok: true})
      if (url === '/api/page/reply') return writeJson(res, {ok: true})

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

  it('streams a reply, renders a tool card, and approves via the NATIVE part.approval flow', async () => {
    chatState.script = approvalScript
    try {
      const page = await newPage()
      await page.goto(state.base)

      const fab = page.getByRole('button', {name: 'Open conciv chat'})
      await fab.waitFor({state: 'visible'})
      await fab.click()

      await page.getByText('How can I help you today?').waitFor({state: 'visible'})

      const composer = page.getByLabel('Message the conciv agent')
      await composer.fill('do something')
      await composer.press('Enter')
      await page.getByText(ASSISTANT_TEXT).waitFor({state: 'visible'})

      await page.getByText(RISKY_COMMAND).first().waitFor({state: 'visible'})

      await page.getByText('Run this action?').waitFor({state: 'visible'})

      await page.getByText('Chain of Thought').waitFor({state: 'visible'})
      await page.getByText(RISKY_COMMAND).first().waitFor({state: 'visible'})

      const decision = page.waitForRequest((r) => r.url().includes('/api/chat/permission-decision'))
      await page.getByRole('button', {name: 'Allow'}).click()
      const body = (await decision).postDataJSON() as {approvalId: string; approved: boolean}
      expect(body.approvalId).toBe(APPROVAL_ID)
      expect(body.approved).toBe(true)

      await page.getByText('Run this action?').waitFor({state: 'hidden'})
      await page.close()
    } finally {
      chatState.script = chatScript
    }
  })

  it('New session: opens a fresh empty session (resolve); the prior session is preserved in a hidden pane', async () => {
    const page = await newPage()
    await page.goto(state.base)
    const fab = page.getByRole('button', {name: 'Open conciv chat'})
    await fab.waitFor({state: 'visible'})
    await fab.click()
    const composer = page.getByLabel('Message the conciv agent')
    await composer.fill('do something')
    await composer.press('Enter')
    await page.getByText(ASSISTANT_TEXT).waitFor({state: 'visible'})

    const reset = page.waitForRequest((r) => r.url().endsWith('/api/chat/session/resolve') && r.method() === 'POST')
    await page.getByRole('button', {name: 'Start a new session'}).click()
    await reset

    await page.getByText('How can I help you today?').waitFor({state: 'visible'})
    expect(await page.getByText(ASSISTANT_TEXT).isVisible()).toBe(false)
    await page.close()
  })

  it('Compress: marks a boundary and sends a compaction turn (intent rides the AG-UI envelope)', async () => {
    const page = await newPage()
    await page.goto(state.base)
    const fab = page.getByRole('button', {name: 'Open conciv chat'})
    await fab.waitFor({state: 'visible'})
    await fab.click()
    const composer = page.getByLabel('Message the conciv agent')
    await composer.fill('do something')
    await composer.press('Enter')
    await page.getByText(ASSISTANT_TEXT).waitFor({state: 'visible'})

    const compactReq = page.waitForRequest((r) => {
      if (!r.url().endsWith('/api/chat') || r.method() !== 'POST') return false
      const b = r.postDataJSON() as {forwardedProps?: {intent?: string}; data?: {intent?: string}}
      return (b.forwardedProps?.intent ?? b.data?.intent) === 'compact'
    })
    await page.getByRole('button', {name: 'Compress the conversation'}).click()
    await compactReq

    const spinner = page.getByRole('status', {name: /Compacting context/})
    await spinner.waitFor({state: 'visible'})
    expect(await spinner.count()).toBe(1)
    await page.getByRole('separator', {name: /Compacting/}).waitFor({state: 'visible'})

    await spinner.waitFor({state: 'hidden'})
    await page.getByRole('separator', {name: 'Context compacted'}).waitFor({state: 'visible'})

    expect(await page.getByText('/compact').count()).toBe(0)
    expect(await page.getByText(ASSISTANT_TEXT).count()).toBe(1)
    await page.close()
  })

  it('Compress on a busy session (409) removes the boundary instead of claiming success', async () => {
    compactState.status = 409
    try {
      const page = await newPage()
      await page.goto(state.base)
      const fab = page.getByRole('button', {name: 'Open conciv chat'})
      await fab.waitFor({state: 'visible'})
      await fab.click()
      const composer = page.getByLabel('Message the conciv agent')
      await composer.fill('do something')
      await composer.press('Enter')
      await page.getByText(ASSISTANT_TEXT).waitFor({state: 'visible'})

      const compactReq = page.waitForResponse((r) => r.url().endsWith('/api/chat') && r.status() === 409)
      await page.getByRole('button', {name: 'Compress the conversation'}).click()
      await compactReq

      await page.getByRole('separator', {name: /Compacting/}).waitFor({state: 'hidden'})
      expect(await page.getByRole('separator', {name: 'Context compacted'}).count()).toBe(0)

      expect(await page.getByText(ASSISTANT_TEXT).count()).toBe(1)
      await page.close()
    } finally {
      compactState.status = 200
    }
  })

  it('renders the context tracker from a streamed conciv-usage event and shows the breakdown on hover', async () => {
    const page = await newPage()
    await page.goto(state.base)
    const fab = page.getByRole('button', {name: 'Open conciv chat'})
    await fab.waitFor({state: 'visible'})
    await fab.click()
    const composer = page.getByLabel('Message the conciv agent')
    await composer.fill('do something')
    await composer.press('Enter')
    await page.getByText(ASSISTANT_TEXT).waitFor({state: 'visible'})

    const trigger = page.getByRole('img', {name: 'Model context usage'})
    await trigger.waitFor({state: 'visible'})
    await page.getByText('3.6%').first().waitFor({state: 'visible'})

    await trigger.hover()
    await page.getByText('Total cost').waitFor({state: 'visible'})
    await page.getByText('$0.12').waitFor({state: 'visible'})
    await page.close()
  })

  it('places the FAB by config and snaps to the nearest preset after a drag', async () => {
    const page = await newPage()
    await page.setViewportSize({width: 1000, height: 800})
    await page.goto(`${state.base}/__position`)

    const fab = page.getByRole('button', {name: 'Open conciv chat'})
    await fab.waitFor({state: 'visible'})

    const corner = () =>
      fab.evaluate((el) => {
        const c = getComputedStyle(el)
        return {top: c.top, right: c.right, bottom: c.bottom, left: c.left}
      })
    expect(await corner()).toMatchObject({top: '20px', left: '20px'})

    const box = await fab.boundingBox()
    if (!box) throw new Error('no FAB box')
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(960, 770, {steps: 10})
    await page.mouse.up()

    await page.waitForFunction(() => localStorage.getItem('conciv-fab-position') === 'bottom-right')
    expect(await corner()).toMatchObject({bottom: '20px', right: '20px'})
    await page.close()
  })

  it('resizes the modal panel by edge drag, persists the height, and collapses below threshold', async () => {
    const page = await newPage()
    await page.setViewportSize({width: 1000, height: 800})
    await page.goto(state.base)
    const fab = page.getByRole('button', {name: 'Open conciv chat'})
    await fab.waitFor({state: 'visible'})
    await fab.click()

    await page.getByText('How can I help you today?').waitFor({state: 'visible'})
    await page.waitForTimeout(300)

    const panel = page.locator('#pw-chat-panel')
    const before = (await panel.boundingBox())!.height

    const handle = page.getByRole('separator', {name: 'Resize chat height'})
    const hb = (await handle.boundingBox())!
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2)
    await page.mouse.down()
    await page.mouse.move(hb.x + hb.width / 2, hb.y - 120, {steps: 8})
    await page.mouse.up()
    const after = (await panel.boundingBox())!.height
    expect(after).toBeGreaterThan(before + 80)
    expect(Number(await page.evaluate(() => localStorage.getItem('conciv-modal-height')))).toBeGreaterThan(before)

    const hb2 = (await page.getByRole('separator', {name: 'Resize chat height'}).boundingBox())!
    await page.mouse.move(hb2.x + hb2.width / 2, hb2.y + hb2.height / 2)
    await page.mouse.down()
    await page.mouse.move(hb2.x + hb2.width / 2, hb2.y + 700, {steps: 10})
    await page.mouse.up()
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-conciv-root]')
          ?.shadowRoot?.querySelector('#pw-chat-panel')
          ?.getAttribute('aria-hidden') === 'true',
    )
    await page.close()
  })

  it('resizes the modal panel horizontally by dragging the side edge, and persists the width', async () => {
    const page = await newPage()
    await page.setViewportSize({width: 1000, height: 800})
    await page.goto(state.base)
    const fab = page.getByRole('button', {name: 'Open conciv chat'})
    await fab.waitFor({state: 'visible'})
    await fab.click()
    await page.getByText('How can I help you today?').waitFor({state: 'visible'})
    await page.waitForTimeout(300)

    const panel = page.locator('#pw-chat-panel')
    const before = (await panel.boundingBox())!.width

    const handle = page.getByRole('separator', {name: 'Resize chat width'})
    const hb = (await handle.boundingBox())!
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2)
    await page.mouse.down()
    await page.mouse.move(hb.x - 140, hb.y + hb.height / 2, {steps: 8})
    await page.mouse.up()
    const after = (await panel.boundingBox())!.width
    expect(after).toBeGreaterThan(before + 80)
    expect(Number(await page.evaluate(() => localStorage.getItem('conciv-modal-width')))).toBeGreaterThan(before)
    await page.close()
  })

  it('resizes the modal panel from the keyboard via the resize separator', async () => {
    const page = await newPage()
    await page.setViewportSize({width: 1000, height: 800})
    await page.goto(state.base)
    const fab = page.getByRole('button', {name: 'Open conciv chat'})
    await fab.waitFor({state: 'visible'})
    await fab.click()
    await page.getByText('How can I help you today?').waitFor({state: 'visible'})
    await page.waitForTimeout(300)

    const panel = page.locator('#pw-chat-panel')
    const before = (await panel.boundingBox())!.height

    const sep = page.getByRole('separator', {name: 'Resize chat height'})
    await sep.focus()
    await sep.press('ArrowUp')
    await sep.press('ArrowUp')
    await sep.press('ArrowUp')
    const after = (await panel.boundingBox())!.height
    expect(after).toBeGreaterThan(before + 60)
    await page.close()
  })

  const ariaHiddenOf = (sel: string) =>
    `(() => document.querySelector('[data-conciv-root]')?.shadowRoot?.querySelector('${sel}')?.getAttribute('aria-hidden'))()`

  it('drops the quick terminal on its hotkey and closes on Escape', async () => {
    const page = await newPage()
    await page.goto(`${state.base}/__quick-terminal`)

    const sheet = page.locator('[data-pw-qt]')
    await sheet.waitFor({state: 'attached'})
    expect(await sheet.getAttribute('aria-hidden')).toBe('true')

    await page.keyboard.press('Control+k')
    await page.waitForFunction(`${ariaHiddenOf('[data-pw-qt]')} === 'false'`)
    await page.getByText('How can I help you today?').waitFor({state: 'visible'})

    await page.waitForFunction(() => {
      const active = document.querySelector('[data-conciv-root]')?.shadowRoot?.activeElement
      return active?.getAttribute('aria-label') === 'Message the conciv agent'
    })

    await page.keyboard.press('Escape')
    await page.waitForFunction(`${ariaHiddenOf('[data-pw-qt]')} === 'true'`)

    const closedInert = await page.evaluate(
      () =>
        (document.querySelector('[data-conciv-root]')?.shadowRoot?.querySelector('[data-pw-qt]') as HTMLElement)?.inert,
    )
    expect(closedInert).toBe(true)
    await page.close()
  })

  const rectOf = (sel: string) =>
    `(() => { const el = document.querySelector('[data-conciv-root]')?.shadowRoot?.querySelector('${sel}'); return el ? el.getBoundingClientRect() : null })()`

  it('closes the quick terminal via its close button — the sheet slides fully off-screen', async () => {
    const page = await newPage()
    await page.goto(`${state.base}/__quick-terminal`)
    const sheet = page.locator('[data-pw-qt]')
    await sheet.waitFor({state: 'attached'})

    await page.keyboard.press('Control+k')
    await page.waitForFunction(`${ariaHiddenOf('[data-pw-qt]')} === 'false'`)
    await page.waitForFunction(`${rectOf('[data-pw-qt]')}?.top <= 1`)

    await page.getByRole('button', {name: 'Close quick terminal'}).click()
    await page.waitForFunction(`${ariaHiddenOf('[data-pw-qt]')} === 'true'`)
    await page.waitForFunction(`${rectOf('[data-pw-qt]')}?.bottom <= 0`)
    await page.close()
  })

  it('resizes the quick terminal by dragging its height handle', async () => {
    const page = await newPage()
    await page.setViewportSize({width: 1000, height: 800})
    await page.goto(`${state.base}/__quick-terminal`)
    await page.locator('[data-pw-qt]').waitFor({state: 'attached'})
    await page.keyboard.press('Control+k')
    await page.waitForFunction(`${ariaHiddenOf('[data-pw-qt]')} === 'false'`)
    await page.getByText('How can I help you today?').waitFor({state: 'visible'})
    await page.waitForTimeout(300)

    const sheet = page.locator('[data-pw-qt]')
    const handle = page.getByRole('separator', {name: 'Resize quick terminal height'})
    const sb = (await sheet.boundingBox())!
    const hb = (await handle.boundingBox())!

    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2)
    await page.mouse.down()
    await page.mouse.move(hb.x + hb.width / 2, hb.y + 160, {steps: 8})
    await page.mouse.up()
    expect((await sheet.boundingBox())!.height).toBeGreaterThan(sb.height + 100)
    await page.close()
  })

  it('restores focus to the last-active pane on reopen (persisted)', async () => {
    const page = await newPage()
    await page.goto(`${state.base}/__quick-terminal`)
    await page.locator('[data-pw-qt]').waitFor({state: 'attached'})
    await page.keyboard.press('Control+k')
    await page.waitForFunction(`${ariaHiddenOf('[data-pw-qt]')} === 'false'`)

    await page.getByRole('button', {name: 'Split pane'}).click()
    await page.waitForFunction(`${countOf('[data-pw-qt-pane]')} === 2`)
    await page.locator('[data-pw-qt-pane]').first().dispatchEvent('pointerdown')

    await page.waitForFunction(() => {
      const root = document.querySelector('[data-conciv-root]')?.shadowRoot
      const firstPane = root?.querySelector('[data-pw-qt-pane]')
      const active = root?.activeElement
      return !!firstPane && !!active && firstPane.contains(active)
    })

    await page.keyboard.press('Escape')
    await page.waitForFunction(`${ariaHiddenOf('[data-pw-qt]')} === 'true'`)
    await page.keyboard.press('Control+k')
    await page.waitForFunction(`${ariaHiddenOf('[data-pw-qt]')} === 'false'`)
    await page.waitForFunction(() => {
      const root = document.querySelector('[data-conciv-root]')?.shadowRoot
      const firstPane = root?.querySelector('[data-pw-qt-pane]')
      const active = root?.activeElement
      return !!firstPane && !!active && firstPane.contains(active)
    })
    await page.close()
  })

  it('opening the quick terminal closes the modal (one layer at a time)', async () => {
    const page = await newPage()
    await page.goto(`${state.base}/__both`)

    const fab = page.getByRole('button', {name: 'Open conciv chat'})
    await fab.waitFor({state: 'visible'})
    await fab.click()
    await page.waitForFunction(`${ariaHiddenOf('#pw-chat-panel')} === 'false'`)

    await page.keyboard.press('Control+k')
    await page.waitForFunction(`${ariaHiddenOf('[data-pw-qt]')} === 'false'`)
    await page.waitForFunction(`${ariaHiddenOf('#pw-chat-panel')} === 'true'`)
    await page.close()
  })

  const countOf = (sel: string) =>
    `(() => document.querySelector('[data-conciv-root]')?.shadowRoot?.querySelectorAll('${sel}').length)()`

  it('pops the quick terminal into a PiP window (styles travel) and re-docks on close', async () => {
    const page = await newPage()
    await page.goto(`${state.base}/__quick-terminal`)
    await page.locator('[data-pw-qt]').waitFor({state: 'attached'})
    await page.keyboard.press('Control+k')
    await page.waitForFunction(`${ariaHiddenOf('[data-pw-qt]')} === 'false'`)

    const [popup] = await Promise.all([
      page.waitForEvent('popup'),
      page.getByRole('button', {name: 'Pop out to a window'}).click(),
    ])
    await popup.waitForLoadState()

    const inPip = await popup.evaluate(() => {
      const qt = document.querySelector('[data-pw-pip-host]')?.shadowRoot?.querySelector('[data-pw-qt]')
      return {present: !!qt, font: qt ? getComputedStyle(qt as Element).fontFamily : ''}
    })
    expect(inPip.present).toBe(true)
    expect(inPip.font).toContain('system-ui')

    expect(await page.evaluate(countOf('[data-pw-qt]'))).toBe(0)

    await popup.close()
    await page.waitForFunction(`${countOf('[data-pw-qt]')} === 1`)
    await page.close()
  })

  it('splits the quick terminal into independent-session panes and reflows on close', async () => {
    const page = await newPage()
    await page.goto(`${state.base}/__quick-terminal`)
    await page.locator('[data-pw-qt]').waitFor({state: 'attached'})
    await page.keyboard.press('Control+k')
    await page.waitForFunction(`${ariaHiddenOf('[data-pw-qt]')} === 'false'`)

    await page.waitForFunction(`${countOf('[data-pw-qt-pane]')} === 1`)

    await page.getByRole('button', {name: 'Split pane'}).click()
    await page.waitForFunction(`${countOf('[data-pw-qt-pane]')} === 2`)
    expect(await page.getByRole('textbox', {name: 'Message the conciv agent'}).count()).toBe(2)

    expect(await page.getByRole('button', {name: /^Session:/}).count()).toBe(2)

    await page.getByRole('button', {name: 'Close pane'}).first().click()
    await page.waitForFunction(`${countOf('[data-pw-qt-pane]')} === 1`)

    await page.getByRole('button', {name: 'Close pane'}).first().click()
    await page.waitForFunction(`${ariaHiddenOf('[data-pw-qt]')} === 'true'`)
    await page.close()
  })

  it('renders the assistant reply for a chat() stream (generated threadId, empty reasoning, MCP tools)', async () => {
    chatState.script = mcpAccessScript
    try {
      const page = await newPage()
      await page.goto(state.base)
      const fab = page.getByRole('button', {name: 'Open conciv chat'})
      await fab.waitFor({state: 'visible'})
      await fab.click()
      await page.getByText('How can I help you today?').waitFor({state: 'visible'})
      const composer = page.getByLabel('Message the conciv agent')
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
      const page = await newPage()
      await page.goto(state.base)
      const fab = page.getByRole('button', {name: 'Open conciv chat'})
      await fab.waitFor({state: 'visible'})
      await fab.click()
      await page.getByText('How can I help you today?').waitFor({state: 'visible'})
      const composer = page.getByLabel('Message the conciv agent')
      await composer.fill('first question')
      await composer.press('Enter')
      await page.getByText('Reply turn 1').waitFor({state: 'visible', timeout: 10_000})
      await composer.fill('second question')
      await composer.press('Enter')
      await page.getByText('Reply turn 2').waitFor({state: 'visible', timeout: 10_000})

      expect(await page.getByText('Reply turn 1').count()).toBe(1)
      expect(await page.getByText('Reply turn 2').count()).toBe(1)
      await page.close()
    } finally {
      chatState.script = chatScript
    }
  })

  it('model selector: picking a model closes the popover and never collapses the list to the chosen one', async () => {
    const page = await newPage()
    await page.goto(state.base)
    const fab = page.getByRole('button', {name: 'Open conciv chat'})
    await fab.waitFor({state: 'visible'})
    await fab.click()
    await page.getByText('How can I help you today?').waitFor({state: 'visible'})

    const trigger = page.getByRole('button', {name: 'Select model'})
    await trigger.waitFor({state: 'visible'})
    expect(await trigger.textContent()).toContain('Claude Sonnet 4.6')

    await trigger.click()
    await page.getByText('Claude Opus 4.8', {exact: true}).waitFor({state: 'visible'})
    expect(await page.getByRole('option').count()).toBe(4)

    await page.getByText('Claude Opus 4.8', {exact: true}).click()

    await trigger.getByText('Claude Opus 4.8').waitFor({state: 'visible'})

    await page.getByText('Claude Haiku 4.5', {exact: true}).waitFor({state: 'hidden'})

    // /data) — the exact spot @conciv/core's chat route reads.
    const composer = page.getByLabel('Message the conciv agent')
    const chatReq = page.waitForRequest((r) => r.url().endsWith('/api/chat') && r.method() === 'POST')
    await composer.fill('hi')
    await composer.press('Enter')
    const sent = (await chatReq).postDataJSON() as {forwardedProps?: {model?: string}; data?: {model?: string}}
    expect(sent.forwardedProps?.model ?? sent.data?.model).toBe('opus')

    await trigger.click()
    await page.getByText('Claude Haiku 4.5', {exact: true}).waitFor({state: 'visible'})
    expect(await page.getByRole('option').count()).toBe(4)
    await page.close()
  })

  it('session selector: lists rows, marks aidx origin, switches by header, renames optimistically', async () => {
    const page = await newPage()
    await page.goto(state.base)
    const fab = page.getByRole('button', {name: 'Open conciv chat'})
    await fab.waitFor({state: 'visible'})
    await fab.click()
    await page.getByText('How can I help you today?').waitFor({state: 'visible'})

    const trigger = page.getByRole('button', {name: /^Session:/})
    await trigger.click()

    const aidxItem = page.getByRole('option', {name: /Made in conciv/})
    const extItem = page.getByRole('option', {name: /Made externally/})
    await aidxItem.waitFor({state: 'visible'})
    await extItem.waitFor({state: 'visible'})
    expect(await page.getByRole('option', {name: /Made in conciv[\s\S]*started in conciv/}).count()).toBe(1)
    expect(await page.getByRole('option', {name: /Made externally[\s\S]*started externally/}).count()).toBe(1)

    const attachReq = page.waitForRequest(
      (r) => r.url().includes('/api/chat/attach') && r.headers()['conciv-session-id'] === 'conciv_ext_tok-aidx',
    )
    await aidxItem.click()
    await attachReq
    await page.getByText(SWITCHED_REPLY).waitFor({state: 'visible'})

    await trigger.click()
    const renameBtn = page.getByRole('button', {name: 'Rename current session'})
    await renameBtn.waitFor({state: 'visible'})
    await renameBtn.click()
    const rename = page.getByRole('textbox', {name: 'Rename session'})
    await rename.waitFor({state: 'visible'})
    await rename.fill('Renamed thread')
    await rename.press('Enter')

    await page.getByRole('button', {name: 'Session: Renamed thread'}).waitFor({state: 'visible'})
    await page.close()
  })

  it('session selector: restores the active session across a page reload', async () => {
    const page = await newPage()
    await page.goto(state.base)
    const fab = page.getByRole('button', {name: 'Open conciv chat'})
    await fab.waitFor({state: 'visible'})
    await fab.click()
    await page.getByText('How can I help you today?').waitFor({state: 'visible'})

    const trigger = page.getByRole('button', {name: /^Session:/})
    await trigger.click()
    await page.getByRole('option', {name: /Made in conciv/}).waitFor({state: 'visible'})
    const attachReq = page.waitForRequest(
      (r) => r.url().includes('/api/chat/attach') && r.headers()['conciv-session-id'] === 'conciv_ext_tok-aidx',
    )
    await page.getByRole('option', {name: /Made in conciv/}).click()
    await attachReq
    await page.getByText(SWITCHED_REPLY).waitFor({state: 'visible'})

    await page.reload()
    await fab.waitFor({state: 'visible'})
    await fab.click()

    await page.getByRole('button', {name: 'Session: Made in conciv'}).waitFor({state: 'visible', timeout: 4000})

    await page.getByText(SWITCHED_REPLY).waitFor({state: 'visible'})
    await page.close()
  })

  it('uses window.__CONCIV_API_BASE__ over the meta tag (Next.js injection path)', async () => {
    const page = await newPage()
    await page.goto(`${state.base}/__global-base`)

    await page.getByRole('button', {name: 'Open conciv chat'}).waitFor({state: 'visible'})
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
    const page = await newPage()
    const reply = page.waitForRequest(replyFor('pb1'))
    await page.goto(state.base)
    const body = (await reply).postDataJSON() as {requestId: string; data: {text?: string}}
    expect(body.data.text).toBe('page-bus-ok')
    await page.close()
  })

  it('routes a locate verb to the bippy bridge and degrades gracefully on a non-React node', async () => {
    const page = await newPage()
    const reply = page.waitForRequest(replyFor('pbL'))
    await page.goto(state.base)
    const body = (await reply).postDataJSON() as {requestId: string; data: {error?: string}}
    expect(body.data.error).toContain('no React fiber')
    await page.close()
  })

  it('Grab element: stages preview chips beside untouched input; remove drops one; send composes context', async () => {
    const page = await newPage()
    await page.setViewportSize({width: 1000, height: 800})
    await page.goto(state.base)
    const fab = page.getByRole('button', {name: 'Open conciv chat'})
    await fab.waitFor({state: 'visible'})
    await fab.click()
    await page.getByText('How can I help you today?').waitFor({state: 'visible'})

    const composer = page.getByLabel('Message the conciv agent')
    await composer.fill('make these pop')

    const chips = page.locator('[data-pw-grab]')

    const pick = async (expectCount: number) => {
      await page.getByRole('button', {name: 'Select an element from the page'}).click()
      await page.getByRole('button', {name: 'Cancel element pick'}).waitFor({state: 'visible'})
      const box = await page.locator('#grab-target').boundingBox()
      if (!box) throw new Error('no #grab-target box')

      const cx = box.x + 6
      const cy = box.y + 6
      await page.mouse.move(cx, cy)
      await page.mouse.move(cx + 1, cy + 1)
      await page.mouse.click(cx, cy)
      await chips.nth(expectCount - 1).waitFor({state: 'visible'})
    }

    await pick(1)

    expect(await composer.inputValue()).toBe('make these pop')

    const scale = chips.first().locator('[data-pw-grab-scale]')

    const bg = await scale.evaluate((el) =>
      [...el.querySelectorAll('*')]
        .map((n) => getComputedStyle(n).backgroundColor)
        .find((c) => c === 'rgb(91, 58, 166)'),
    )
    expect(bg).toBe('rgb(91, 58, 166)')

    const pseudo = await scale.evaluate((el) => {
      for (const n of el.querySelectorAll('*')) {
        const c = getComputedStyle(n, '::before').content
        if (c && c.includes('PRO')) return c
      }
      return null
    })
    expect(pseudo).toContain('PRO')

    expect(await scale.textContent()).toContain('Upgrade plan')
    const transform = await scale.evaluate((el) => getComputedStyle(el).transform)
    expect(transform === 'none' || transform.startsWith('matrix')).toBe(true)

    const fit = await scale.evaluate((el) => {
      const h3 = el.querySelector('h3')
      const card = h3?.parentElement
      if (!h3 || !card) return null
      const cs = getComputedStyle(h3)
      return {
        marginTop: cs.marginTop,
        fontSize: cs.fontSize,
        borderTopWidth: cs.borderTopWidth,
        overflow: card.scrollHeight - card.clientHeight,
      }
    })
    expect(fit?.marginTop).toBe('0px')
    expect(fit?.fontSize).toBe('16px')
    expect(fit?.borderTopWidth).toBe('0px')
    expect(fit?.overflow).toBeLessThanOrEqual(1)

    await pick(2)
    expect(await chips.count()).toBe(2)

    await chips.first().getByRole('button', {name: 'Remove grabbed element'}).click()
    expect(await chips.count()).toBe(1)
    expect(await composer.inputValue()).toBe('make these pop')

    await composer.press('Enter')
    await chips.first().waitFor({state: 'hidden'})
    await page.close()
  })
})
