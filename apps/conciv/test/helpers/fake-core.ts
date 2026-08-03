import type {DraftRow, SessionMeta} from '@conciv/contract'
import '../../src/lib/api-base.js'

export const CORE_BASE = 'http://conciv.test'

export type CoreCall = {path: string; body: unknown}

export type FakeCore = {
  calls: CoreCall[]
  push: (chunk: unknown) => void
  subscribeCount: () => number
  releaseSnapshot: () => void
  restore: () => void
}

export type FakeCoreConfig = {
  draft?: DraftRow | null
  sessions?: SessionMeta[]
  rejectSend?: boolean
  snapshotFor?: (subscribeIndex: number) => unknown[]
  holdSnapshot?: boolean
  holdRun?: boolean
  launchOk?: boolean
  launchRejects?: boolean
}

export function sessionRow(overrides: Partial<SessionMeta> & {id: string}): SessionMeta {
  return {
    title: 'rename the widget package',
    updatedAt: Date.now(),
    messageCount: 3,
    running: false,
    origin: 'conciv',
    usage: null,
    model: null,
    hidden: false,
    native: null,
    ...overrides,
  }
}

function reply(value: unknown): Response {
  return new Response(JSON.stringify({json: value, meta: []}), {
    status: 200,
    headers: {'content-type': 'application/json'},
  })
}

function frame(chunk: unknown): Uint8Array {
  return new TextEncoder().encode(`event: message\ndata: ${JSON.stringify({json: chunk, meta: []})}\n\n`)
}

async function bodyOf(request: Request): Promise<unknown> {
  try {
    const parsed: unknown = await request.clone().json()
    if (typeof parsed === 'object' && parsed !== null && 'json' in parsed) return parsed.json
    return parsed
  } catch {
    return null
  }
}

const RUN_ID = 'conciv_run_1'

export function installFakeCore(config: FakeCoreConfig = {}): FakeCore {
  const realFetch = globalThis.fetch
  const calls: CoreCall[] = []
  let subscribes = 0
  let snapshotReleased = false
  if (typeof window !== 'undefined') window.__CONCIV_API_BASE__ = CORE_BASE
  const core: FakeCore = {
    calls,
    push: () => {},
    subscribeCount: () => subscribes,
    releaseSnapshot: () => {
      snapshotReleased = true
    },
    restore: () => {
      globalThis.fetch = realFetch
      if (typeof window !== 'undefined') delete window.__CONCIV_API_BASE__
    },
  }

  const liveStream = (signal: AbortSignal): Response => {
    subscribes += 1
    const messages = config.snapshotFor?.(subscribes) ?? []
    const stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        const sendSnapshot = () => controller.enqueue(frame({type: 'MESSAGES_SNAPSHOT', messages}))
        const held = config.holdSnapshot === true && !snapshotReleased
        if (held) core.releaseSnapshot = sendSnapshot
        if (!held) sendSnapshot()
        core.push = (chunk) => controller.enqueue(frame(chunk))
        signal.addEventListener('abort', () => {
          core.push = () => {}
          controller.error(new DOMException('aborted', 'AbortError'))
        })
      },
    })
    return new Response(stream, {status: 200, headers: {'content-type': 'text/event-stream'}})
  }

  const routes: Record<string, (body: unknown, signal: AbortSignal) => Response> = {
    '/rpc/sessions/list': () => reply(config.sessions ?? [sessionRow({id: 'conciv_1'})]),
    '/rpc/sessions/create': () => reply({sessionId: 'conciv_2'}),
    '/rpc/sessions/compact': () => reply({ok: true}),
    '/rpc/drafts/get': () => reply(config.draft ?? null),
    '/rpc/drafts/set': () => reply({ok: true}),
    '/rpc/markers/list': () => reply([]),
    '/rpc/meta/models': () =>
      reply({
        models: [{id: 'model-1', name: 'Fable'}],
        defaultModel: 'model-1',
        harness: {id: 'claude', name: 'Claude', canLaunch: true, imageInput: false},
      }),
    '/rpc/meta/commands': () => reply({commands: []}),
    '/rpc/meta/tools': () => reply({tools: []}),
    '/rpc/chat/subscribe': (_body, signal) => liveStream(signal),
    '/rpc/chat/stop': () => reply({ok: true}),
    '/rpc/chat/send': () => {
      if (config.rejectSend) return new Response('send refused', {status: 500})
      queueMicrotask(() => {
        core.push({type: 'RUN_STARTED', threadId: 'conciv_1', runId: RUN_ID})
        if (config.holdRun) return
        core.push({type: 'RUN_FINISHED', threadId: 'conciv_1', runId: RUN_ID, finishReason: 'stop'})
      })
      return reply({ok: true, runId: RUN_ID})
    },
    '/rpc/ext/terminal/launch': () => {
      if (config.launchRejects) return new Response('no terminal', {status: 500})
      return reply({ok: config.launchOk ?? true})
    },
    '/rpc/ext/terminal/connectCommand': () => reply({command: 'claude --resume fake-session'}),
  }

  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = input instanceof Request ? input : new Request(input, init)
    const url = new URL(request.url)
    if (url.origin !== CORE_BASE) return realFetch(input, init)
    const route = routes[url.pathname]
    if (!route) throw new Error(`the fake core has no route for ${url.pathname}`)
    const body = await bodyOf(request)
    calls.push({path: url.pathname, body})
    return route(body, request.signal)
  }
  return core
}
