import pTimeout, {TimeoutError} from 'p-timeout'
import type {ConsoleMessage, Frame, Page, Request, Response, WebSocket as PageWebSocket} from 'playwright'
import {structuredCloneParse} from 'devframe/utils/structured-clone'
import {z} from 'zod'

const SUBSCRIBE_TIMEOUT_MS = 30_000
const JOURNAL_LIMIT = 200
const CONSOLE_TEXT_LIMIT = 200
const SNAPSHOT_TIMEOUT_MS = 2_000
const ERROR_SCREEN_TEXT_LIMIT = 300
const FAILED_STATUS = 400
const HUB_SOCKET_PATH = '/__ws'
const PAGE_JOIN_FUNCTION = 'conciv:page:join'
const STRUCTURED_CLONE_PREFIX = 's:'

const JoinCallSchema = z.object({t: z.literal('q'), i: z.string(), m: z.literal(PAGE_JOIN_FUNCTION)})
const CallResultSchema = z.object({t: z.literal('s'), i: z.string(), e: z.unknown().optional()})

export type PagePlaneWatch = {
  subscribed: () => Promise<void>
  dispose: () => void
}

type ReadyGate = {
  ready: Promise<void>
  open: () => void
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

function decodedFrame(payload: string | Buffer): unknown {
  const raw = String(payload)
  try {
    if (raw.startsWith(STRUCTURED_CLONE_PREFIX)) return structuredCloneParse(raw.slice(STRUCTURED_CLONE_PREFIX.length))
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function isHubSocket(socket: PageWebSocket): boolean {
  return socket.url().includes(HUB_SOCKET_PATH)
}

function joinedOf(socket: PageWebSocket): Promise<boolean> {
  const joins = new Set<string>()
  const settled = Promise.withResolvers<boolean>()
  const onSent = (event: {payload: string | Buffer}): void => {
    const call = JoinCallSchema.safeParse(decodedFrame(event.payload))
    if (call.success) joins.add(call.data.i)
  }
  const onReceived = (event: {payload: string | Buffer}): void => {
    const result = CallResultSchema.safeParse(decodedFrame(event.payload))
    if (!result.success || !joins.has(result.data.i)) return
    settled.resolve(result.data.e === undefined)
  }
  const onClose = (): void => settled.resolve(false)
  socket.on('framesent', onSent)
  socket.on('framereceived', onReceived)
  socket.on('close', onClose)
  return settled.promise.finally(() => {
    socket.off('framesent', onSent)
    socket.off('framereceived', onReceived)
    socket.off('close', onClose)
  })
}

function readyGate(): ReadyGate {
  const gate = Promise.withResolvers<void>()
  return {ready: gate.promise, open: () => gate.resolve()}
}

function watchPagePlane(page: Page): PagePlaneWatch {
  const held: {gate: ReadyGate} = {gate: readyGate()}
  const journal: Journal = {entries: [], started: Date.now()}
  const socketCleanups = new Set<() => void>()
  const note = (line: string): void => record({journal, line})
  const onSocket = (socket: PageWebSocket): void => {
    note(`websocket open ${socket.url()}`)
    const gate = held.gate
    if (isHubSocket(socket))
      void joinedOf(socket).then((joined) => {
        if (joined) gate.open()
      })
    const onClose = (): void => {
      note(`websocket close ${socket.url()}`)
      socketCleanups.delete(cleanup)
      if (isHubSocket(socket) && held.gate === gate) held.gate = readyGate()
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
      await pTimeout(held.gate.ready, {
        milliseconds: SUBSCRIBE_TIMEOUT_MS,
        fallback: async () => {
          throw new TimeoutError(
            await explain({
              line: `the tab never joined its session with ${PAGE_JOIN_FUNCTION} on ${HUB_SOCKET_PATH}`,
              journal,
              page,
            }),
          )
        },
      })
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
