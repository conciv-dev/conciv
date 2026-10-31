import pTimeout, {TimeoutError} from 'p-timeout'
import type {ConsoleMessage, Frame, Page, Request, Response, WebSocket as PageWebSocket} from 'playwright'
import {PUSH_WS_PATH, PushFrameSchema} from '@conciv/protocol/push-types'

const SUBSCRIBE_TIMEOUT_MS = 30_000
const JOURNAL_LIMIT = 200
const CONSOLE_TEXT_LIMIT = 200
const SNAPSHOT_TIMEOUT_MS = 2_000
const ERROR_SCREEN_TEXT_LIMIT = 300
const FAILED_STATUS = 400

export type PagePlaneWatch = {
  subscribed: () => Promise<void>
  dispose: () => void
}

type ReadyGate = {
  ready: Promise<boolean>
  open: (result: Promise<boolean>) => void
}

type JournalEntry = {at: number; line: string}

type Journal = {
  entries: JournalEntry[]
  started: number
}

const watches = new WeakMap<Page, PagePlaneWatch>()

function record(input: {journal: Journal; line: string}): void {
  const {journal} = input
  journal.entries.push({at: Date.now() - journal.started, line: input.line})
  if (journal.entries.length > JOURNAL_LIMIT) journal.entries.splice(0, journal.entries.length - JOURNAL_LIMIT)
}

