export * as Conciv from './client.js'

import {z} from 'zod'
import {browserRpcConnection, contract, type EngineConnectionTimings, type RpcClient} from '@conciv/contract'
import {SharedEvents} from '../shared-events.js'
import type {EventSubscribeOutput} from './generated/types.js'
import {makeRpc, type RpcApi} from './rpc.js'

export type {RequestOptions} from './generated/client.js'

export type ClientConnectionStatus = 'connected' | 'connecting' | 'reconnecting'

export type ClientConnectionOptions = {
  readonly server: () => string
  readonly idleTimeout?: number
  readonly reconnectDelay?: number
  readonly engineTimings?: Partial<EngineConnectionTimings>
}

type ClientConnection = {
  status: () => ClientConnectionStatus
  on: (listener: (status: ClientConnectionStatus) => void) => () => void
}

export function make(
  raw: RpcClient,
  options: ClientConnectionOptions,
): Omit<RpcClient, 'event'> & {
  rpc: RpcApi & {call: RpcClient['plugin']['call']}
  event: ReturnType<typeof SharedEvents.make<EventSubscribeOutput>>
  connection: ClientConnection
} {
  const connection = makeConnection()
  const idleTimeout = options.idleTimeout ?? defaultIdleTimeout
  const reconnectDelay = options.reconnectDelay ?? defaultReconnectDelay
  const events = SharedEvents.make((signal, onActivity) =>
    received(
      raw,
      signal,
      onActivity,
      connection.set,
      {idleTimeout, reconnectDelay, engineTimings: options.engineTimings},
      options.server,
    ),
  )
  const groups = {
    auth: raw.auth,
    sessions: raw.sessions,
    settings: raw.settings,
    drafts: raw.drafts,
    markers: raw.markers,
    chat: raw.chat,
    registry: raw.registry,
    tabs: raw.tabs,
    location: raw.location,
    code: raw.code,
    page: raw.page,
    meta: raw.meta,
    skill: raw.skill,
    agent: raw.agent,
    fs: raw.fs,
    plugin: raw.plugin,
    experimental: raw.experimental,
    event: raw.event,
  } satisfies {readonly [Group in keyof typeof contract]: RpcClient[Group]}
  return {
    ...groups,
    rpc: Object.assign(makeRpc(raw, events, options.server), {call: raw.plugin.call}),
    event: events,
    connection: {status: connection.status, on: connection.on},
  }
}

function makeConnection() {
  const changes = new EventTarget()
  const current: {status: ClientConnectionStatus} = {status: 'connecting'}
  return {
    status: () => current.status,
    on(listener: (status: ClientConnectionStatus) => void) {
      const changed = () => listener(current.status)
      changes.addEventListener('change', changed)
      return () => changes.removeEventListener('change', changed)
    },
    set(status: ClientConnectionStatus) {
      if (current.status === status) return
      current.status = status
      changes.dispatchEvent(new Event('change'))
    },
  }
}

const defaultReconnectDelay = 1_000
export const defaultIdleTimeout = 45_000

const UntrustedSchema = z.object({code: z.literal('UNAUTHORIZED')})

async function* received(
  raw: RpcClient,
  signal: AbortSignal,
  onActivity: () => void,
  setStatus: (status: ClientConnectionStatus) => void,
  {
    idleTimeout,
    reconnectDelay,
    engineTimings,
  }: {idleTimeout: number; reconnectDelay: number; engineTimings: Partial<EngineConnectionTimings> | undefined},
  server: () => string,
) {
  signal.addEventListener('abort', () => setStatus('connecting'), {once: true})
  while (!signal.aborted) {
    const outcome = yield* attempted(raw, signal, onActivity, setStatus, idleTimeout)
    if (signal.aborted) return
    if (outcome === 'untrusted') {
      setStatus('connecting')
      await trusted(server(), signal, engineTimings)
      continue
    }
    setStatus('reconnecting')
    await wait(reconnectDelay, signal)
  }
}

async function* attempted(
  raw: RpcClient,
  signal: AbortSignal,
  onActivity: () => void,
  setStatus: (status: ClientConnectionStatus) => void,
  idleTimeout: number,
) {
  const attempt = new AbortController()
  const cancel = () => attempt.abort(signal.reason)
  signal.addEventListener('abort', cancel, {once: true})
  let watchdog: ReturnType<typeof setTimeout> | undefined
  const arm = () => {
    clearTimeout(watchdog)
    watchdog = setTimeout(() => attempt.abort(new DOMException('Event stream stalled', 'TimeoutError')), idleTimeout)
  }
  const touch = () => {
    onActivity()
    arm()
  }
  try {
    arm()
    for await (const event of await raw.event.subscribe(undefined, {signal: attempt.signal, context: {retry: 0}})) {
      touch()
      if (event.type === 'server.heartbeat') continue
      if (event.type === 'server.connected') setStatus('connected')
      yield event as EventSubscribeOutput
    }
    if (!signal.aborted) console.info('[conciv] the event stream ended; subscribing again')
  } catch (error) {
    if (signal.aborted) return
    if (UntrustedSchema.safeParse(error).success) return 'untrusted'
    console.info(
      '[conciv] the event stream failed; subscribing again',
      attempt.signal.aborted ? attempt.signal.reason : error,
    )
  } finally {
    clearTimeout(watchdog)
    signal.removeEventListener('abort', cancel)
  }
}

function trusted(server: string, signal: AbortSignal, engineTimings: Partial<EngineConnectionTimings> | undefined) {
  const {trust, release} = browserRpcConnection(server, undefined, engineTimings)
  return new Promise<void>((resolve) => {
    const settle = () => {
      stopTrust()
      signal.removeEventListener('abort', settle)
      release()
      resolve()
    }
    const stopTrust = trust.subscribe((status) => {
      if (status === 'trusted') settle()
    })
    signal.addEventListener('abort', settle, {once: true})
    if (trust.isTrusted() || signal.aborted) settle()
  })
}

function wait(delay: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(done, delay)
    signal.addEventListener('abort', done, {once: true})
    function done() {
      clearTimeout(timer)
      signal.removeEventListener('abort', done)
      resolve()
    }
  })
}
