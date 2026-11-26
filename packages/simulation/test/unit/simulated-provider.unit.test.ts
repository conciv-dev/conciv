import {it} from '@effect/vitest'
import {Deferred, Effect, Fiber, Stream} from 'effect'
import {describe, expect} from 'vitest'
import {request} from '../utils/model-request.js'
import {attached, handshake, nextRequest, openDriver, withProvider} from '../utils/websocket.js'

describe('simulated provider', () => {
  it.live('streams a driver-controlled response and removes the finished invocation', () =>
    withProvider((endpoint, provider) =>
      Effect.gen(function* () {
        const drive = yield* openDriver(endpoint)
        expect(yield* Effect.promise(() => drive.client.handshake(handshake))).toEqual({
          protocolVersion: 1,
          role: 'backend',
          server: {name: 'conciv', version: 'test'},
          capabilities: expect.arrayContaining(['llm.subscribe', 'llm.request']),
        })
        const turns = yield* attached(drive)
        const response = yield* provider.stream(request).pipe(Stream.runCollect, Effect.forkScoped)

        const opened = yield* nextRequest(turns)
        expect(opened).toEqual({id: expect.any(String), request})
        expect(response.pollUnsafe()).toBeUndefined()
        expect(yield* Effect.promise(() => drive.client.llm.pending())).toEqual({invocations: [opened]})

        yield* Effect.promise(() =>
          drive.client.llm.chunk({id: opened.id, items: [{type: 'textDelta', text: 'Hello from Drive'}]}),
        )
        yield* Effect.promise(() => drive.client.llm.finish({id: opened.id}))

        expect(Array.from(yield* Fiber.join(response))).toEqual([
          {type: 'textDelta', text: 'Hello from Drive'},
          {type: 'finish', reason: 'stop'},
        ])
        expect(yield* Effect.promise(() => drive.client.llm.pending())).toEqual({invocations: []})
        const late = yield* Effect.promise(() =>
          drive.client.llm.finish({id: opened.id}).catch((error: unknown) => error),
        )
        expect(late).toMatchObject({code: 'INVOCATION_NOT_FOUND', data: {id: opened.id}})
      }),
    ),
  )

  it.live('replays a waiting invocation to each controller that attaches, the newest replacing the last', () =>
    withProvider((endpoint, provider) =>
      Effect.gen(function* () {
        const response = yield* provider.stream(request).pipe(Stream.runCollect, Effect.forkScoped)
        const first = yield* openDriver(endpoint)
        const firstTurns = yield* attached(first)
        const seen = yield* nextRequest(firstTurns)

        const second = yield* openDriver(endpoint)
        const secondTurns = yield* attached(second)
        expect(yield* Effect.promise(() => firstTurns.next())).toEqual({done: true, value: undefined})
        const replayed = yield* nextRequest(secondTurns)
        expect(replayed).toEqual(seen)

        yield* Effect.sync(() => second.websocket.close())
        yield* Effect.promise(() => second.closed)
        const third = yield* openDriver(endpoint)
        const again = yield* nextRequest(yield* attached(third))
        expect(again).toEqual(seen)

        yield* Effect.promise(() => third.client.llm.finish({id: again.id, reason: 'stop'}))
        expect(Array.from(yield* Fiber.join(response))).toEqual([{type: 'finish', reason: 'stop'}])
      }),
    ),
  )

  it.live('removes an invocation when its response stream is interrupted', () =>
    withProvider((endpoint, provider) =>
      Effect.gen(function* () {
        const drive = yield* openDriver(endpoint)
        const turns = yield* attached(drive)
        const response = yield* provider.stream(request).pipe(Stream.runDrain, Effect.forkScoped)
        yield* nextRequest(turns)

        yield* Fiber.interrupt(response)

        expect(yield* Effect.promise(() => drive.client.llm.pending())).toEqual({invocations: []})
      }),
    ),
  )

  it.live('releases a backpressured response when its consumer is interrupted', () =>
    withProvider((endpoint, provider) =>
      Effect.gen(function* () {
        const drive = yield* openDriver(endpoint)
        const turns = yield* attached(drive)
        const started = yield* Deferred.make<void>()
        const response = yield* provider.stream(request).pipe(
          Stream.runForEach(() => Deferred.succeed(started, undefined).pipe(Effect.andThen(Effect.never))),
          Effect.forkScoped,
        )
        const opened = yield* nextRequest(turns)
        const items = Array.from({length: 300}, (_, index) => ({type: 'textDelta' as const, text: String(index)}))
        const chunk = yield* Effect.promise(() =>
          drive.client.llm.chunk({id: opened.id, items}).then(
            () => 'sent',
            () => 'refused',
          ),
        ).pipe(Effect.forkScoped)
        yield* Deferred.await(started)
        expect(chunk.pollUnsafe()).toBeUndefined()

        yield* Fiber.interrupt(response)
        expect(['sent', 'refused']).toContain(yield* Fiber.join(chunk))
      }),
    ),
  )

  it.live('fails the provider stream when the driver disconnects the invocation', () =>
    withProvider((endpoint, provider) =>
      Effect.gen(function* () {
        const drive = yield* openDriver(endpoint)
        const turns = yield* attached(drive)
        const response = yield* provider.stream(request).pipe(Stream.runCollect, Effect.flip, Effect.forkScoped)
        const opened = yield* nextRequest(turns)

        yield* Effect.promise(() => drive.client.llm.disconnect({id: opened.id}))

        expect(yield* Fiber.join(response)).toEqual({
          _tag: 'SimulatedProvider.ProviderDisconnected',
          message: 'Simulated model provider disconnected',
        })
      }),
    ),
  )
})