function urlOrigin(url: string): string | null {
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

function endpoint(url: string): string {
  try {
    const parsed = new URL(url)
    return `${parsed.origin}${parsed.pathname}`
  } catch {
    return url
  }
}

function foreign(input: {page: Page; request: Request}): boolean {
  const own = urlOrigin(input.page.url())
  const target = urlOrigin(input.request.url())
  return target !== null && target !== own
}

function describeRequest(request: Request): string {
  return `request ${request.method()} ${endpoint(request.url())}`
}

function failureReason(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function yesNo(value: boolean): string {
  return value ? 'yes' : 'no'
}

async function pageState(page: Page): Promise<string> {
  try {
    const state = await pTimeout(
      page.evaluate(() => {
        const host = document.querySelector('[data-conciv-root]')
        return {
          url: location.href,
          readyState: document.readyState,
          visible: document.visibilityState,
          root: host !== null,
          driver: '__CONCIV_PAGE_DRIVER__' in window,
          errorScreen: host?.shadowRoot?.querySelector('[data-conciv-error-screen]')?.textContent ?? null,
        }
      }),
      {milliseconds: SNAPSHOT_TIMEOUT_MS},
    )
    const summary = `page: ${state.url} readyState=${state.readyState} visible=${state.visible} root=${yesNo(state.root)} driver=${yesNo(state.driver)}`
    if (state.errorScreen === null) return summary
    return `${summary}\nerror screen: ${state.errorScreen.slice(0, ERROR_SCREEN_TEXT_LIMIT)}`
  } catch (error) {
    return `page: unavailable (${failureReason(error)})`
  }
}

async function explain(input: {line: string; journal: Journal; page: Page}): Promise<string> {
  const entries = input.journal.entries.map((entry) => `  +${entry.at}ms ${entry.line}`)
  return [input.line, ...entries, await pageState(input.page)].join('\n')
}

function parsedJson(payload: string): unknown {
  try {
    return JSON.parse(payload)
  } catch {
    return null
  }
}

function isReadyFrame(payload: string): boolean {
  const frame = PushFrameSchema.safeParse(parsedJson(payload))
  return frame.success && frame.data.channel === 'ready'
}

function isPushSocket(socket: PageWebSocket): boolean {
  return socket.url().includes(PUSH_WS_PATH)
}

function readyOf(socket: PageWebSocket): Promise<boolean> {
  return socket
    .waitForEvent('framereceived', {
      timeout: SUBSCRIBE_TIMEOUT_MS,
      predicate: (event) => isReadyFrame(String(event.payload)),
    })
    .then(
      () => true,
      () => false,
    )
}

function readyGate(): ReadyGate {
  const held: {open: (result: Promise<boolean>) => void} = {open: () => {}}
  const opened = new Promise<Promise<boolean>>((resolve) => {
    held.open = resolve
  })
  return {ready: opened.then((result) => result), open: (result) => held.open(result)}
}

function watchPagePlane(page: Page): PagePlaneWatch {
  const held: {gate: ReadyGate} = {gate: readyGate()}
  const journal: Journal = {entries: [], started: Date.now()}
  const socketCleanups = new Set<() => void>()
  const note = (line: string): void => record({journal, line})
  const onSocket = (socket: PageWebSocket): void => {
    note(`websocket open ${socket.url()}`)
    const gate = held.gate
    if (isPushSocket(socket)) gate.open(readyOf(socket))
    const onClose = (): void => {
      note(`websocket close ${socket.url()}`)
      socketCleanups.delete(cleanup)
      if (isPushSocket(socket) && held.gate === gate) held.gate = readyGate()
    }
    const cleanup = (): void => {
      socket.off('close', onClose)
    }
    socketCleanups.add(cleanup)
    socket.on('close', onClose)
  }
  const onRequest = (request: Request): void => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
      note(`navigate ${request.url()}`)
      held.gate = readyGate()
      return
    }
    if (foreign({page, request})) note(describeRequest(request))
  }
  const onResponse = (response: Response): void => {
    const request = response.request()
    if (foreign({page, request}) || response.status() >= FAILED_STATUS) {
      note(`${describeRequest(request)} -> ${response.status()}`)
    }
  }
  const onRequestFailed = (request: Request): void => {
    note(`${describeRequest(request)} failed: ${request.failure()?.errorText ?? 'unknown error'}`)
  }
  const onFrameNavigated = (frame: Frame): void => {
    if (frame === page.mainFrame()) note(`framenavigated ${frame.url()}`)
  }
  const onConsole = (message: ConsoleMessage): void => {
    const type = message.type()
    if (type !== 'error' && type !== 'warning') return
    note(`console.${type} ${message.text().slice(0, CONSOLE_TEXT_LIMIT)}`)
  }
  const onPageError = (error: Error): void => note(`pageerror ${error.message}`)
  const onCrash = (): void => note('crash')
  page.on('websocket', onSocket)
  page.on('request', onRequest)
  page.on('response', onResponse)
  page.on('requestfailed', onRequestFailed)
  page.on('framenavigated', onFrameNavigated)
  page.on('console', onConsole)
  page.on('pageerror', onPageError)
  page.on('crash', onCrash)
  return {
    subscribed: async () => {
      note('subscribed() called')
      const ready = await pTimeout(held.gate.ready, {
        milliseconds: SUBSCRIBE_TIMEOUT_MS,
        fallback: async () => {
          throw new TimeoutError(
            await explain({line: `no page plane push socket opened on ${PUSH_WS_PATH}`, journal, page}),
          )
        },
      })
      if (ready) return
      throw new Error(
        await explain({
          line: `the page plane push socket on ${PUSH_WS_PATH} never sent its ready frame`,
          journal,
          page,
        }),
      )
    },
    dispose: () => {
      page.off('websocket', onSocket)
      page.off('request', onRequest)
      page.off('response', onResponse)
      page.off('requestfailed', onRequestFailed)
      page.off('framenavigated', onFrameNavigated)
      page.off('console', onConsole)
      page.off('pageerror', onPageError)
      page.off('crash', onCrash)
      socketCleanups.forEach((cleanup) => cleanup())
      socketCleanups.clear()
      journal.entries.length = 0
    },
  }
}

export function pagePlaneWatchFor(page: Page): PagePlaneWatch {
  const existing = watches.get(page)
  if (existing) return existing
  const created = watchPagePlane(page)
  watches.set(page, created)
  return created
}

export async function awaitPagePlaneSubscribed(page: Page, arrive: () => Promise<void>): Promise<void> {
  const watch = pagePlaneWatchFor(page)
  await arrive()
  await watch.subscribed()
}
