import {createORPCClient} from '@orpc/client'
import {RPCLink} from '@orpc/client/websocket'
import {Effect, type Scope} from 'effect'
import getPort from 'get-port'
import type {HandshakeParams, LlmNotification} from '@conciv/protocol/simulation'
import * as SimulatedProvider from '../../src/backend/simulated-provider.js'
import type {DriveClient} from '../../src/driver.js'

export type RawDriver = {
  readonly websocket: WebSocket
  readonly closed: Promise<void>
  readonly client: DriveClient
}

export async function availableEndpoint(): Promise<string> {
  return `ws://127.0.0.1:${await getPort({host: '127.0.0.1'})}`
}

export async function connect(endpoint: string): Promise<RawDriver> {
  const websocket = new WebSocket(endpoint)
  const closed = new Promise<void>((resolve) => websocket.addEventListener('close', () => resolve(), {once: true}))
  await new Promise<void>((resolve, reject) => {
    websocket.addEventListener('open', () => resolve(), {once: true})
    websocket.addEventListener('error', () => reject(new Error(`Failed to connect to ${endpoint}`)), {once: true})
  })
  const client: DriveClient = createORPCClient(new RPCLink({websocket}))
  return {websocket, closed, client}
}

export function driven(endpoint: string) {
  return SimulatedProvider.drive({endpoint, version: 'test'})
}

export const handshake: HandshakeParams = {
  client: {name: 'test', version: 'test'},
  expectedRole: 'backend',
  offeredVersions: [1],
  requiredCapabilities: ['llm.subscribe', 'llm.request'],
  optionalCapabilities: [],
}

export function attached(driver: RawDriver) {
  return Effect.promise(() => driver.client.llm.subscribe())
}

export function nextRequest(turns: AsyncIterator<LlmNotification>) {
  return Effect.promise(() => turns.next()).pipe(
    Effect.map((next) => {
      if (next.done === true) throw new Error('the attachment ended before an llm.request arrived')
      return next.value.params
    }),
  )
}

export function withProvider<A, E>(
  body: (endpoint: string, provider: SimulatedProvider.Interface) => Effect.Effect<A, E, Scope.Scope>,
): Effect.Effect<A, E | Error, Scope.Scope> {
  return Effect.gen(function* () {
    const endpoint = yield* Effect.promise(availableEndpoint)
    const {provider} = yield* driven(endpoint)
    return yield* body(endpoint, provider)
  })
}

export function openDriver(endpoint: string) {
  return Effect.acquireRelease(
    Effect.promise(() => connect(endpoint)),
    (opened) => Effect.sync(() => opened.websocket.close()),
  )
}
