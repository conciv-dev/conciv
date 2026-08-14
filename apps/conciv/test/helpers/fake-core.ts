import {onlineManager} from '@tanstack/query-core'
import {
  browserRpcConnection,
  closeBrowserRpcConnection,
  type DraftRow,
  type MarkerRow,
  type SessionMeta,
} from '@conciv/contract'
import '../../src/lib/api-base.js'

export const CORE_BASE = 'http://conciv.test'

export type CoreCall = {path: string; body: unknown}

export type FakeCore = {
  calls: CoreCall[]
  push: (chunk: unknown) => void
  subscribeCount: () => number
  releaseSnapshot: () => void
  idle: () => Promise<void>
  restore: () => void
  setEngine: (next: {stale: boolean; fingerprint?: string}) => void
  setNetworkFail: (fail: boolean) => void
  setResolveRejects: (fail: boolean) => void
  setRejectEngineProbe: (fail: boolean) => void
  setResolveTransportFails: (fail: boolean) => void
}

const QUIET_MS = 60

export type FakeCoreConfig = {
  draft?: DraftRow | null
  delays?: Record<string, number | number[]>
  sessions?: SessionMeta[]
  rejectSend?: boolean
  throwSend?: boolean
  snapshotFor?: (subscribeIndex: number) => unknown[]
  holdSnapshot?: boolean
  markers?: MarkerRow[]
  holdRun?: boolean
  launchOk?: boolean
  launchRejects?: boolean
  engineStale?: boolean
  networkFail?: boolean
  resolveRejects?: boolean
  rejectEngineProbe?: boolean
  resolveTransportFails?: boolean
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

function delayFor(schedule: number | number[] | undefined, callIndex: number): number {
  if (schedule === undefined) return 0
  if (typeof schedule === 'number') return schedule
  return schedule[Math.min(callIndex, schedule.length - 1)] ?? 0
}

export function installFakeCore(config: FakeCoreConfig = {}): FakeCore {
  const realFetch = globalThis.fetch
  const engine = {stale: config.engineStale ?? false, fingerprint: 'stamp-boot'}
  const calls: CoreCall[] = []
  let subscribes = 0
  let snapshotReleased = false
  let networkFail = config.networkFail ?? false
  let resolveRejects = config.resolveRejects ?? false
  let rejectEngineProbe = config.rejectEngineProbe ?? false
  let resolveTransportFails = config.resolveTransportFails ?? false
  if (typeof window !== 'undefined') window.__CONCIV_API_BASE__ = CORE_BASE
  let inFlight = 0
  let quietTimer: ReturnType<typeof setTimeout> | undefined
  const waitingForIdle: (() => void)[] = []
  const scheduleIdle = () => {
    if (quietTimer !== undefined) clearTimeout(quietTimer)
    if (inFlight > 0) return
    quietTimer = setTimeout(() => {
      for (const resolve of waitingForIdle.splice(0)) resolve()
    }, QUIET_MS)
  }
  const core: FakeCore = {
    calls,
    push: () => {},
    subscribeCount: () => subscribes,
    releaseSnapshot: () => {
      snapshotReleased = true
    },
    idle: () =>
      new Promise((resolve) => {
        waitingForIdle.push(resolve)
        scheduleIdle()
      }),
    restore: () => {
      globalThis.fetch = realFetch
      closeBrowserRpcConnection(CORE_BASE)
      onlineManager.setOnline(true)
      if (typeof window !== 'undefined') delete window.__CONCIV_API_BASE__
    },
    setEngine: (next) => {
      engine.stale = next.stale
      if (next.fingerprint !== undefined) engine.fingerprint = next.fingerprint
    },
    setNetworkFail: (fail) => {
      networkFail = fail
    },
    setResolveRejects: (fail) => {
      resolveRejects = fail
    },
    setRejectEngineProbe: (fail) => {
      rejectEngineProbe = fail
    },
    setResolveTransportFails: (fail) => {
      resolveTransportFails = fail
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
    '/rpc/sessions/resolve': () => {
      if (resolveTransportFails) throw new TypeError('Failed to fetch')
      return resolveRejects
        ? new Response('resolve refused', {status: 500})
        : reply({sessionId: config.sessions?.[0]?.id ?? 'conciv_1'})
    },
    '/rpc/sessions/create': () => reply({sessionId: 'conciv_2'}),
    '/rpc/sessions/compact': () => reply({ok: true}),
    '/rpc/drafts/get': () => reply(config.draft ?? null),
    '/rpc/drafts/set': () => reply({ok: true}),
    '/rpc/markers/list': () => reply(config.markers ?? []),
    '/rpc/captures/list': () => reply({captures: [], cssBundles: {}}),
    '/rpc/meta/models': () =>
      reply({
        models: [{id: 'model-1', name: 'Fable'}],
        defaultModel: 'model-1',
        harness: {id: 'claude', name: 'Claude', canLaunch: true, imageInput: false},
      }),
    '/rpc/meta/commands': () => reply({commands: []}),
    '/rpc/meta/engine': () =>
      rejectEngineProbe
        ? new Response('engine probe refused', {status: 500})
        : reply({
            stale: engine.stale,
            changed: engine.stale ? ['@conciv/tools'] : [],
            tracked: ['@conciv/core', '@conciv/tools'],
            bootedAt: 0,
            fingerprint: engine.fingerprint,
          }),
    '/rpc/meta/tools': () => reply({tools: []}),
    '/rpc/registry/catalog': () => reply([]),
    '/rpc/chat/subscribe': (_body, signal) => liveStream(signal),
    '/rpc/chat/stop': () => reply({ok: true}),
    '/rpc/chat/send': () => {
      if (config.throwSend) throw new TypeError('Failed to fetch')
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
    if (networkFail) throw new TypeError('Failed to fetch')
    const route = routes[url.pathname]
    if (!route) throw new Error(`the fake core has no route for ${url.pathname}`)
    inFlight += 1
    scheduleIdle()
    const body = await bodyOf(request)
    const priorCalls = calls.filter((call) => call.path === url.pathname).length
    calls.push({path: url.pathname, body})
    const delay = delayFor(config.delays?.[url.pathname], priorCalls)
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay))
    const response = route(body, request.signal)
    inFlight -= 1
    scheduleIdle()
    return response
  }
  browserRpcConnection(CORE_BASE, 'fetch')
  return core
}
