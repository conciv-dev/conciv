import {z} from 'zod'
import type {ContractClient} from '../connection/rpc-client.js'
import {contract} from '@conciv/protocol'
import * as SharedEvents from './shared-events.js'
import type {ConcivEvent} from './events.js'
import {makeRpc, type RpcApi} from './rpc.js'

export type ClientConnectionStatus = 'connected' | 'connecting' | 'reconnecting'

export type ClientConnectionOptions = {
  readonly server: () => string
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
  const events = SharedEvents.make((signal, onActivity) => received(raw, signal, onActivity, connection.set))
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

const UntrustedSchema = z.object({code: z.literal('UNAUTHORIZED')})

async function* received(
  raw: ContractClient,
  signal: AbortSignal,
  onActivity: () => void,
  setStatus: (status: ClientConnectionStatus) => void,
) {
  signal.addEventListener('abort', () => setStatus('connecting'), {once: true})
  const onRetry = ({error}: {error: unknown}): void =>
    setStatus(UntrustedSchema.safeParse(error).success ? 'connecting' : 'reconnecting')
  for await (const event of await raw.event.subscribe(undefined, {signal, context: {onRetry}})) {
    onActivity()
    if (event.type === 'server.heartbeat') continue
    if (event.type === 'server.connected') setStatus('connected')
    yield event as ConcivEvent
  }
}
