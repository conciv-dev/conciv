import {z} from 'zod'
import type {EngineTrust} from '../connection/engine-connection.js'
import type {ContractClient} from '../connection/rpc-client.js'
import {contract} from '@conciv/protocol'
import * as SharedEvents from './shared-events.js'
import type {ConcivEvent} from './events.js'
import {makeRpc, type RpcApi} from './rpc.js'

export type ClientConnectionStatus = 'connected' | 'connecting' | 'reconnecting'

export type ClientConnectionOptions = {
  readonly server: () => string
  readonly idleTimeout?: number
  readonly reconnectDelay?: number
  readonly trust?: () => EngineTrust | undefined
}

type ClientConnection = {
  status: () => ClientConnectionStatus
  on: (listener: (status: ClientConnectionStatus) => void) => () => void
}

export function make(
  raw: ContractClient,
  options: ClientConnectionOptions,
): Omit<ContractClient, 'event'> & {
  rpc: RpcApi & {call: ContractClient['plugin']['call']}
  event: ReturnType<typeof SharedEvents.make<ConcivEvent>>
  connection: ClientConnection
} {
  const connection = makeConnection()
  const idleTimeout = options.idleTimeout ?? defaultIdleTimeout
  const reconnectDelay = options.reconnectDelay ?? defaultReconnectDelay
  const events = SharedEvents.make((signal, onActivity) =>
    received(raw, signal, onActivity, connection.set, {
      idleTimeout,
      reconnectDelay,
      trust: options.trust ?? (() => undefined),
    }),
  )
  const groups = {
    auth: raw.auth,
    sessions: raw.sessions,
    settings: raw.settings,
    drafts: raw.drafts,
    markers: raw.markers,
    chat: raw.chat,
    registry: raw.registry,
    code: raw.code,
    meta: raw.meta,
    skill: raw.skill,
    agent: raw.agent,
    fs: raw.fs,
    plugin: raw.plugin,
    experimental: raw.experimental,
    event: raw.event,
  } satisfies {readonly [Group in keyof typeof contract]: ContractClient[Group]}
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
  raw: ContractClient,
  signal: AbortSignal,
  onActivity: () => void,
  setStatus: (status: ClientConnectionStatus) => void,
  {
    idleTimeout,
    reconnectDelay,
    trust,
  }: {idleTimeout: number; reconnectDelay: number; trust: () => EngineTrust | undefined},
) {
  signal.addEventListener('abort', () => setStatus('connecting'), {once: true})
  while (!signal.aborted) {
    const outcome = yield* attempted(raw, signal, onActivity, setStatus, idleTimeout)
    if (signal.aborted) return
    if (outcome === 'untrusted') {
      setStatus('connecting')
      await trusted(trust(), signal)
      continue
    }
    setStatus('reconnecting')
    await wait(reconnectDelay, signal)
  }
}

async function* attempted(
  raw: ContractClient,
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
      yield event as ConcivEvent
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

function trusted(trust: EngineTrust | undefined, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const settle = () => {
      stopTrust()
      signal.removeEventListener('abort', settle)
      resolve()
    }
    const stopTrust =
      trust?.subscribe((status) => {
        if (status === 'trusted') settle()
      }) ?? (() => undefined)
    signal.addEventListener('abort', settle, {once: true})
    if (trust?.isTrusted() === true || signal.aborted) settle()
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
