import {Effect, Queue, Stream, SubscriptionRef} from 'effect'
import {IosBridge} from '../../src/bridge.js'
import type {IosBridgeMachine} from '../../src/bridge-machine.js'
import {
  NativeToPageSchema,
  PageToNativeSchema,
  type NativeToPageMessage,
  type PageToNativeMessage,
} from '../../src/rpc.js'

type NativePeer = {
  readonly client: IosBridge.NativeClient
  readonly send: (message: NativeToPageMessage) => Effect.Effect<void>
  readonly receive: (type: PageToNativeMessage['type']) => Effect.Effect<PageToNativeMessage, Error>
  readonly signal: Effect.Effect<IosBridgeMachine.NativeSignal>
  readonly state: Effect.Effect<IosBridgeMachine.NativeState>
}

function isAnnouncement(message: PageToNativeMessage): boolean {
  return message.type === 'bridge.ready' || message.type === 'handshake.hello'
}

function takeOfType(
  posted: Queue.Queue<PageToNativeMessage>,
  type: PageToNativeMessage['type'],
): Effect.Effect<PageToNativeMessage, Error> {
  return Queue.take(posted).pipe(
    Effect.flatMap((message) => {
      if (message.type === type) return Effect.succeed(message)
      if (isAnnouncement(message)) return takeOfType(posted, type)
      return Effect.fail(new Error(`the page posted ${message.type} while the peer waited for ${type}`))
    }),
  )
}

export const connectPeer = Effect.fn('ios.test.connectPeer')(function* (options: {clientId: string; apiBase: string}) {
  const calls = yield* Queue.unbounded<unknown>()
  const posted = yield* Queue.unbounded<PageToNativeMessage>()
  const signals = yield* Queue.unbounded<IosBridgeMachine.NativeSignal>()
  const transport: IosBridge.NativeTransport = {
    calls: Stream.fromQueue(calls),
    post: (message) => Queue.offer(posted, PageToNativeSchema.parse(message)).pipe(Effect.asVoid),
  }
  const client = yield* IosBridge.makeNativeClient({transport, ...options})
  yield* Effect.forkScoped(Stream.runForEach(client.signals, (signal) => Queue.offer(signals, signal)))
  const peer: NativePeer = {
    client,
    send: (message) => Queue.offer(calls, NativeToPageSchema.parse(message)).pipe(Effect.asVoid),
    receive: (type) => takeOfType(posted, type),
    signal: Queue.take(signals),
    state: SubscriptionRef.get(client.state),
  }
  return peer
})
