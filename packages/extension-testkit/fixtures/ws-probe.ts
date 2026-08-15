import type {Client} from '@orpc/client'
import {rpcOverWebsocket} from '@conciv/harness-testkit/rpc-websocket-client'

type ProbeClient = Client<Record<never, never>, unknown, unknown, Error>

type Probe = {
  connect: (wsUrl: string) => void
  call: (path: string[], input: unknown) => Promise<unknown>
  subscribe: (path: string[], input: unknown) => Promise<void>
  received: () => unknown[]
}

declare global {
  interface Window {
    __CONCIV_WS_PROBE__: Probe
  }
}

const held: {socket: WebSocket | null} = {socket: null}
const received: unknown[] = []

function procedure(path: string[]): ProbeClient {
  if (!held.socket) throw new Error('the ws probe was used before connect()')
  return rpcOverWebsocket<ProbeClient>(held.socket, {path})
}

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return typeof value === 'object' && value !== null && Symbol.asyncIterator in value
}

async function drain(stream: AsyncIterable<unknown>): Promise<void> {
  for await (const payload of stream) received.push(payload)
}

window.__CONCIV_WS_PROBE__ = {
  connect: (wsUrl) => {
    held.socket = new WebSocket(wsUrl)
  },
  call: (path, input) => procedure(path)(input),
  subscribe: async (path, input) => {
    const stream = await procedure(path)(input)
    if (!isAsyncIterable(stream)) throw new Error(`${path.join('.')} did not answer with an event iterator`)
    void drain(stream)
  },
  received: () => received,
}
